import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// บ้านรายหลัง — ดูครบ (ระบบติดตั้ง · สิทธิ์ ledger · ลูกค้า · นัด) + แก้ข้อมูลบ้าน

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);

  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT h.id, h.house_number, h.project_name raw_project, h.project_id, h.project_code,
           ISNULL(pj.name_th, h.project_name) project_name, h.segment, h.is_vip, h.has_solar,
           h.unit_status, h.note, h.address, h.lead_id, h.is_om,
           h.latitude, h.longitude, h.model_name, h.titledeed_area,
           h.om_excluded_reason, CONVERT(varchar(33), h.om_excluded_at, 126) om_excluded_at,
           u.full_name om_excluded_by_name
    FROM om_houses h LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    LEFT JOIN users u ON u.id = h.om_excluded_by WHERE h.id = @id;

    SELECT i.id, i.rem_size_kwp kwp, i.promo_size_kw, i.promo_om_years, i.promo_name, i.promo_contract_id,
           i.inverter_kw, i.inverter_brand, i.inverter_sn,
           CONVERT(char(10), i.install_date, 23) install_date,
           CONVERT(char(10), i.transfer_date, 23) transfer_date,
           CONVERT(char(10), i.warranty_start, 23) warranty_start,
           i.warranty_doc_no, i.battery_brand, i.battery_kwh, i.rem_contract_id, i.lead_id, i.note,
           -- ที่มาของข้อมูล: มาจาก REM / ไฟล์ import ชุดไหน / เช็คกับ REM ล่าสุดเมื่อไร
           i.rem_contract_status, CONVERT(char(10), i.rem_transfer_date, 23) rem_transfer_date,
           CONVERT(varchar(33), i.rem_checked_at, 126) rem_checked_at,
           i.source_batch_id, ib.source_file batch_file, ib.note batch_note,
           CONVERT(char(10), ib.created_at, 23) batch_at
    FROM om_installations i
    LEFT JOIN om_import_batches ib ON ib.id = i.source_batch_id
    WHERE i.house_id = @id ORDER BY i.id;

    SELECT g.id, g.qty, g.source, g.reason, g.installation_id,
           CONVERT(char(10), g.created_at, 23) created_at
    FROM om_entitlement_grants g JOIN om_installations i ON i.id = g.installation_id
    WHERE i.house_id = @id ORDER BY g.id;

    SELECT rd.id, CONVERT(char(10), rd.service_date, 23) service_date, rd.status, rd.installation_id
    FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
    WHERE i.house_id = @id AND rd.status <> 'void' ORDER BY rd.service_date;

    SELECT hc.id link_id, hc.role, c.id customer_id, c.full_name,
           (SELECT TOP 1 p.phone FROM om_customer_phones p WHERE p.customer_id = c.id
            ORDER BY p.is_primary DESC, p.id) phone
    FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
    WHERE hc.house_id = @id AND hc.is_current = 1 ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id;

    SELECT TOP 5 b.id, CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at, b.status,
           st.label_th service_type
    FROM om_bookings b LEFT JOIN om_service_type st ON st.id = b.service_type_id
    WHERE b.house_id = @id ORDER BY b.scheduled_at DESC;

    -- ★ ของแถมตอนขาย — ผู้ใช้เคาะ 2 ก.ย.: ไม่ต้องโชว์รายการและ "ห้ามโชว์ราคา"
    --   ทีม O&M ไม่ต้องรู้ว่าลูกค้าได้ชุดครัว/แอร์ราคาเท่าไหร่ · เอาแค่ "เจอรายการของแถมใน REM"
    --   กับข้อมูลโซลาร์ซึ่งเป็นที่มาของขนาดระบบ  ⇒ ไม่ส่ง price / ชื่อรายการอื่นออกไปที่เบราว์เซอร์เลย
    SELECT COUNT(*) n_items,
           SUM(CASE WHEN pr.is_solar = 1 AND pr.is_cancelled = 0 THEN 1 ELSE 0 END) n_solar,
           MAX(CASE WHEN pr.is_solar = 1 AND pr.is_cancelled = 0 THEN pr.solar_kw END) solar_kw,
           MAX(CASE WHEN pr.is_solar = 1 AND pr.is_cancelled = 0 THEN pr.om_years END) om_years,
           MAX(CASE WHEN pr.is_solar = 1 AND pr.is_cancelled = 0
                    THEN ISNULL(NULLIF(pr.promotion_name, N''), pr.description1) END) solar_name,
           MAX(pr.contract_id) contract_id
    FROM om_rem_promotions pr
    WHERE pr.contract_id IN (SELECT i.rem_contract_id FROM om_installations i WHERE i.house_id = @id AND i.rem_contract_id IS NOT NULL)
       OR pr.contract_id IN (
            SELECT t2.contract_id FROM om_rem_transfers t2 JOIN om_houses h2 ON h2.id = @id
            WHERE h2.project_id IS NOT NULL AND t2.project_id = h2.project_id
              -- ★ house_number_key เป็น Latin1_General_BIN2 ส่วน house_number เป็น Thai_CI_AS
              --   ถ้าไม่ใส่ COLLATE จะได้ collation conflict (error 468) ตอนเทียบ
              AND t2.house_number_key = REPLACE(h2.house_number, N' ', N'') COLLATE Latin1_General_BIN2);`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const house = rs[0][0];
  if (!house) return NextResponse.json({ error: "ไม่พบบ้าน" }, { status: 404 });

  return NextResponse.json({
    house: fixDates([house])[0],
    systems: rs[1],
    grants: rs[2],
    redemptions: rs[3],
    customers: rs[4],
    bookings: fixDates(rs[5]),
    promo: (rs[6][0]?.n_items ? rs[6][0] : null),
  });
}

// PATCH { house_number?, segment?, unit_status?, note?, is_vip?, has_solar?, restore?, exclude? }
//   restore: true → เอากลับเข้าระบบ O&M (ล้างเหตุผลที่ซ่อน)
//   exclude: "เหตุผล" → ซ่อนออกจากงาน O&M · ★ ซ่อน ไม่ใช่ลบ ข้อมูลทุกอย่างอยู่ครบ
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const cur = await db.request().input("id", sql.Int, id)
    .query(`SELECT house_number, segment, unit_status, note, is_vip, has_solar, is_om, om_excluded_reason
            FROM om_houses WHERE id = @id AND (is_om = 1 OR om_excluded_reason IS NOT NULL)`);
  const old = cur.recordset[0];
  if (!old) return NextResponse.json({ error: "ไม่พบบ้าน" }, { status: 404 });

  // เอากลับเข้าระบบ / สั่งซ่อน — ทำแยกจากการแก้ฟิลด์ปกติ
  if (b.restore === true || typeof b.exclude === "string") {
    const on = b.restore === true;
    await db.request().input("id", sql.Int, id).input("u", sql.Int, gate.userId ?? null)
      .input("r", sql.NVarChar(300), on ? null : String(b.exclude).slice(0, 300))
      .query(`UPDATE om_houses
                 SET is_om = ${on ? 1 : 0},
                     om_excluded_reason = @r,
                     om_excluded_at = ${on ? "NULL" : "SYSDATETIMEOFFSET()"},
                     om_excluded_by = ${on ? "NULL" : "@u"},
                     updated_at = SYSDATETIMEOFFSET()
               WHERE id = @id`);
    return NextResponse.json({ ok: true, is_om: on });
  }

  const seg = b.segment !== undefined ? String(b.segment) : old.segment;
  if (!["house", "condo", "sales_office", "facility"].includes(seg)) {
    return NextResponse.json({ error: "segment ไม่ถูกต้อง" }, { status: 400 });
  }

  await db.request().input("id", sql.Int, id)
    .input("hn", sql.NVarChar(50), b.house_number !== undefined ? (String(b.house_number).trim() || null) : old.house_number)
    .input("seg", sql.NVarChar(20), seg)
    .input("us", sql.NVarChar(20), b.unit_status !== undefined ? (String(b.unit_status).trim() || null) : old.unit_status)
    .input("nt", sql.NVarChar(sql.MAX), b.note !== undefined ? (String(b.note).trim() || null) : old.note)
    .input("vip", sql.Bit, b.is_vip !== undefined ? (b.is_vip ? 1 : 0) : old.is_vip)
    .input("sol", sql.Bit, b.has_solar !== undefined ? (b.has_solar ? 1 : 0) : old.has_solar)
    .query(`UPDATE om_houses SET house_number = @hn, segment = @seg, unit_status = @us,
              note = @nt, is_vip = @vip, has_solar = @sol, updated_at = SYSDATETIMEOFFSET()
            WHERE id = @id`);

  return NextResponse.json({ ok: true });
}
