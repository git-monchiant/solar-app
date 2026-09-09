import { sql } from "@/lib/db";
import { fetchTransferByUnit, fetchTransfers, fetchUnits, houseKey, isCancelledPromo, isSolarPromo, phoneKey,
  promoOmYears, promoSolarKw, type RemOwner, type RemPromotion, type RemTransfer, type RemUnit } from "@/lib/om/rem";

// ดึงทะเบียน REM ลง staging (om_rem_units / om_rem_transfers / om_rem_owners)
// ★ staging เป็น "ของที่ REM ส่งมา" ล้วน ๆ — ไม่แตะ om_houses/om_installations ตรงนี้
//   การเอาไปแก้ข้อมูลจริงเป็นอีกขั้นหนึ่ง ต้องผ่านการเทียบก่อนเสมอ

export type SyncResult = { projectId: string; units: number; transfers: number; owners: number; promotions: number; skipped: string | null };

// REM ส่งวันแบบ "2016-01-08T00:00:00" ไม่มีโซน — เป็นเวลาไทยเสมอ ต้องตีเป็น +07:00
// ★ ถ้าปล่อยให้ JS ตีเอง จะกลายเป็น UTC แล้ววันเลื่อนไป 1 วัน (เคยเจอกับไฟล์ Excel มาแล้ว 125/125 แถว)
function thaiDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/);
  return m ? `${m[1]}T${m[2] ?? "00:00:00"}+07:00` : null;
}

// ★ เวอร์ชันของกติกาแยกของแถม — บันทึกลงทุกแถวเพื่อให้รู้ว่า om_years/is_solar มาจากกติกาไหน
//   v1 = ก่อน 8 ก.ย. 69 (จับแค่ "O&M n ปี" · นับ "ส่วนลดแทน Solar" เป็นโซลาร์)
//   v2 = 8 ก.ย. 69 เป็นต้นไป
export const PARSER_VERSION = "v2";

async function replaceProject<T>(
  tx: sql.Transaction, table: string, projectId: string, rows: T[],
  bind: (r: sql.Request, row: T) => sql.Request, cols: string, vals: string,
) {
  await new sql.Request(tx).input("p", sql.NVarChar(20), projectId)
    .query(`DELETE FROM ${table} WHERE project_id = @p`);
  for (const row of rows) {
    await bind(new sql.Request(tx), row).query(`INSERT INTO ${table} (${cols}) VALUES (${vals})`);
  }
}

// เขียนเจ้าของ 1 คนลง staging — แยกออกมาเพราะเรียกจากทั้งชุดทั้งโครงการและชุดที่ยิงรายหลัง
async function writeOwner(tx: sql.Transaction, contractId: string, o: RemOwner) {
  await new sql.Request(tx)
    .input("a", sql.NVarChar(80), contractId).input("b", sql.NVarChar(60), o.customerItemID ?? null)
    .input("c", sql.NVarChar(200), o.firstName ?? null).input("d", sql.NVarChar(200), o.lastName ?? null)
    .input("e", sql.Bit, o.isMainCustomer ? 1 : 0)
    .input("f", sql.NVarChar(20), /^\d{13}$/.test(String(o.citizenID)) ? o.citizenID! : null)
    .input("g", sql.NVarChar(40), o.passportID || null).input("h", sql.NVarChar(30), o.phoneNo1 || null)
    .input("i", sql.NVarChar(20), phoneKey(o.phoneNo1) || null).input("j", sql.NVarChar(200), o.email || null)
    .input("k", sql.NVarChar(100), o.nationalityName || null)
    .query(`INSERT INTO om_rem_owners (contract_id, customer_item_id, first_name, last_name, is_main, citizen_id, passport_id, phone, phone_key, email, nationality_name)
            VALUES (@a,@b,@c,@d,@e,@f,@g,@h,@i,@j,@k)`);
}

