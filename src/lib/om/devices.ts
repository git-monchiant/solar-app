// Serial อุปกรณ์รายตัวของระบบติดตั้ง O&M — แผน docs/plan/20261021-03-om-equipment-serial-tab.md
// ★ ตาราง om_installation_devices แยกจาก lead_inverters/panels/batteries ของฝั่งขาย
//   ใบรับประกันสาธารณะ (/warranty/[id]) อ่านตารางฝั่งขายสด — O&M แก้ที่ตารางนั้นใบที่ส่งลูกค้าไปแล้วจะเปลี่ยนตาม
// ★ om_installations.inverter_* / battery_* ยังเป็นช่องที่หน้าอื่นอ่าน (การ์ดระบบติดตั้ง · ค้นหา · ตัวกรองไม่มีสเปก)
//   ⇒ ทุกครั้งที่แถวอุปกรณ์เปลี่ยน เขียนแถวแรกกลับลงช่องพวกนี้ (syncInstallationSpec)
import { sql } from "@/lib/db";

export type DeviceKey = "inverters" | "batteries" | "panels";
export const DEVICE_KEYS: DeviceKey[] = ["inverters", "batteries", "panels"];
/** ชื่อชนิดใน om_installation_devices.device_type */
export const DEVICE_TYPE: Record<DeviceKey, "inverter" | "battery" | "panel"> = {
  inverters: "inverter", batteries: "battery", panels: "panel",
};
export const DEVICE_LABEL: Record<DeviceKey, string> = {
  inverters: "Inverter", batteries: "Battery", panels: "Solar Panel",
};

type SpecSource = { kind: "manual" | "sales"; ref: string; method: string; userId?: number | null };

/**
 * เขียนแถวแรก (ตาม position) ของอินเวอร์เตอร์/แบตเตอรี่กลับลง om_installations + จด om_field_sources ช่องที่เปลี่ยน
 * · ไม่มีแถวอินเวอร์เตอร์แล้ว → ล้างแค่ SN · ยี่ห้อ/kW คงไว้ (758 ระบบรู้แค่ค่านี้ ไม่มี Serial)
 * · แถวไม่มียี่ห้อ/ขนาด → คงค่าเดิมของระบบ
 */
export async function syncInstallationSpec(rq: () => sql.Request, installationId: number, src: SpecSource): Promise<void> {
  await rq()
    .input("i", sql.Int, installationId)
    .input("kind", sql.VarChar(20), src.kind)
    .input("ref", sql.NVarChar(200), src.ref)
    .input("method", sql.NVarChar(80), src.method)
    .input("u", sql.Int, src.userId ?? null)
    .query(`
      DECLARE @old TABLE (inverter_brand NVARCHAR(100), inverter_sn NVARCHAR(200), inverter_kw DECIMAL(6,2),
                          battery_brand NVARCHAR(60), battery_kwh DECIMAL(6,2));
      INSERT INTO @old SELECT inverter_brand, inverter_sn, inverter_kw, battery_brand, battery_kwh
                         FROM om_installations WHERE id = @i;
      DECLARE @hasInv BIT = CASE WHEN EXISTS (SELECT 1 FROM om_installation_devices
                                              WHERE installation_id = @i AND device_type = 'inverter') THEN 1 ELSE 0 END;

      UPDATE i SET
        inverter_sn    = inv.serial_no,
        inverter_brand = ISNULL(LEFT(inv.brand, 100), i.inverter_brand),
        inverter_kw    = ISNULL(CASE WHEN inv.spec > 0 AND inv.spec < 10000 THEN CAST(inv.spec AS DECIMAL(6,2)) END, i.inverter_kw),
        battery_brand  = ISNULL(LEFT(bat.brand, 60), i.battery_brand),
        battery_kwh    = ISNULL(CASE WHEN bat.spec > 0 AND bat.spec < 10000 THEN CAST(bat.spec AS DECIMAL(6,2)) END, i.battery_kwh),
        updated_at     = SYSDATETIMEOFFSET()
      FROM om_installations i
      OUTER APPLY (SELECT TOP 1 brand, spec, serial_no FROM om_installation_devices
                    WHERE installation_id = i.id AND device_type = 'inverter' ORDER BY position, id) inv
      OUTER APPLY (SELECT TOP 1 brand, spec FROM om_installation_devices
                    WHERE installation_id = i.id AND device_type = 'battery' ORDER BY position, id) bat
      WHERE i.id = @i
        -- ไม่มีแถวอินเวอร์เตอร์และ SN ว่างอยู่แล้ว = ไม่มีอะไรต้องเขียน (กัน updated_at ขยับเปล่า ๆ)
        AND (@hasInv = 1 OR i.inverter_sn IS NOT NULL
             OR EXISTS (SELECT 1 FROM om_installation_devices WHERE installation_id = @i AND device_type = 'battery'));

      -- ★ inverter_sn เป็น Latin1_General_BIN2 คอลัมน์อื่น Thai_CI_AS — ต้อง COLLATE ให้ตรงกันใน VALUES
      INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value,
                                    source_kind, source_ref, match_method, confidence, actor_user_id)
      SELECT i.house_id, i.id, 'om_installations', v.col, v.nv, v.ov, @kind, @ref, @method, 'confirmed', @u
        FROM om_installations i CROSS JOIN @old o
       CROSS APPLY (VALUES
         ('inverter_sn',    i.inverter_sn    COLLATE DATABASE_DEFAULT, o.inverter_sn    COLLATE DATABASE_DEFAULT),
         ('inverter_brand', i.inverter_brand COLLATE DATABASE_DEFAULT, o.inverter_brand COLLATE DATABASE_DEFAULT),
         ('inverter_kw',    CONVERT(NVARCHAR(40), i.inverter_kw), CONVERT(NVARCHAR(40), o.inverter_kw)),
         ('battery_brand',  i.battery_brand  COLLATE DATABASE_DEFAULT, o.battery_brand  COLLATE DATABASE_DEFAULT),
         ('battery_kwh',    CONVERT(NVARCHAR(40), i.battery_kwh), CONVERT(NVARCHAR(40), o.battery_kwh))
       ) v(col, nv, ov)
       WHERE i.id = @i AND EXISTS (SELECT v.nv EXCEPT SELECT v.ov);`);
}

