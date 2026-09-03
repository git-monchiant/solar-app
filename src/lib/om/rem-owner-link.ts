import { sql } from "@/lib/db";

// สร้างลูกค้า "เจ้าของ" จากเจ้าของตามสัญญาของ REM (om_rem_owners) แล้วผูกกับบ้าน
// ใช้กับบ้านที่: โอนแล้ว (มี rem_contract_id) · REM มีเจ้าของ · แต่ระบบยังไม่มีลูกค้าผูก
//
// กติกาที่ผู้ใช้เคาะ 2 ก.ย.:
//   1) เจ้าของจาก REM = role 'owner'
//   2) ★ เบอร์ติดต่อล่าสุด ยึด "ตัวที่ผูกอยู่แล้ว" ก่อน (เช่นเบอร์ที่ curate ไว้ / ยืนยันผ่าน LINE)
//      เบอร์ของ REM เป็นของ ณ วันโอน อาจเก่า — เพิ่มเข้าไปได้ แต่ไม่ตั้ง primary ถ้ามีตัวอื่นอยู่แล้ว
// ★ ไม่แตะ dbo ของระบบขาย · อ่าน om_rem_owners (ดึงเข้ามาแล้ว) ไม่ยิง REM ซ้ำ

const TITLE_RE = /^(คุณ|นายแพทย์|แพทย์หญิง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|นาย|นาง|ดร\.|พญ\.|นพ\.|บริษัท|บจก\.|หจก\.)\s*/;
const stripTitle = (s: string | null | undefined) => String(s ?? "").trim().replace(TITLE_RE, "").trim();

export type OwnerLinkResult = { houses: number; created: number; reused: number; phonesAdded: number; skipped: number };

type Target = {
  house_id: number; contract_id: string; house_phone: string | null;
  first_name: string | null; last_name: string | null; citizen_id: string | null; phone_key: string | null;
};

