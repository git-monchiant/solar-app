import { sql } from "@/lib/db";
import { matchLead, type Candidate, type MatchResult, type LeadInput, type Tier } from "@/lib/om/rem-match";

// ตัดคำนำหน้าชื่อไทย — ต้องตรงกับ dbo.om_strip_title() ที่ใช้ในฝั่ง SQL
const TITLE_RE = /^(คุณ|นายแพทย์|แพทย์หญิง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|นาย|นาง|ดร\.|พญ\.|นพ\.|บริษัท|บจก\.|หจก\.)\s*/;
const stripTitle = (s: string | null | undefined) => String(s ?? "").trim().replace(TITLE_RE, "").trim();

// กวาดงานขายที่ "ติดตั้งเสร็จแล้ว" เข้ามาเป็นบ้าน O&M อัตโนมัติ
// ตัดสิน 1 ก.ย.: ระบบขายติดตั้งเสร็จ → ถ้าเป็นบ้านในทะเบียน ให้เพิ่มเข้า O&M เอง · รอบละ 1 ชั่วโมง
// ★ กันซ้ำด้วย om_installations.lead_id — รันกี่รอบก็ไม่เพิ่มซ้ำ
// ★ ไม่มั่นใจ = ไม่แตะข้อมูลจริง → เข้า om_match_queue ให้คนตัดสิน (ไม่หายเงียบ)
// ★ ห้ามเขียนอะไรลง leads / projects — เป็นตารางของระบบขาย อ่านได้อย่างเดียว

export type SweepOutcome = {
  lead_id: number; name: string; tier: MatchResult["tier"]; reason: string;
  action: "created" | "linked" | "queued" | "skipped"; house_id?: number; installation_id?: number;
  contract_id?: string | null; note?: string;
};

type LeadRow = LeadInput & {
  full_name: string | null; install_completed_at: Date | null; install_actual_date: Date | null;
  warranty_inverter_brand: string | null; warranty_inverter_sn: string | null;
  warranty_system_size_kwp: number | null; warranty_start_date: Date | null;
  warranty_om_per_year: number | null; warranty_duration_years: number | null;
  warranty_doc_no: string | null; warranty_inverter_kw: number | null;
  warranty_battery_brand: string | null; warranty_battery_kwh: number | null;
  installation_address: string | null;
};

const PENDING_LEADS = `
  SELECT l.id, l.full_name, l.project_id, l.house_number, l.phone, l.id_card_number,
         l.install_completed_at, l.install_actual_date, l.installation_address,
         l.warranty_inverter_brand, l.warranty_inverter_sn, l.warranty_system_size_kwp,
         l.warranty_start_date, l.warranty_om_per_year, l.warranty_duration_years,
         l.warranty_doc_no, l.warranty_inverter_kw, l.warranty_battery_brand, l.warranty_battery_kwh
  FROM leads l
  WHERE l.install_completed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM om_installations i WHERE i.lead_id = l.id)`;

async function upsertQueue(db: sql.ConnectionPool, m: MatchResult) {
  const best = m.best;
  await db.request()
    .input("l", sql.Int, m.lead_id).input("t", sql.NVarChar(12), m.tier)
    .input("r", sql.NVarChar(300), m.reason.slice(0, 300))
    .input("c", sql.NVarChar(80), best?.contract_id ?? null)
    .input("p", sql.NVarChar(20), best?.project_id ?? null)
    .input("h", sql.NVarChar(100), best?.house_number ?? null)
    .input("j", sql.NVarChar(sql.MAX), JSON.stringify(m.candidates.slice(0, 20)))
    .query(`
      UPDATE om_match_queue SET tier=@t, reason=@r, cand_contract=@c, cand_project=@p, cand_house=@h, candidates=@j
      WHERE lead_id=@l AND status='pending';
      IF @@ROWCOUNT = 0 AND NOT EXISTS (SELECT 1 FROM om_match_queue WHERE lead_id=@l)
        INSERT INTO om_match_queue (lead_id, tier, reason, cand_contract, cand_project, cand_house, candidates)
        VALUES (@l, @t, @r, @c, @p, @h, @j);`);
}

// สร้าง/หา บ้าน · ลูกค้า · ระบบติดตั้ง · สิทธิ์ — ในทรานแซกชันเดียว
// ใช้ร่วมกันทั้งรอบกวาดอัตโนมัติ และตอนแอดมินกด "รับ" ในคิว
export type CommitOpts = {
  candidate: Candidate | null;      // null = ไม่ผูกกับ REM (ลูกค้าทั่วไป นอกโครงการ)
  houseId?: number;                 // ระบุบ้านเองจากคิว
  tier: Tier; reason: string; actor?: number | null;
  queueStatus?: "auto" | "accepted" | "rejected";
};