/**
 * คัดลอก Serial จากงานขายมาเป็นชุดตั้งต้นของ O&M — ครั้งเดียวต่อระบบ (sales_devices_copied_at)
 * ★ รอให้ฝั่งขายออกใบรับประกันก่อน (status gridtie/closed — ฝั่งขายล็อกรายการ Serial ตอนนั้น)
 *   บ้านเข้า O&M ตอนติดตั้งเสร็จ ซึ่งมาก่อนขั้นรับประกันที่กรอก Serial — ต้องตามมาเติมทีหลัง
 * ★ O&M แก้เองไปแล้ว (มีแถว manual) = ไม่คัดลอกทับ แค่จดว่าตัดสินแล้ว
 *   แถว import (ตั้งต้นจาก om_installations.inverter_sn) ถูกแทนด้วยชุดของฝั่งขายซึ่งครบกว่า
 * คืนรายการระบบที่คัดลอกจริง — คนเรียกเขียนช่องสเปกกลับ (syncInstallationSpec) ต่อ
 */
export async function copySalesDevices(rq: () => sql.Request, installationId?: number):
  Promise<{ installation_id: number; lead_id: number }[]> {
  const r = rq();
  if (installationId) r.input("inst", sql.Int, installationId);
  const res = await r.query(`
    DECLARE @t TABLE (installation_id INT PRIMARY KEY, lead_id INT, manual BIT);
    INSERT INTO @t
    SELECT i.id, i.lead_id,
           CASE WHEN EXISTS (SELECT 1 FROM om_installation_devices d
                             WHERE d.installation_id = i.id AND d.source = 'manual') THEN 1 ELSE 0 END
      FROM om_installations i JOIN leads l ON l.id = i.lead_id
     WHERE l.om_only = 0 AND l.status IN ('gridtie', 'closed') AND i.sales_devices_copied_at IS NULL
       ${installationId ? "AND i.id = @inst" : ""};

    DELETE d FROM om_installation_devices d JOIN @t t ON t.installation_id = d.installation_id
     WHERE t.manual = 0 AND d.source = 'import';

    INSERT INTO om_installation_devices (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source)
    SELECT t.installation_id, 'inverter', x.brand, x.kw, x.serial_no, x.photo_url, x.photo_box,
           ROW_NUMBER() OVER (PARTITION BY t.installation_id ORDER BY x.position, x.id) - 1, 'sales'
      FROM @t t JOIN lead_inverters x ON x.lead_id = t.lead_id WHERE t.manual = 0;
    -- ใบรับประกันรุ่นแรกเก็บ SN อินเวอร์เตอร์ที่ leads.warranty_inverter_sn ช่องเดียว (เช่น lead 691) ไม่มีแถว lead_inverters
    INSERT INTO om_installation_devices (installation_id, device_type, brand, spec, serial_no, position, source)
    SELECT t.installation_id, 'inverter', l.warranty_inverter_brand, l.warranty_inverter_kw, l.warranty_inverter_sn, 0, 'sales'
      FROM @t t JOIN leads l ON l.id = t.lead_id
     WHERE t.manual = 0 AND l.warranty_inverter_sn IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM lead_inverters x WHERE x.lead_id = t.lead_id);
    INSERT INTO om_installation_devices (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source)
    SELECT t.installation_id, 'panel', x.brand, NULL, x.serial_no, x.photo_url, x.photo_box,
           ROW_NUMBER() OVER (PARTITION BY t.installation_id ORDER BY x.position, x.id) - 1, 'sales'
      FROM @t t JOIN lead_panels x ON x.lead_id = t.lead_id WHERE t.manual = 0;
    INSERT INTO om_installation_devices (installation_id, device_type, brand, spec, serial_no, photo_url, photo_box, position, source)
    SELECT t.installation_id, 'battery', x.brand, x.kwh, x.serial_no, x.photo_url, x.photo_box,
           ROW_NUMBER() OVER (PARTITION BY t.installation_id ORDER BY x.position, x.id) - 1, 'sales'
      FROM @t t JOIN lead_batteries x ON x.lead_id = t.lead_id WHERE t.manual = 0;

    UPDATE i SET sales_devices_copied_at = SYSDATETIMEOFFSET()
      FROM om_installations i JOIN @t t ON t.installation_id = i.id;

    SELECT installation_id, lead_id FROM @t WHERE manual = 0;`);
  return res.recordset as { installation_id: number; lead_id: number }[];
}

/** คัดลอกจากงานขาย + เขียนช่องสเปกกลับ — ใช้ในรอบกวาดงานขาย (syncSalesWarranty) */
export async function syncSalesDevices(rq: () => sql.Request, installationId?: number): Promise<number> {
  const copied = await copySalesDevices(rq, installationId);
  for (const c of copied) {
    await syncInstallationSpec(rq, c.installation_id,
      { kind: "sales", ref: `lead ${c.lead_id}`, method: "Serial จากใบรับประกันฝั่งขาย" });
  }
  return copied.length;
}