// ยิงเติมเจ้าของรายหลังพร้อมกันได้กี่เส้น — เท่ากับที่ใช้กับ promotions
const OWNER_CONCURRENCY = 4;

export async function syncProject(db: sql.ConnectionPool, projectId: string): Promise<SyncResult> {
  const body = JSON.stringify({ projectID: projectId, unitID: "", unitNumber: "", houseNumber: "" });
  let units: RemUnit[], transfers: RemTransfer[];
  try {
    [units, transfers] = await Promise.all([fetchUnits(projectId), fetchTransfers(projectId)]);
  } catch (e) {
    // ★ หลักฐาน — ยิงล้มก็ต้องมีร่องรอย ไม่ใช่เงียบหาย
    await logScan(db, { kind: "units", projectId, body, ok: false, error: String(e).slice(0, 380) });
    throw e;
  }
  await logScan(db, { kind: "units", projectId, body, ok: true, nReturned: units.length });
  await logScan(db, { kind: "transfers", projectId, body, ok: true, nReturned: transfers.length });

  // ★ กันข้อมูลหาย: ถ้า REM ตอบว่างทั้งที่เคยมี แปลว่าน่าจะพลาด ไม่ใช่ว่าโครงการโล่ง — ข้ามไป
  const had = await db.request().input("p", sql.NVarChar(20), projectId).query(`
    SELECT (SELECT COUNT(*) FROM om_rem_units WHERE project_id=@p) u,
           (SELECT COUNT(*) FROM om_rem_transfers WHERE project_id=@p) t`);
  const { u: hadU, t: hadT } = had.recordset[0] as { u: number; t: number };
  if (!units.length && hadU > 0) return { projectId, units: 0, transfers: 0, owners: 0, promotions: 0, skipped: `REM ตอบ unit ว่าง ทั้งที่เคยมี ${hadU} — ไม่เขียนทับ` };
  if (!transfers.length && hadT > 0) return { projectId, units: 0, transfers: 0, owners: 0, promotions: 0, skipped: `REM ตอบสัญญาว่าง ทั้งที่เคยมี ${hadT} — ไม่เขียนทับ` };

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await replaceProject<RemUnit>(tx, "om_rem_units", projectId, units,
      (r, u) => r.input("a", sql.NVarChar(60), u.unitID).input("b", sql.NVarChar(20), u.projectID)
        .input("c", sql.NVarChar(200), u.projectName ?? null).input("d", sql.NVarChar(4), u.projectType ?? null)
        .input("e", sql.NVarChar(60), u.unitNumber ?? null).input("f", sql.NVarChar(100), u.houseNumber ?? null)
        .input("g", sql.NVarChar(100), houseKey(u.houseNumber) || null).input("h", sql.NVarChar(100), u.phaseName ?? null)
        .input("i", sql.NVarChar(200), u.modelName ?? null).input("j", sql.NVarChar(100), u.modelTypeName ?? null)
        .input("k", sql.Decimal(12, 2), u.titledeedArea ?? null).input("l", sql.NVarChar(sql.MAX), JSON.stringify(u)),
      "unit_id, project_id, project_name, project_type, unit_number, house_number, house_number_key, phase_name, model_name, model_type_name, titledeed_area, raw",
      "@a,@b,@c,@d,@e,@f,@g,@h,@i,@j,@k,@l");

    // เจ้าของ + โปรโมชัน ผูกกับสัญญา — ลบตามโครงการผ่าน contract_id ของโครงการนั้น
    await new sql.Request(tx).input("p", sql.NVarChar(20), projectId).query(
      `DELETE o FROM om_rem_owners o JOIN om_rem_transfers t ON t.contract_id = o.contract_id WHERE t.project_id = @p;
       DELETE pr FROM om_rem_promotions pr JOIN om_rem_transfers t ON t.contract_id = pr.contract_id WHERE t.project_id = @p;`);

    await replaceProject<RemTransfer>(tx, "om_rem_transfers", projectId, transfers,
      (r, t) => r.input("a", sql.NVarChar(80), t.contractID).input("b", sql.NVarChar(20), t.projectID)
        .input("c", sql.NVarChar(200), t.projectName ?? null).input("d", sql.NVarChar(4), t.projectType ?? null)
        .input("e", sql.NVarChar(60), t.unitID ?? null).input("f", sql.NVarChar(60), t.unitNumber ?? null)
        .input("g", sql.NVarChar(100), t.houseNumber ?? null).input("h", sql.NVarChar(100), houseKey(t.houseNumber) || null)
        .input("i", sql.DateTimeOffset, thaiDate(t.transferDate)).input("j", sql.DateTimeOffset, thaiDate(t.condominiumRegisterDate))
        .input("k", sql.NVarChar(40), t.latitude || null).input("l", sql.NVarChar(40), t.longitude || null)
        // ★ ตัด owners กับ promotions ออกจาก raw — promotions มีราคาฝังอยู่ ซึ่งเราไม่เก็บ
        .input("m", sql.NVarChar(sql.MAX), JSON.stringify({ ...t, owners: undefined, promotions: undefined })),
      "contract_id, project_id, project_name, project_type, unit_id, unit_number, house_number, house_number_key, transfer_date, condo_register_date, latitude, longitude, raw",
      "@a,@b,@c,@d,@e,@f,@g,@h,@i,@j,@k,@l,@m");

    // ★★ 9 ก.ย. 69 — ยิงทั้งโครงการได้ owners ไม่ครบ (อาการเดียวกับ promotions ที่เจอ 2 ก.ย.)
    //   หลักฐาน LIFK6: 45/216 กับ 45/209 ได้ 0 คน · 45/215 ได้ 4 คนทั้งที่มีจริง 2 (ส่งซ้ำ)
    //   ยิงรายหลัง (unitID) ได้ครบถูกต้องทุกครั้ง ⇒ เติมของที่ขาดด้วยการยิงรายหลัง
    //   ทำหลังจากใส่ชุดที่ได้จากทั้งโครงการแล้ว จะได้ยิงเฉพาะสัญญาที่ยังว่าง
    const ownersByContract = new Map<string, RemOwner[]>();
    for (const t of transfers) {
      const list = (t.owners ?? []).filter((o) => !o.contractID || String(o.contractID) === t.contractID);
      if (list.length) ownersByContract.set(t.contractID, list);
    }
    const missing = transfers.filter((t) => !ownersByContract.has(t.contractID) && t.unitID);
    for (let i = 0; i < missing.length; i += OWNER_CONCURRENCY) {
      const chunk = missing.slice(i, i + OWNER_CONCURRENCY);
      const got = await Promise.all(chunk.map(async (t) => {
        try {
          const one = await fetchTransferByUnit(projectId, t.unitID!);
          const row = one.find((x) => String(x.contractID) === t.contractID);
          return { cid: t.contractID, list: (row?.owners ?? []).filter((o) => !o.contractID || String(o.contractID) === t.contractID) };
        } catch { return { cid: t.contractID, list: [] as RemOwner[] }; }
      }));
      for (const g of got) if (g.list.length) ownersByContract.set(g.cid, g.list);
    }

    let owners = 0;
    for (const [cid, list] of ownersByContract) {
      const seen = new Set<string>();
      for (const o of list) {
        // REM ส่งเจ้าของซ้ำได้ — ตัดออกก่อนเขียน ไม่งั้นบ้านหลังเดียวได้ชื่อซ้ำ
        const k = `${o.customerItemID ?? ""}|${o.firstName ?? ""}|${o.lastName ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        await writeOwner(tx, cid, o);
        owners++;
      }
    }
    // ── โปรโมชันที่แถมตอนขาย (★ ที่เดียวที่บอกว่าแถมโซลาร์ไหม)
    //    REM ส่งแถวซ้ำหลายแถวต่อโปรฯ เดียว — กันซ้ำด้วยคีย์ก่อนค่อย insert
    let promotions = 0;
    for (const t of transfers) {
      const seen = new Set<string>();
      for (const p of t.promotions ?? []) {
        const key = `${p.pDetailID ?? 0}|${p.promotionID ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await new sql.Request(tx)
          .input("a", sql.NVarChar(80), t.contractID).input("b", sql.Int, p.pDetailID ?? 0)
          .input("c", sql.NVarChar(40), p.promotionID ?? "").input("d", sql.NVarChar(40), p.mPromotionID ?? null)
          .input("e", sql.NVarChar(4), p.promotionType ?? null).input("f", sql.NVarChar(400), p.promotionName ?? null)
          .input("g", sql.NVarChar(400), p.description1 ?? null).input("h", sql.NVarChar(400), p.description2 ?? null)
          .input("k", sql.Bit, p.isStandard ? 1 : 0)
          .input("l", sql.Bit, isSolarPromo(p) ? 1 : 0)
          .input("m", sql.Decimal(8, 2), isSolarPromo(p) ? promoSolarKw(p) : null)
          .input("n", sql.Int, promoOmYears(p))
          .input("o", sql.Bit, isCancelledPromo(p) ? 1 : 0)
          .query(`INSERT INTO om_rem_promotions (contract_id, p_detail_id, promotion_id, m_promotion_id,
                    promotion_type, promotion_name, description1, description2, is_standard,
                    is_solar, solar_kw, om_years, is_cancelled)
                  VALUES (@a,@b,@c,@d,@e,@f,@g,@h,@k,@l,@m,@n,@o)`);
        promotions++;
      }
    }

    await tx.commit();
    return { projectId, units: units.length, transfers: transfers.length, owners, promotions, skipped: null };
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export async function logSync(
  db: sql.ConnectionPool, kind: string, scope: string, actor: number | null,
): Promise<number> {
  const r = await db.request().input("k", sql.NVarChar(30), kind).input("s", sql.NVarChar(100), scope)
    .input("u", sql.Int, actor)
    .query(`INSERT INTO om_sync_log (kind, scope, status, actor_user_id) OUTPUT INSERTED.id VALUES (@k, @s, 'running', @u)`);
  return r.recordset[0].id as number;
}

export async function finishSync(
  db: sql.ConnectionPool, id: number,
  v: { status: "ok" | "error"; fetched?: number; inserted?: number; skipped?: number; message?: string },
) {
  await db.request().input("i", sql.Int, id).input("st", sql.NVarChar(20), v.status)
    .input("f", sql.Int, v.fetched ?? 0).input("n", sql.Int, v.inserted ?? 0)
    .input("sk", sql.Int, v.skipped ?? 0).input("m", sql.NVarChar(1000), v.message?.slice(0, 1000) ?? null)
    .query(`UPDATE om_sync_log SET status=@st, finished_at=SYSDATETIMEOFFSET(),
                   n_fetched=@f, n_inserted=@n, n_skipped=@sk, message=@m WHERE id=@i`);
}


// ─────────────────────────────────────────────────────────────
// ดึงโปรโมชัน "รายหลัง" — ตัวเดียวที่ได้ข้อมูลครบ
// ★ ทำเป็นชุด ๆ ได้ · ทำงานต่อได้ถ้าหลุด (ดูจาก om_rem_transfers.promo_synced_at)
// วัดจริง 2 ก.ย.: ยิงพร้อมกัน 4 เส้น เฉลี่ย 1.7 วิ/คำขอ → 8,186 หลัง ≈ 64 นาที
//   8 เส้นเร็วขึ้นแค่ 6 นาที แต่ latency ต่อคำขอพุ่งเกือบเท่าตัว = เซิร์ฟเวอร์เขาเริ่มอั้น ไม่ควรกด
export const PROMO_CONCURRENCY = 4;

export type PromoTarget = { project_id: string; unit_id: string; contract_id: string };
export type PromoResult = { done: number; rows: number; solar: number; failed: number; remaining: number };

async function writePromos(db: sql.ConnectionPool, contractId: string, promos: RemPromotion[]) {
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("c", sql.NVarChar(80), contractId)
      .query(`DELETE FROM om_rem_promotions WHERE contract_id = @c`);
    const seen = new Set<string>();
    let n = 0;
    for (const p of promos) {
      // REM ส่งแถวซ้ำหลายแถวต่อโปรฯ เดียว
      const key = `${p.pDetailID ?? 0}|${p.promotionID ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const solar = isSolarPromo(p);
      await new sql.Request(tx)
        .input("a", sql.NVarChar(80), contractId).input("b", sql.Int, p.pDetailID ?? 0)
        .input("c", sql.NVarChar(40), String(p.promotionID ?? "")).input("d", sql.NVarChar(40), p.mPromotionID ?? null)
        .input("e", sql.NVarChar(4), p.promotionType ?? null).input("f", sql.NVarChar(400), p.promotionName ?? null)
        .input("g", sql.NVarChar(400), p.description1 ?? null).input("h", sql.NVarChar(400), p.description2 ?? null)
        .input("k", sql.Bit, p.isStandard ? 1 : 0)
        .input("l", sql.Bit, solar ? 1 : 0).input("m", sql.Decimal(8, 2), solar ? promoSolarKw(p) : null)
        .input("n", sql.Int, promoOmYears(p)).input("o", sql.Bit, isCancelledPromo(p) ? 1 : 0)
        // ★ หลักฐาน (8 ก.ย. 69) — เก็บ JSON ดิบเฉพาะแถวโซลาร์ เพราะเป็นแถวที่กระทบสิทธิ์ลูกค้า
        //   เก็บทุกแถวจะโต 32,139 แถว · เฉพาะโซลาร์ ~2,500 แถว (ผู้ใช้เคาะ)
        .input("q", sql.NVarChar(sql.MAX), solar ? JSON.stringify(p) : null)
        .input("r", sql.VarChar(10), PARSER_VERSION)
        .query(`INSERT INTO om_rem_promotions (contract_id, p_detail_id, promotion_id, m_promotion_id,
                  promotion_type, promotion_name, description1, description2, is_standard,
                  is_solar, solar_kw, om_years, is_cancelled, raw, parser_version, parsed_at)
                VALUES (@a,@b,@c,@d,@e,@f,@g,@h,@k,@l,@m,@n,@o,@q,@r,SYSDATETIMEOFFSET())`);
      n++;
    }
    await new sql.Request(tx).input("c", sql.NVarChar(80), contractId).input("n", sql.Int, n)
      .query(`UPDATE om_rem_transfers SET promo_synced_at = SYSDATETIMEOFFSET(), promo_count = @n WHERE contract_id = @c`);
    await tx.commit();
    return n;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ★ หลักฐานการยิง REM — ตอบได้ว่า "ของแถมหลังนี้มาจากการยิงครั้งไหน ด้วย body อะไร"
export async function logScan(db: sql.ConnectionPool, x: {
  kind: string; projectId?: string | null; contractId?: string | null; unitId?: string | null;
  body?: string | null; ok?: boolean | null; nReturned?: number | null;
  nPromos?: number | null; nSolar?: number | null; nYears?: number | null; error?: string | null;
}) {
  try {
    await db.request()
      .input("a", sql.VarChar(12), x.kind)
      .input("b", sql.NVarChar(40), x.projectId ?? null)
      .input("c", sql.NVarChar(80), x.contractId ?? null)
      .input("d", sql.NVarChar(80), x.unitId ?? null)
      .input("e", sql.NVarChar(400), x.body ?? null)
      .input("f", sql.Bit, x.ok == null ? null : x.ok ? 1 : 0)
      .input("g", sql.Int, x.nReturned ?? null).input("h", sql.Int, x.nPromos ?? null)
      .input("k", sql.Int, x.nSolar ?? null).input("l", sql.Int, x.nYears ?? null)
      .input("m", sql.NVarChar(400), x.error ?? null)
      .query(`INSERT INTO om_rem_scan_log (scan_kind, project_id, contract_id, unit_id,
                request_body, http_ok, n_returned, n_promos, n_solar, n_om_years, error, finished_at)
              VALUES (@a,@b,@c,@d,@e,@f,@g,@h,@k,@l,@m, SYSDATETIMEOFFSET())`);
  } catch { /* log ล้มเหลวต้องไม่ทำให้ sync ล้ม */ }
}

export async function syncPromotionsByUnit(
  db: sql.ConnectionPool, limit: number, opts: { onlyOm?: boolean; redo?: boolean } = {},
): Promise<PromoResult> {
  const r = await db.request().input("n", sql.Int, limit).query(`
    SELECT TOP (@n) t.project_id, t.unit_id, t.contract_id
    FROM om_rem_transfers t
    ${opts.onlyOm ? `JOIN om_houses h ON h.project_id = t.project_id
       AND REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2 = t.house_number_key
       AND h.is_om = 1` : ""}
    WHERE t.unit_id IS NOT NULL ${opts.redo ? "" : "AND t.promo_synced_at IS NULL"}
    ORDER BY t.promo_synced_at, t.contract_id`);
  const targets = r.recordset as unknown as PromoTarget[];

  let rows = 0, solar = 0, failed = 0, done = 0;
  for (let i = 0; i < targets.length; i += PROMO_CONCURRENCY) {
    const batch = targets.slice(i, i + PROMO_CONCURRENCY);
    const got = await Promise.all(batch.map(async (t) => {
      try {
        const list = await fetchTransferByUnit(t.project_id, t.unit_id);
        const hit = list.find((x) => x.contractID === t.contract_id) ?? list[0];
        return { t, promos: hit?.promotions ?? [] };
      } catch { return { t, promos: null }; }
    }));
    for (const gt of got) {
      // ★ หลักฐาน — บันทึกทุกครั้งที่ยิง REM ว่ายิงอะไรไป ได้อะไรกลับมา (ผู้ใช้สั่ง 8 ก.ย. 69)
      const body = JSON.stringify({ projectID: gt.t.project_id, unitID: gt.t.unit_id,
        unitNumber: "", houseNumber: "" });
      const nSolar = gt.promos ? gt.promos.filter(isSolarPromo).length : null;
      const nYears = gt.promos ? gt.promos.filter((p) => promoOmYears(p) != null).length : null;
      if (gt.promos === null) {
        failed++;
        await logScan(db, { kind: "promos", projectId: gt.t.project_id, contractId: gt.t.contract_id,
          unitId: gt.t.unit_id, body, ok: false, error: "fetch ล้มเหลว" });
        continue;
      }
      try {
        const n = await writePromos(db, gt.t.contract_id, gt.promos);
        rows += n;
        solar += nSolar! > 0 ? 1 : 0;
        done++;
        await logScan(db, { kind: "promos", projectId: gt.t.project_id, contractId: gt.t.contract_id,
          unitId: gt.t.unit_id, body, ok: true, nPromos: n, nSolar, nYears });
      } catch (e) {
        failed++;
        await logScan(db, { kind: "promos", projectId: gt.t.project_id, contractId: gt.t.contract_id,
          unitId: gt.t.unit_id, body, ok: false, error: String(e).slice(0, 380) });
      }
    }
  }
  const left = await db.request().query(
    `SELECT COUNT(*) n FROM om_rem_transfers WHERE unit_id IS NOT NULL AND promo_synced_at IS NULL`);
  return { done, rows, solar, failed, remaining: left.recordset[0].n as number };
}
