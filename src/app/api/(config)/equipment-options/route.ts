import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// /api/equipment-options?lead_id=123
//
// ยี่ห้อ/รุ่น/ขนาด ของอุปกรณ์ที่บริษัทขายจริง — อ่านจากตาราง `packages` ซึ่งทีมขาย
// ดูแลผ่านหน้า config อยู่แล้ว แทนที่จะ hardcode ไว้ใน survey-options.ts (ลิสต์ตรงนั้น
// ตกยุคไปแล้ว: ไม่มี EAST ที่ขายอยู่ 6 แพ็กเกจ และ 4.8/9.6 kWh ก็ไม่มีในแพ็กเกจไหนเลย)
//
// lead_id (ไม่บังคับ) → แนบแพ็กเกจของลูกค้ารายนั้นมาด้วย ให้ฟอร์มเติม default ได้
// โดยไม่ต้องยิงอีกรอบ ใช้ interested_package_id ตามที่ใบรับประกันใช้อยู่ (ทีมสำรวจ
// เขียนทับด้วยแพ็กเกจที่ลูกค้าเคาะจริงตอนปิดการขาย)
//
// รวมแพ็กเกจที่ปิดใช้งานแล้วด้วย ไม่ได้กรอง is_active: งานที่ติดตั้งวันนี้คืองานที่
// ขายไปเมื่อหลายเดือนก่อน แพ็กเกจอาจถูกปิดไปแล้วแต่ของยังทยอยลงหน้างานอยู่ —
// JINKO เป็นตัวอย่างชัด ๆ (แพ็กเกจปิดหมดแล้ว แต่ใบรับประกัน 33 เคสและ serial
// 233 แถวเป็น JINKO) ถ้ากรองออก ช่างที่เปิดงานเก่าจะไม่มีรุ่นให้เลือกเลย
// ของที่ยังขายอยู่จะถูกจัดขึ้นก่อนในลิสต์

// ชนิดข้อมูลใช้ร่วมกับฝั่ง client — `import type` ถูกลบตอน compile จึงไม่ลาก
// api.ts (โค้ดฝั่ง browser) เข้ามาใน route นี้
import type { EquipmentOption, LeadPackageEquipment } from "@/lib/equipment-options";

interface Row { brand: string | null; model: string | null; spec: number | null; n: number; active: number }

const clean = (v: string | null) => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

// ชื่อยี่ห้อในตารางสะกดไม่นิ่ง ("HUAWEI" กับ "Huawei" ปนกัน) — ยุบเป็นตัวเดียวโดย
// เลือกตัวสะกดที่ใช้ในแพ็กเกจมากที่สุด ไม่ประดิษฐ์รูปแบบใหม่ขึ้นมาเอง เสมอกันก็เรียง
// ตามตัวอักษรเพื่อให้ผลลัพธ์เหมือนเดิมทุกครั้ง
function canonicalBrands(rows: Row[]): Map<string, string> {
  const tally = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const brand = clean(r.brand);
    if (!brand) continue;
    const key = brand.toLowerCase();
    const spellings = tally.get(key) ?? new Map<string, number>();
    spellings.set(brand, (spellings.get(brand) ?? 0) + r.n);
    tally.set(key, spellings);
  }
  const winner = new Map<string, string>();
  for (const [key, spellings] of tally) {
    const best = [...spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    winner.set(key, best[0]);
  }
  return winner;
}