async function linkOne(db: sql.ConnectionPool, t: Target): Promise<"created" | "reused" | "skipped"> {
  const fullName = `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim();
  if (!fullName) return "skipped";
  const cid = /^\d{13}$/.test(String(t.citizen_id ?? "")) ? t.citizen_id! : null;

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    // หา/สร้างลูกค้า: เลขบัตรก่อน (ชัวร์สุด) ไม่งั้นสร้างใหม่
    let custId: number | undefined;
    let outcome: "created" | "reused";
    if (cid) {
      const f = await new sql.Request(tx).input("c", sql.NVarChar(30), cid)
        .query(`SELECT TOP 1 id FROM om_customers WHERE id_card = @c ORDER BY id`);
      custId = f.recordset[0]?.id as number | undefined;
    }
    if (custId) {
      outcome = "reused";
    } else {
      const r = await new sql.Request(tx)
        .input("n", sql.NVarChar(300), fullName)
        .input("f", sql.NVarChar(200), stripTitle(t.first_name) || t.first_name || null)
        .input("l", sql.NVarChar(200), t.last_name ?? null)
        .input("c", sql.NVarChar(30), cid)
        .query(`INSERT INTO om_customers (full_name, first_name, last_name, id_card, note)
                OUTPUT INSERTED.id VALUES (@n, @f, @l, @c, N'เจ้าของตามสัญญา REM (สร้างอัตโนมัติ)')`);
      custId = r.recordset[0].id as number;
      outcome = "created";
    }

    // ── เบอร์: REM phone เข้าเสมอ (source 'rem') · primary ยึดของที่มีอยู่ก่อน
    // ★ ถ้าลูกค้ามี primary อยู่แล้ว หรือบ้านมี h.phone (curate ไว้) → ตัวนั้นคือเบอร์ล่าสุด ไม่ให้ REM แย่ง primary
    const hasCurated = await new sql.Request(tx).input("cu", sql.Int, custId).input("h", sql.Int, t.house_id)
      .query(`SELECT (SELECT COUNT(*) FROM om_customer_phones WHERE customer_id = @cu AND is_primary = 1) p,
                     (SELECT COUNT(*) FROM om_houses WHERE id = @h AND phone IS NOT NULL AND phone <> N'') hp`);
    const existingPrimary = (hasCurated.recordset[0].p as number) > 0;
    const houseHasPhone = (hasCurated.recordset[0].hp as number) > 0;

    if (t.phone_key && /^\d{10}$/.test(t.phone_key)) {
      const dup = await new sql.Request(tx).input("cu", sql.Int, custId).input("p", sql.NVarChar(30), t.phone_key)
        .query(`SELECT TOP 1 id FROM om_customer_phones WHERE customer_id = @cu AND phone = @p`);
      if (!dup.recordset[0]) {
        // primary เฉพาะเมื่อยังไม่มีเบอร์ curate ที่ไหนเลย
        const primary = !existingPrimary && !houseHasPhone ? 1 : 0;
        await new sql.Request(tx).input("cu", sql.Int, custId).input("p", sql.NVarChar(30), t.phone_key)
          .input("pr", sql.Bit, primary)
          .query(`INSERT INTO om_customer_phones (customer_id, phone, is_primary, source)
                  VALUES (@cu, @p, @pr, 'rem')`);
      }
    }

    // ── เติมเลขบัตรที่เพิ่งรู้ ถ้าลูกค้าเดิมยังไม่มี
    if (cid) {
      await new sql.Request(tx).input("i", sql.Int, custId).input("c", sql.NVarChar(30), cid)
        .query(`UPDATE om_customers SET id_card = ISNULL(id_card, @c), updated_at = SYSDATETIMEOFFSET() WHERE id = @i`);
    }

    // ── ผูกกับบ้าน role owner
    await new sql.Request(tx).input("h", sql.Int, t.house_id).input("c", sql.Int, custId)
      .query(`IF NOT EXISTS (SELECT 1 FROM om_house_customers WHERE house_id = @h AND customer_id = @c AND is_current = 1)
                INSERT INTO om_house_customers (house_id, customer_id, role, is_current, source)
                VALUES (@h, @c, 'owner', 1, 'rem_owner')`);
    await new sql.Request(tx).input("h", sql.Int, t.house_id).input("c", sql.Int, custId)
      .query(`UPDATE om_houses SET primary_customer_id = ISNULL(primary_customer_id, @c) WHERE id = @h`);

    await tx.commit();
    return outcome;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function linkOwnersFromRem(
  db: sql.ConnectionPool, limit: number, opts: { dryRun?: boolean } = {},
): Promise<OwnerLinkResult & { preview?: unknown[] }> {
  // เจ้าของหลัก (is_main) ของแต่ละบ้านที่ยังไม่มีลูกค้าผูก
  const r = await db.request().input("n", sql.Int, limit).query(`
    SELECT TOP (@n) h.id house_id, i.rem_contract_id contract_id, h.phone house_phone,
           o.first_name, o.last_name, o.citizen_id, o.phone_key
    FROM om_houses h
    JOIN om_installations i ON i.house_id = h.id AND i.rem_contract_id IS NOT NULL
    CROSS APPLY (SELECT TOP 1 o.first_name, o.last_name, o.citizen_id, o.phone_key
                 FROM om_rem_owners o WHERE o.contract_id = i.rem_contract_id
                 ORDER BY o.is_main DESC, o.id) o
    WHERE h.is_om = 1
      AND NOT EXISTS (SELECT 1 FROM om_house_customers hc WHERE hc.house_id = h.id AND hc.is_current = 1)
    ORDER BY h.id`);
  const targets = r.recordset as unknown as Target[];

  if (opts.dryRun) {
    return { houses: targets.length, created: 0, reused: 0, phonesAdded: 0, skipped: 0,
      preview: targets.map((t) => ({
        house_id: t.house_id, name: `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
        has_cid: /^\d{13}$/.test(String(t.citizen_id ?? "")), has_phone: /^\d{10}$/.test(String(t.phone_key ?? "")),
      })) };
  }

  let created = 0, reused = 0, phonesAdded = 0, skipped = 0;
  for (const t of targets) {
    try {
      const o = await linkOne(db, t);
      if (o === "created") created++; else if (o === "reused") reused++; else { skipped++; continue; }
      if (t.phone_key && /^\d{10}$/.test(t.phone_key)) phonesAdded++;
    } catch { skipped++; }
  }
  return { houses: targets.length, created, reused, phonesAdded, skipped };
}