export async function commitLead(db: sql.ConnectionPool, lead: LeadRow, o: CommitOpts): Promise<SweepOutcome> {
  const c = o.candidate;
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    // ── บ้าน: ถ้าแอดมินเลือกมาแล้วใช้ตัวนั้น · ไม่งั้นหาโดย unit ของ REM แล้วค่อยโครงการ+บ้านเลขที่
    let houseId = o.houseId;
    if (!houseId && c) {
      const found = await new sql.Request(tx)
        .input("u", sql.NVarChar(100), c.unit_id ?? null)
        .input("p", sql.NVarChar(20), c.project_id)
        .input("h", sql.NVarChar(100), c.house_number ?? null)
        .query(`SELECT TOP 1 id FROM om_houses
                WHERE (@u IS NOT NULL AND rem_unit_id = @u)
                   OR (project_id = @p AND house_number = @h)
                ORDER BY CASE WHEN rem_unit_id = @u THEN 0 ELSE 1 END, id`);
      houseId = found.recordset[0]?.id as number | undefined;
    }
    const action: SweepOutcome["action"] = houseId ? "linked" : "created";

    if (houseId) {
      await new sql.Request(tx).input("id", sql.Int, houseId).input("l", sql.Int, lead.id)
        .input("u", sql.NVarChar(100), c?.unit_id ?? null)
        .query(`UPDATE om_houses SET is_om = 1, lead_id = ISNULL(lead_id, @l),
                       rem_unit_id = ISNULL(rem_unit_id, @u), has_solar = 1, updated_at = SYSDATETIMEOFFSET()
                WHERE id = @id`);
    } else {
      const ins = await new sql.Request(tx)
        .input("n", sql.NVarChar(300), lead.full_name ?? null)
        .input("h", sql.NVarChar(100), c?.house_number ?? lead.house_number ?? null)
        .input("a", sql.NVarChar(sql.MAX), lead.installation_address ?? null)
        .input("p", sql.NVarChar(20), c?.project_id ?? null)
        .input("pn", sql.NVarChar(300), c?.project_name ?? null)
        .input("u", sql.NVarChar(100), c?.unit_id ?? null)
        .input("l", sql.Int, lead.id)
        .input("src", sql.NVarChar(40), o.candidate ? "sales_sweep" : "sales_sweep_general")
        .input("nt", sql.NVarChar(400), o.candidate
          ? "สร้างอัตโนมัติจากงานขายที่ติดตั้งเสร็จ"
          : "จากงานขายที่ติดตั้งเสร็จ · ไม่ใช่บ้านในโครงการ (ลูกค้าทั่วไป)")
        .query(`INSERT INTO om_houses (segment, full_name, house_number, address, project_id, project_name,
                                       rem_unit_id, has_solar, is_om, is_vip, lead_id, project_map_source, note)
                OUTPUT INSERTED.id
                VALUES ('house', @n, @h, @a, @p, @pn, @u, 1, 1, 0, @l, @src, @nt)`);
      houseId = ins.recordset[0].id as number;
    }

    // ── ลูกค้า
    // ★ ลำดับสำคัญ: ต้องหา "เจ้าของบ้านหลังนี้ที่มีอยู่แล้ว" ก่อนเสมอ
    //   ข้อมูลนำเข้าเก่าหลายรายไม่มีเบอร์/เลขบัตร ถ้าหาด้วยเบอร์อย่างเดียวจะสร้างคนซ้ำ
    //   (เจอจริงตอนทดสอบ: "เชนิสา มัณยานนท์" กับ "คุณเชนิสา มัณยานนท์" กลายเป็น 2 คน)
    const cid = String(lead.id_card_number ?? "").replace(/[-\s]/g, "");
    const cidOk = /^\d{13}$/.test(cid);
    const phone = String(lead.phone ?? "").replace(/\D/g, "");
    const cust = await new sql.Request(tx)
      .input("h", sql.Int, houseId)
      .input("n", sql.NVarChar(300), stripTitle(lead.full_name))
      .input("c", sql.NVarChar(30), cidOk ? cid : null)
      .input("ph", sql.NVarChar(30), phone.length >= 9 ? phone : null)
      .query(`
        SELECT TOP 1 c.id, prio FROM (
          -- 1. เจ้าของบ้านหลังนี้ที่ชื่อตรงกัน (ตัดคำนำหน้าออกแล้ว)
          SELECT c.id, 0 prio FROM om_customers c
            JOIN om_house_customers hc ON hc.customer_id = c.id AND hc.house_id = @h AND hc.is_current = 1
           WHERE @n <> N'' AND REPLACE(dbo.om_strip_title(c.full_name), N' ', N'') = REPLACE(@n, N' ', N'')
          UNION ALL
          -- 2. เลขบัตรตรง (ทั้งระบบ)
          SELECT c.id, 1 FROM om_customers c WHERE @c IS NOT NULL AND c.id_card = @c
          UNION ALL
          -- 3. เบอร์ตรง (ทั้งระบบ)
          SELECT c.id, 2 FROM om_customers c
            JOIN om_customer_phones p ON p.customer_id = c.id WHERE @ph IS NOT NULL AND p.phone = @ph
        ) c ORDER BY prio, c.id`);
    let custId = cust.recordset[0]?.id as number | undefined;
    // เจอคนเดิม → เติมเลขบัตรที่เพิ่งรู้ให้ (ของเก่าหลายรายไม่มี)
    if (custId && cidOk) {
      await new sql.Request(tx).input("i", sql.Int, custId).input("c", sql.NVarChar(30), cid)
        .query(`UPDATE om_customers SET id_card = ISNULL(id_card, @c), updated_at = SYSDATETIMEOFFSET() WHERE id = @i`);
    }
    if (!custId) {
      const parts = String(lead.full_name ?? "").trim().split(/\s+/);
      const r = await new sql.Request(tx)
        .input("n", sql.NVarChar(300), lead.full_name ?? null)
        .input("f", sql.NVarChar(200), parts[0] ?? null)
        .input("ls", sql.NVarChar(200), parts.length > 1 ? parts.slice(1).join(" ") : null)
        .input("c", sql.NVarChar(30), cidOk ? cid : null)
        .query(`INSERT INTO om_customers (full_name, first_name, last_name, id_card, note)
                OUTPUT INSERTED.id VALUES (@n, @f, @ls, @c, N'สร้างอัตโนมัติจากงานขาย')`);
      custId = r.recordset[0].id as number;
    }
    if (phone.length >= 9) {
      await new sql.Request(tx).input("c", sql.Int, custId).input("p", sql.NVarChar(30), phone)
        .query(`IF NOT EXISTS (SELECT 1 FROM om_customer_phones WHERE customer_id=@c AND phone=@p)
                  INSERT INTO om_customer_phones (customer_id, phone, source) VALUES (@c, @p, 'sales_sweep')`);
    }
    await new sql.Request(tx).input("h", sql.Int, houseId).input("c", sql.Int, custId)
      .query(`IF NOT EXISTS (SELECT 1 FROM om_house_customers WHERE house_id=@h AND customer_id=@c AND is_current=1)
                INSERT INTO om_house_customers (house_id, customer_id, role, is_current, source)
                VALUES (@h, @c, 'owner', 1, 'sales_sweep')`);
    await new sql.Request(tx).input("h", sql.Int, houseId).input("c", sql.Int, custId)
      .query(`UPDATE om_houses SET primary_customer_id = ISNULL(primary_customer_id, @c) WHERE id = @h`);

    // ── ระบบติดตั้ง
    // ★ warranty_start เป็น computed column (ตัวหลังสุดระหว่าง install_date กับ transfer_date/rem_transfer_date)
    //   เขียนตรง ๆ ไม่ได้ — ใส่ install_date กับ rem_transfer_date แล้วมันคำนวณเอง
    const instIns = await new sql.Request(tx)
      .input("h", sql.Int, houseId).input("l", sql.Int, lead.id)
      .input("d", sql.Date, lead.install_actual_date ?? lead.install_completed_at ?? null)
      .input("ib", sql.NVarChar(200), lead.warranty_inverter_brand ?? null)
      .input("isn", sql.NVarChar(200), lead.warranty_inverter_sn ?? null)
      .input("ikw", sql.Decimal(10, 2), lead.warranty_inverter_kw ?? null)
      .input("kwp", sql.Decimal(10, 2), lead.warranty_system_size_kwp ?? null)
      .input("bb", sql.NVarChar(200), lead.warranty_battery_brand ?? null)
      .input("bk", sql.Decimal(10, 2), lead.warranty_battery_kwh ?? null)
      .input("doc", sql.NVarChar(100), lead.warranty_doc_no ?? null)
      .input("ct", sql.NVarChar(80), c?.contract_id ?? null)
      .input("td", sql.DateTimeOffset, c?.transfer_date ?? null)
      .query(`INSERT INTO om_installations (house_id, lead_id, install_date, inverter_brand, inverter_sn,
                        inverter_kw, rem_size_kwp, battery_brand, battery_kwh, warranty_doc_no,
                        rem_contract_id, rem_transfer_date, rem_contract_status, rem_checked_at, note)
              OUTPUT INSERTED.id
              VALUES (@h, @l, @d, @ib, @isn, @ikw, @kwp, @bb, @bk, @doc, @ct, @td,
                      CASE WHEN @ct IS NULL THEN NULL ELSE N'transferred' END, SYSDATETIMEOFFSET(),
                      N'สร้างอัตโนมัติจากงานขายที่ติดตั้งเสร็จ')`);
    const instId = instIns.recordset[0].id as number;

    // ── สิทธิ์ล้างแผง: qty = ครั้งต่อปี × จำนวนปี (ตามที่ข้อมูลนำเข้าใช้: contract_term 2 → qty 4)
    // ★ ถ้าฝั่งขายไม่ได้กรอก จะไม่เดาให้ — สร้างบ้านไว้ก่อน แล้วแจ้งว่ายังไม่มีสิทธิ์
    const per = Number(lead.warranty_om_per_year), yrs = Number(lead.warranty_duration_years);
    let note: string | undefined;
    if (Number.isFinite(per) && Number.isFinite(yrs) && per > 0 && yrs > 0) {
      await new sql.Request(tx).input("i", sql.Int, instId).input("q", sql.Int, per * yrs)
        .input("t", sql.NVarChar(40), String(yrs))
        .query(`INSERT INTO om_entitlement_grants (installation_id, qty, source, contract_term, reason)
                VALUES (@i, @q, 'contract_base', @t, N'จากสัญญาในระบบขาย')`);
    } else {
      note = "ระบบขายไม่ได้กรอกจำนวนครั้ง/ปีสัญญา — ยังไม่ให้สิทธิ์ ต้องเติมเอง";
    }

    await new sql.Request(tx).input("l", sql.Int, lead.id).input("h", sql.Int, houseId)
      .input("t", sql.NVarChar(12), o.tier).input("r", sql.NVarChar(300), o.reason.slice(0, 300))
      .input("st", sql.NVarChar(12), o.queueStatus ?? "auto")
      .input("c", sql.NVarChar(80), c?.contract_id ?? null).input("p", sql.NVarChar(20), c?.project_id ?? null)
      .input("hn", sql.NVarChar(100), c?.house_number ?? null).input("u", sql.Int, o.actor ?? null)
      .query(`IF EXISTS (SELECT 1 FROM om_match_queue WHERE lead_id=@l)
                UPDATE om_match_queue SET status=@st, house_id=@h, tier=@t, reason=@r,
                       decided_by=@u, decided_at=SYSDATETIMEOFFSET() WHERE lead_id=@l
              ELSE
                INSERT INTO om_match_queue (lead_id, tier, status, reason, cand_contract, cand_project, cand_house, house_id, decided_by, decided_at)
                VALUES (@l, @t, @st, @r, @c, @p, @hn, @h, @u, SYSDATETIMEOFFSET())`);

    await tx.commit();
    return { lead_id: lead.id, name: lead.full_name ?? "", tier: o.tier, reason: o.reason,
      action, house_id: houseId, installation_id: instId, contract_id: c?.contract_id ?? null, note };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function runSweep(db: sql.ConnectionPool, opts: { dryRun?: boolean } = {}) {
  const leads = (await db.request().query(PENDING_LEADS)).recordset as unknown as LeadRow[];
  const out: SweepOutcome[] = [];
  for (const lead of leads) {
    const m = await matchLead(db, lead);
    if (m.tier === "confident" && m.best && !opts.dryRun) {
      out.push(await commitLead(db, lead, { candidate: m.best, tier: m.tier, reason: m.reason, queueStatus: "auto" }));
    } else if (m.tier === "confident" && m.best) {
      out.push({ lead_id: lead.id, name: lead.full_name ?? "", tier: m.tier, reason: m.reason,
        action: "created", contract_id: m.best.contract_id, note: "dry-run — ยังไม่เขียน" });
    } else {
      if (!opts.dryRun) await upsertQueue(db, m);
      out.push({ lead_id: lead.id, name: lead.full_name ?? "", tier: m.tier, reason: m.reason,
        action: "queued", contract_id: m.best?.contract_id ?? null });
    }
  }
  return { scanned: leads.length, results: out };
}

// ดึง lead รายตัวสำหรับปุ่มในคิว (คอลัมน์ชุดเดียวกับตอนกวาด)
export async function getLead(db: sql.ConnectionPool, leadId: number): Promise<LeadRow | null> {
  const r = await db.request().input("id", sql.Int, leadId).query(`
    SELECT l.id, l.full_name, l.project_id, l.house_number, l.phone, l.id_card_number,
           l.install_completed_at, l.install_actual_date, l.installation_address,
           l.warranty_inverter_brand, l.warranty_inverter_sn, l.warranty_system_size_kwp,
           l.warranty_start_date, l.warranty_om_per_year, l.warranty_duration_years,
           l.warranty_doc_no, l.warranty_inverter_kw, l.warranty_battery_brand, l.warranty_battery_kwh
    FROM leads l WHERE l.id = @id`);
  return (r.recordset[0] as unknown as LeadRow) ?? null;
}

export type { LeadRow };