function toOptions(rows: Row[]): EquipmentOption[] {
  const brandOf = canonicalBrands(rows);
  // active ใช้จัดลำดับอย่างเดียว ไม่ส่งออกไปฝั่ง client — ของที่ยังขายอยู่ขึ้นก่อน
  // ส่วนของที่เลิกขายแล้วต่อท้าย (ยังเลือกได้ เพราะงานเก่ายังติดตั้งไม่หมด)
  const seen = new Map<string, EquipmentOption & { active: boolean }>();
  for (const r of rows) {
    const raw = clean(r.brand);
    if (!raw) continue;
    const brand = brandOf.get(raw.toLowerCase()) ?? raw;
    const model = clean(r.model);
    const spec = typeof r.spec === "number" ? r.spec : null;
    const key = `${brand}|${model ?? ""}|${spec ?? ""}`;
    const prev = seen.get(key);
    if (prev) prev.active = prev.active || r.active > 0;
    else seen.set(key, { brand, model, spec, active: r.active > 0 });
  }
  return [...seen.values()]
    .sort((a, b) =>
      Number(b.active) - Number(a.active) ||
      a.brand.localeCompare(b.brand) || (a.spec ?? 0) - (b.spec ?? 0) || (a.model ?? "").localeCompare(b.model ?? "")
    )
    .map(({ brand, model, spec }) => ({ brand, model, spec }));
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const leadId = parseInt(req.nextUrl.searchParams.get("lead_id") ?? "");

    // packages.panel_model มาทีหลัง (migration 156) — เช็กก่อนว่ามีจริงไหม เพื่อให้
    // โค้ดนี้ deploy ขึ้นก่อน migration ได้โดยไม่พัง แค่ช่องรุ่นแผงจะยังไม่มีตัวเลือก
    const col = await db.request().query<{ c: number | null }>(
      `SELECT COL_LENGTH('dbo.packages', 'panel_model') AS c`
    );
    const hasPanelModel = col.recordset[0]?.c != null;
    // แทรกชื่อคอลัมน์ตรง ๆ ไม่ได้ตอนยังไม่มี — `GROUP BY NULL` กับ `p.NULL`
    // เป็น syntax error ทั้งคู่ จึงต้องแยกข้อความคิวรีเป็นสองแบบ
    const panelGrouped = hasPanelModel
      ? `SELECT panel_brand AS brand, panel_model AS model, panel_watt AS spec, COUNT(*) AS n,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
         FROM packages
         WHERE has_panel = 1 AND panel_brand IS NOT NULL AND LTRIM(RTRIM(panel_brand)) <> ''
         GROUP BY panel_brand, panel_model, panel_watt`
      : `SELECT panel_brand AS brand, CAST(NULL AS NVARCHAR(100)) AS model, panel_watt AS spec, COUNT(*) AS n,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
         FROM packages
         WHERE has_panel = 1 AND panel_brand IS NOT NULL AND LTRIM(RTRIM(panel_brand)) <> ''
         GROUP BY panel_brand, panel_watt`;
    const panelModelSelect = hasPanelModel ? "p.panel_model" : "CAST(NULL AS NVARCHAR(100))";

    const [batt, inv, pan] = await Promise.all([
      db.request().query<Row>(`
        SELECT battery_brand AS brand, battery_model AS model, battery_kwh AS spec, COUNT(*) AS n,
               SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
        FROM packages
        WHERE has_battery = 1 AND battery_brand IS NOT NULL AND LTRIM(RTRIM(battery_brand)) <> ''
        GROUP BY battery_brand, battery_model, battery_kwh
      `),
      db.request().query<Row>(`
        SELECT inverter_brand AS brand, inverter_model AS model, inverter_kw AS spec, COUNT(*) AS n,
               SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
        FROM packages
        WHERE has_inverter = 1 AND inverter_brand IS NOT NULL AND LTRIM(RTRIM(inverter_brand)) <> ''
        GROUP BY inverter_brand, inverter_model, inverter_kw
      `),
      db.request().query<Row>(panelGrouped),
    ]);

    let leadPackage: LeadPackageEquipment | null = null;
    if (!isNaN(leadId)) {
      const pkg = await db.request().input("id", sql.Int, leadId).query<LeadPackageEquipment>(`
        SELECT p.id, p.name,
               p.battery_brand, p.battery_model, p.battery_kwh,
               p.inverter_brand, p.inverter_model, p.inverter_kw,
               p.panel_brand, ${panelModelSelect} AS panel_model, p.panel_watt,
               p.has_battery, p.has_inverter, p.has_panel
        FROM leads l JOIN packages p ON p.id = l.interested_package_id
        WHERE l.id = @id
      `);
      leadPackage = pkg.recordset[0] ?? null;
    }

    return NextResponse.json({
      batteries: toOptions(batt.recordset),
      inverters: toOptions(inv.recordset),
      panels: toOptions(pan.recordset),
      leadPackage,
    });
  } catch (error) {
    console.error("GET /api/equipment-options error:", error);
    return NextResponse.json({ error: "Failed to fetch equipment options" }, { status: 500 });
  }
}
