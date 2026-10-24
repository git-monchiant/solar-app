import { houseKey, isCancelledPromo, isSolarPromo, promoOmYears, promoSolarKw, type RemPromotion } from "@/lib/om/rem";
import { sql } from "@/lib/db";

// REMAPIV2/BookingInfo — ★ ที่เดียวที่ให้ของแถม "ครบทุกรายการ" รวมโซลาร์
// พิสูจน์ 2 ก.ย.: บ้าน 146/1 itf ให้ของแถม 5 รายการ · BookingInfo ให้ 16 รายการ
//   รวม "ลูกค้าได้รับสิทธิ ติดตั้ง Solar Rooftop 3 kw." ที่ itf ตัดทิ้ง
// รับเลข SO- ที่เรามีอยู่แล้วใน om_rem_transfers.contract_id (8,186 ใบ)
//
// ★★ ความปลอดภัย: host เดียวกับ ContactInfo ที่พบว่าค้นไม่ตรงตัว (ใส่เลขมั่วได้ข้อมูลคนอื่น)
//   ⇒ guard: รับผลเฉพาะเมื่อ contract_id ที่ตอบกลับ "ตรงเป๊ะ" กับที่ขอไป ไม่งั้นทิ้ง
// ★ ผู้ใช้เคาะ: ไม่เก็บราคา (amount) — ตัดทิ้งตั้งแต่รับ

const V2_BASE = process.env.REM_V2_URL || "https://rem-web.sena-it.com/sena/REMAPIV2/sena";

export type BookingPromo = { name?: string; name_en?: string; amount?: number };
export type BookingInfo = {
  contract_id?: string; contract_status?: string; booking_number?: string; contract_number?: string;
  promotions?: BookingPromo[];
};

// แปลงของแถมจาก BookingInfo ให้เข้ารูป RemPromotion เดิม (เพื่อใช้ตัวแกะ kW/ปี/โซลาร์ ชุดเดียวกัน)
// ★ ทิ้ง amount ทันที — ไม่รับราคาเข้าระบบ
function toRemPromo(b: BookingPromo, i: number): RemPromotion {
  return { pDetailID: i + 1, promotionID: "V2", promotionType: "G",
    promotionName: b.name ?? "", description1: b.name ?? "", description2: b.name_en ?? "" };
}

export async function fetchBookingInfo(contractId: string): Promise<BookingInfo | null> {
  const url = `${V2_BASE}/BookingInfo?contract_id=${encodeURIComponent(contractId)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const j = await res.json().catch(() => null);
  if (!j || j.status !== 1) return null;
  const d = Array.isArray(j.data) ? j.data[0] : j.data;
  if (!d) return null;
  // ★★ guard กันข้อมูลผิดคน — ต้องตอบกลับด้วย contract_id เดียวกับที่ขอ
  if (String(d.contract_id ?? "") !== contractId) return null;
  return d as BookingInfo;
}

export function bookingPromosToRows(b: BookingInfo): RemPromotion[] {
  return (b.promotions ?? []).map(toRemPromo).filter((p) => (p.promotionName ?? "").trim());
}

// ตัวเดียวกับ fetchBookingInfo แต่คืนดิบ ๆ ให้ debug — ดูว่า API คืนอะไร ไม่มี guard
export async function fetchBookingInfoRaw(contractId: string): Promise<{ ok: boolean; status?: unknown; data?: Record<string, unknown>; note?: string }> {
  const res = await fetch(`${V2_BASE}/BookingInfo?contract_id=${encodeURIComponent(contractId)}`, { cache: "no-store" });
  if (!res.ok) return { ok: false, note: `http ${res.status}` };
  const j = await res.json().catch(() => null);
  if (!j) return { ok: false, note: "ไม่ใช่ JSON" };
  if (j.status !== 1) return { ok: false, status: j.status, note: String(j.message ?? "").slice(0, 120) };
  const d = Array.isArray(j.data) ? j.data[0] : j.data;
  return { ok: Boolean(d), data: d as Record<string, unknown> };
}

export type BookingResult = { done: number; rows: number; solar: number; failed: number; mismatch: number; remaining: number };

// มาร์คว่าเช็ค BookingInfo สัญญานี้แล้ว (ไม่ว่าจะมีของแถมหรือไม่) — กันดึงซ้ำไม่รู้จบ
async function markChecked(db: sql.ConnectionPool, contractId: string) {
  await db.request().input("c", sql.NVarChar(80), contractId)
    .query(`UPDATE om_rem_transfers SET booking_checked_at = SYSDATETIMEOFFSET() WHERE contract_id = @c`);
}

async function writeBookingPromos(db: sql.ConnectionPool, contractId: string, promos: RemPromotion[]) {
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("c", sql.NVarChar(80), contractId)
      .query(`DELETE FROM om_rem_promotions WHERE contract_id = @c AND source = 'v2'`);
    let n = 0;
    for (const p of promos) {
      const solar = isSolarPromo(p);
      await new sql.Request(tx)
        .input("a", sql.NVarChar(80), contractId).input("b", sql.Int, p.pDetailID ?? 0)
        .input("c", sql.NVarChar(40), String(p.promotionID ?? "V2"))
        .input("e", sql.NVarChar(4), "G").input("f", sql.NVarChar(400), p.promotionName ?? null)
        .input("g", sql.NVarChar(400), p.description1 ?? null).input("h", sql.NVarChar(400), p.description2 ?? null)
        .input("k", sql.Bit, 0).input("l", sql.Bit, solar ? 1 : 0)
        .input("m", sql.Decimal(8, 2), solar ? promoSolarKw(p) : null)
        .input("n", sql.Int, promoOmYears(p)).input("o", sql.Bit, isCancelledPromo(p) ? 1 : 0)
        .query(`INSERT INTO om_rem_promotions (contract_id, source, p_detail_id, promotion_id,
                  promotion_type, promotion_name, description1, description2, is_standard,
                  is_solar, solar_kw, om_years, is_cancelled)
                VALUES (@a, 'v2', @b, @c, @e, @f, @g, @h, @k, @l, @m, @n, @o)`);
      n++;
    }
    // มาร์คว่าเช็คแล้วในทรานแซกชันเดียวกับการเขียนของแถม
    await new sql.Request(tx).input("c", sql.NVarChar(80), contractId)
      .query(`UPDATE om_rem_transfers SET booking_checked_at = SYSDATETIMEOFFSET() WHERE contract_id = @c`);
    await tx.commit();
    return n;
  } catch (e) { await tx.rollback(); throw e; }
}

export const BOOKING_CONCURRENCY = 4;

export async function syncBookingPromos(
  db: sql.ConnectionPool, limit: number, opts: { onlyOm?: boolean; allContracts?: boolean } = {},
): Promise<BookingResult> {
  // ★★ พิสูจน์ 2 ก.ย.: BookingInfo คืนของแถมเฉพาะสัญญา SO- (สร้างใน REM โดยตรง 2564+)
  //   สัญญาเก่าที่ "migrate" เข้ามา (S0- / ไม่มี prefix) คืน promotions ว่างเสมอ — API ไม่มีข้อมูล
  //   (หน้าเว็บ REM โชว์จากข้อมูล migrate แต่ไม่ถูกใส่ตาราง promotions ที่ API ดึงได้)
  //   ⇒ ยิงเฉพาะ SO- เป็นค่าเริ่มต้น · allContracts=true ไว้ทดสอบ/เผื่ออนาคต REM เติมข้อมูล
  const onlySo = opts.allContracts ? "" : "AND t.contract_id LIKE 'SO-%'";
  const r = await db.request().input("n", sql.Int, limit).query(`
    SELECT TOP (@n) t.contract_id
    FROM om_rem_transfers t
    ${opts.onlyOm ? `JOIN om_houses h ON h.project_id = t.project_id
       AND REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2 = t.house_number_key AND h.is_om = 1` : ""}
    WHERE t.booking_checked_at IS NULL ${onlySo}
    ORDER BY t.contract_id`);
  const targets = r.recordset.map((x) => String(x.contract_id));

  let rows = 0, solar = 0, failed = 0, mismatch = 0, done = 0;
  for (let i = 0; i < targets.length; i += BOOKING_CONCURRENCY) {
    const batch = targets.slice(i, i + BOOKING_CONCURRENCY);
    const got = await Promise.all(batch.map(async (cid) => {
      try { return { cid, info: await fetchBookingInfo(cid) }; }
      catch { return { cid, info: undefined }; }
    }));
    for (const g of got) {
      if (g.info === undefined) { failed++; continue; }   // network error — ไม่มาร์ค ลองใหม่รอบหน้า
      if (g.info === null) { await markChecked(db, g.cid); mismatch++; continue; } // guard ตัด/รูปแบบเก่า API error → มาร์คว่าเช็คแล้ว
      try {
        const promos = bookingPromosToRows(g.info);
        rows += await writeBookingPromos(db, g.cid, promos);  // เขียนของแถม + มาร์ค booking_checked_at ในทรานแซกชันเดียว
        solar += promos.some(isSolarPromo) ? 1 : 0;
        done++;
      } catch { failed++; }
    }
  }
  const left = await db.request().query(
    `SELECT COUNT(*) n FROM om_rem_transfers t WHERE t.booking_checked_at IS NULL
       ${opts.allContracts ? "" : "AND t.contract_id LIKE 'SO-%'"}`);
  return { done, rows, solar, failed, mismatch, remaining: left.recordset[0].n as number };
}
