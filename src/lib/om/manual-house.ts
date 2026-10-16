import { sql } from "@/lib/db";
import { MANUAL_HOUSE_SOURCE } from "@/lib/om/house-origin";
import { isPlaceholderPhone } from "@/lib/utils/formatters";

// เพิ่มบ้าน/ลูกค้า O&M เองจากหน้าจอ (แผน 20261014-08) — ลูกค้าที่ไม่ได้มาจาก REM / งานขาย
//   (ติดตั้งโดยเจ้าอื่น · นอกโครงการเสนา) เดิมเข้าระบบไม่ได้เลย ต้องรันสคริปต์ลงฐานเอง
// ★ เช็คซ้ำชุดเดียว ใช้ทั้งตอนพิมพ์ (GET /api/om/houses/check) และตอนบันทึก (POST /api/om/houses ใน transaction)
// ★ เช็คกับ om_houses ทุกแถว รวม is_om = 0 (มีในทะเบียนแต่อยู่นอกขอบเขต O&M ~3,113 หลัง)
//   ไม่งั้นบ้านในโครงการเสนาจะซ้ำกับแถวจาก REM ที่มีอยู่แล้ว
// ★ บ้านเลขที่เทียบแบบตัดช่องว่าง — กติกาเดียวกับ rem-reconcile.ts (REM จะได้ไม่สร้างบ้านซ้ำภายหลัง)

export type HouseConflict = {
  kind: "house" | "phone" | "id_card";
  house_id: number | null;
  house_number: string | null;
  project_name: string | null;
  /** active = อยู่ในงาน O&M แล้ว · dormant = มีในทะเบียนแต่ยังไม่เปิดงาน O&M · hidden = ถูกซ่อนออกจากงาน O&M */
  house_state: "active" | "dormant" | "hidden" | null;
  customer_id: number | null;
  customer_name: string | null;
};

export const normPhone = (v: unknown) => String(v ?? "").replace(/\D/g, "");
export const normIdCard = (v: unknown) => String(v ?? "").replace(/[-\s]/g, "");
export const normHouseNumber = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");

const STATE = `CASE WHEN h.id IS NULL THEN NULL WHEN h.is_om = 1 THEN 'active'
                    WHEN h.om_excluded_reason IS NOT NULL THEN 'hidden' ELSE 'dormant' END`;
const OWNER = `(SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
                 WHERE hc.house_id = h.id AND hc.is_current = 1
                 ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id)`;

/**
 * บ้าน / คน ที่ชนกับข้อมูลที่กำลังกรอก
 * - house: โครงการเดียวกัน + บ้านเลขที่ตรงกัน (นอกโครงการไม่เช็ค — บ้านเลขที่ซ้ำกันได้คนละที่ ใช้เบอร์แทน)
 * - phone / id_card: ลูกค้าที่ยังใช้งาน (is_active = 1) พร้อมบ้านที่ผูกอยู่ (ไม่มีบ้าน = แถวเดียว house_id ว่าง)
 * lock = true → ใช้ใน transaction ตอนบันทึก (กันสองคนกดบันทึกบ้านเดียวกันพร้อมกัน)
 */
export async function findHouseConflicts(
  req: () => sql.Request,
  x: { phone: string; idCard: string; projectId: string | null; houseNumber: string },
  lock = false,
): Promise<HouseConflict[]> {
  const hint = lock ? "WITH (UPDLOCK, HOLDLOCK)" : "";
  const r = await req()
    // เบอร์ปลอม (0000000000 ฯลฯ) ไม่เอามาเทียบ — ไม่งั้นคนที่ไม่เกี่ยวกันจะชนกันเอง
    .input("ph", sql.NVarChar(20), /^0\d{9}$/.test(x.phone) && !isPlaceholderPhone(x.phone) ? x.phone : "")
    .input("cid", sql.NVarChar(20), /^\d{13}$/.test(x.idCard) ? x.idCard : "")
    .input("p", sql.NVarChar(20), x.projectId ?? "")
    .input("hk", sql.NVarChar(50), x.houseNumber.replace(/\s/g, ""))
    .query(`
      SELECT TOP 5 'house' kind, h.id house_id, h.house_number, ISNULL(pj.name_th, h.project_name) project_name,
             ${STATE} house_state, CAST(NULL AS int) customer_id, ${OWNER} customer_name
        FROM om_houses h ${hint}
        LEFT JOIN om_projects pj ON pj.project_id = h.project_id
       WHERE @p <> N'' AND @hk <> N'' AND h.project_id = @p
         AND REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2 = @hk
       ORDER BY h.is_om DESC, h.id;

      SELECT TOP 10 'phone' kind, h.id house_id, h.house_number, ISNULL(pj.name_th, h.project_name) project_name,
             ${STATE} house_state, c.id customer_id, c.full_name customer_name
        FROM om_customer_phones p ${hint}
        JOIN om_customers c ON c.id = p.customer_id AND c.is_active = 1
        LEFT JOIN om_house_customers hc ON hc.customer_id = c.id AND hc.is_current = 1
        LEFT JOIN om_houses h ON h.id = hc.house_id
        LEFT JOIN om_projects pj ON pj.project_id = h.project_id
       WHERE @ph <> N'' AND p.phone = @ph
       ORDER BY c.id, h.is_om DESC, h.id;

      SELECT TOP 10 'id_card' kind, h.id house_id, h.house_number, ISNULL(pj.name_th, h.project_name) project_name,
             ${STATE} house_state, c.id customer_id, c.full_name customer_name
        FROM om_customers c ${hint}
        LEFT JOIN om_house_customers hc ON hc.customer_id = c.id AND hc.is_current = 1
        LEFT JOIN om_houses h ON h.id = hc.house_id
        LEFT JOIN om_projects pj ON pj.project_id = h.project_id
       WHERE @cid <> N'' AND c.is_active = 1 AND c.id_card = @cid
       ORDER BY c.id, h.is_om DESC, h.id;`);
  const rs = r.recordsets as sql.IRecordSet<HouseConflict>[];
  return [...rs[0], ...rs[1], ...rs[2]].map((c) => ({
    ...c,
    house_id: c.house_id == null ? null : Number(c.house_id),
    customer_id: c.customer_id == null ? null : Number(c.customer_id),
  }));
}

const todayBangkok = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

export type ManualHouseInput = {
  /** ใช้ลูกค้าเดิม (เลือกจากเบอร์/เลขบัตรที่ชน) — ไม่ต้องกรอกชื่อ */
  customerId: number | null;
  title: string | null; firstName: string | null; lastName: string | null;
  phone: string; idCard: string;
  /** เปิดใช้บ้านเดิมที่มีในทะเบียนแต่ยังไม่เปิดงาน O&M (house_state dormant) แทนการสร้างใหม่ */
  reuseHouseId: number | null;
  projectId: string | null; houseNumber: string; address: string | null;
  latitude: string | null; longitude: string | null; note: string | null;
  /** สเปกระบบที่ติดอยู่ — ไม่บังคับ (ผู้ใช้เลือก D2 = A) · ชื่อ key = คอลัมน์ของ om_installations */
  spec: {
    install_date: string | null; inverter_brand: string | null; inverter_kw: number | null;
    rem_size_kwp: number | null; battery_brand: string | null; battery_kwh: number | null;
  };
};

/** อ่าน + ตรวจ body ของฟอร์ม "+ เพิ่มบ้าน" — คืนข้อความ error ถ้าไม่ผ่าน */
export function parseManualHouseInput(b: Record<string, unknown>): ManualHouseInput | string {
  const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
  // ตัวเลขไม่บังคับ: ว่าง = null · ไม่ใช่ตัวเลขบวก = NaN (แจ้ง error) · คอลัมน์เป็น DECIMAL(6,2)
  const num = (v: unknown) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    const n = Number(String(v).replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : NaN;
  };
  const customerId = Number(b.customer_id) > 0 ? Number(b.customer_id) : null;
  const firstName = txt(b.first_name, 120);
  const phone = normPhone(b.phone), idCard = normIdCard(b.id_card);
  if (!customerId && !firstName) return "ต้องระบุชื่อลูกค้า";
  if (!customerId && !phone) return "ต้องระบุเบอร์โทร";
  if (phone && !/^0\d{9}$/.test(phone)) return "เบอร์ต้องเป็น 10 หลักขึ้นต้นด้วย 0";
  if (phone && isPlaceholderPhone(phone)) return "เบอร์นี้ไม่ใช่เบอร์จริง (เลขซ้ำ/เรียงกัน) — ใส่เบอร์ที่ติดต่อลูกค้าได้";
  if (idCard && !/^\d{13}$/.test(idCard)) return "เลขบัตรประชาชนต้องมี 13 หลัก";

  const projectId = txt(b.project_id, 20);
  const houseNumber = normHouseNumber(b.house_number).slice(0, 50);
  const address = txt(b.address, 500);
  if (!houseNumber) return "ต้องระบุบ้านเลขที่";
  if (!projectId && !address) return "บ้านนอกโครงการต้องระบุที่อยู่ — ช่างต้องไปถูกบ้าน";

  // พิกัด: ต้องมาคู่กัน · เก็บเป็นข้อความแบบคอลัมน์เดิม (NVARCHAR(40) ค่าจาก REM)
  const la = String(b.latitude ?? "").trim(), lo = String(b.longitude ?? "").trim();
  let latitude: string | null = null, longitude: string | null = null;
  if (la || lo) {
    const y = Number(la), x = Number(lo);
    if (!la || !lo || !Number.isFinite(y) || !Number.isFinite(x) || Math.abs(y) > 90 || Math.abs(x) > 180) {
      return "พิกัดไม่ถูกต้อง — วางแบบ 13.7563, 100.5018";
    }
    latitude = String(y); longitude = String(x);
  }

  const d = String(b.install_date ?? "").trim();
  if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return "วันติดตั้งไม่ถูกต้อง";
  if (d && d > todayBangkok()) return "วันติดตั้งต้องไม่เป็นวันล่วงหน้า";
  const spec = {
    install_date: d || null,
    inverter_brand: txt(b.inverter_brand, 100),
    inverter_kw: num(b.inverter_kw),
    rem_size_kwp: num(b.size_kwp),
    battery_brand: txt(b.battery_brand, 60),
    battery_kwh: num(b.battery_kwh),
  };
  if (Number.isNaN(spec.inverter_kw)) return "ขนาดอินเวอร์เตอร์ต้องเป็นตัวเลขมากกว่า 0";
  if (Number.isNaN(spec.rem_size_kwp)) return "ขนาดระบบต้องเป็นตัวเลขมากกว่า 0";
  if (Number.isNaN(spec.battery_kwh)) return "ความจุแบตเตอรี่ต้องเป็นตัวเลขมากกว่า 0";

  return {
    customerId, title: txt(b.title, 40), firstName, lastName: txt(b.last_name, 120), phone, idCard,
    reuseHouseId: Number(b.house_id) > 0 ? Number(b.house_id) : null,
    projectId, houseNumber, address, latitude, longitude, note: txt(b.note, 1000), spec,
  };
}

const SPEC_TYPE = {
  install_date: sql.Date, inverter_brand: sql.NVarChar(100), inverter_kw: sql.Decimal(6, 2),
  rem_size_kwp: sql.Decimal(6, 2), battery_brand: sql.NVarChar(60), battery_kwh: sql.Decimal(6, 2),
} as const;
type SpecCol = keyof typeof SPEC_TYPE;
const SPEC_COLS = Object.keys(SPEC_TYPE) as SpecCol[];
const specText = (v: unknown) =>
  v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(Number.isFinite(Number(v)) ? Number(v) : v);
const specValue = (c: SpecCol, v: string | number) => (c === "install_date" ? new Date(`${v}T00:00:00Z`) : v);
const SOURCE_REF = "เพิ่มบ้านเองจากหน้าจอ O&M";

export type ManualHouseResult =
  | { ok: true; house_id: number; customer_id: number; installation_id: number; reused_house: boolean }
  | { ok: false; status: number; error: string; conflicts?: HouseConflict[] };

/**
 * บ้าน + ลูกค้า + ระบบติดตั้ง ใน transaction เดียว (แผน 20261014-08)
 * ★ สร้างแถว om_installations เสมอ แม้ไม่ได้กรอกสเปก — ซื้อแพ็กเกจแล้วสิทธิ์ต้องมีระบบให้ลง
 *   (grantPurchasedRights ใน om-quotation.ts ข้ามบ้านที่ไม่มีระบบ = "no_install")
 * ★ ไม่สร้าง lead — ensureOmLead สร้าง lead om_only ให้ตอนออกใบเสนอราคาใบแรกเหมือนบ้านอื่น
 * ★ ไม่ให้สิทธิ์ล้างแผงฟรี (ผู้ใช้เลือก D3 = A) — กรณีพิเศษใช้ "เพิ่มสิทธิ์" ในหน้าบ้าน
 * ★ ที่มาข้อมูลรายช่องลง om_field_sources (source_kind manual + ผู้กรอก) — om_houses ไม่มีคอลัมน์ผู้สร้าง
 */
export async function createManualHouse(db: sql.ConnectionPool, x: ManualHouseInput, actorUserId: number): Promise<ManualHouseResult> {
  let projectName: string | null = null;
  if (x.projectId) {
    const pj = await db.request().input("p", sql.NVarChar(20), x.projectId)
      .query(`SELECT name_th FROM om_projects WHERE project_id = @p AND ISNULL(project_type, 'H') = 'H'`);
    if (!pj.recordset[0]) return { ok: false, status: 400, error: "ไม่พบโครงการนี้" };
    projectName = pj.recordset[0].name_th;
  }

  const tx = new sql.Transaction(db);
  await tx.begin();
  const rq = () => new sql.Request(tx);
  const stop = async (status: number, error: string, conflicts?: HouseConflict[]): Promise<ManualHouseResult> => {
    await tx.rollback();
    return { ok: false, status, error, conflicts };
  };
  try {
    const conflicts = await findHouseConflicts(rq, x, true);
    const houseHit = conflicts.find((c) => c.kind === "house");
    if (x.reuseHouseId
      ? !(houseHit?.house_id === x.reuseHouseId && houseHit.house_state === "dormant")
      : houseHit) {
      return stop(409, x.reuseHouseId ? "บ้านหลังนี้เปลี่ยนสถานะไปแล้ว — ตรวจข้อมูลอีกครั้ง" : "บ้านหลังนี้มีในทะเบียนแล้ว", conflicts);
    }
    // คนที่ชน (เบอร์/เลขบัตร) ที่ไม่ใช่ลูกค้าที่เลือกไว้ — ไม่เลือกใครเลย = ต้องให้ผู้ใช้ตัดสินก่อน ห้ามสร้างคนซ้ำ
    const others = conflicts.filter((c) => c.kind !== "house" && c.customer_id !== x.customerId);
    if (!x.customerId && others.length) {
      return stop(409, "เบอร์ / เลขบัตรนี้มีลูกค้าอยู่แล้ว — เลือกใช้ลูกค้าคนเดิม", conflicts);
    }

    // ── ลูกค้าเดิมที่เลือก — ยังใช้งานอยู่ไหม
    let customerId = x.customerId;
    let customerName = [x.title, x.firstName, x.lastName].filter(Boolean).join(" ");
    if (customerId) {
      const c = (await rq().input("c", sql.Int, customerId)
        .query(`SELECT full_name FROM om_customers WITH (UPDLOCK) WHERE id = @c AND is_active = 1`)).recordset[0];
      if (!c) return stop(404, "ไม่พบลูกค้าคนนี้ (อาจถูกลบไปแล้ว)");
      customerName = c.full_name;
    }

    // ── บ้าน: บ้านเดิม = เปิดงาน O&M + เติมเฉพาะช่องว่าง (ข้อมูลจาก REM/ไฟล์นำเข้าไม่เขียนทับ) · ไม่งั้นสร้างใหม่
    let houseId: number;
    if (x.reuseHouseId) {
      houseId = x.reuseHouseId;
      await rq().input("id", sql.Int, houseId).input("a", sql.NVarChar(500), x.address)
        .input("la", sql.NVarChar(40), x.latitude).input("lo", sql.NVarChar(40), x.longitude)
        .input("nt", sql.NVarChar(sql.MAX), x.note)
        .query(`UPDATE om_houses SET is_om = 1, has_solar = 1,
                       address = ISNULL(NULLIF(address, N''), @a),
                       latitude = CASE WHEN latitude IS NULL AND longitude IS NULL THEN @la ELSE latitude END,
                       longitude = CASE WHEN latitude IS NULL AND longitude IS NULL THEN @lo ELSE longitude END,
                       note = CASE WHEN @nt IS NULL THEN note WHEN ISNULL(note, N'') = N'' THEN @nt
                                   ELSE note + NCHAR(10) + @nt END,
                       updated_at = SYSDATETIMEOFFSET()
                 WHERE id = @id`);
    } else {
      const h = await rq()
        .input("n", sql.NVarChar(200), customerName.slice(0, 200))
        .input("hn", sql.NVarChar(50), x.houseNumber).input("a", sql.NVarChar(500), x.address)
        .input("p", sql.NVarChar(20), x.projectId).input("pn", sql.NVarChar(200), projectName)
        .input("la", sql.NVarChar(40), x.latitude).input("lo", sql.NVarChar(40), x.longitude)
        .input("src", sql.NVarChar(20), MANUAL_HOUSE_SOURCE).input("nt", sql.NVarChar(sql.MAX), x.note)
        .query(`INSERT INTO om_houses (segment, full_name, house_number, address, project_id, project_name,
                                       latitude, longitude, has_solar, is_om, is_vip, project_map_source, note)
                OUTPUT INSERTED.id
                VALUES ('house', @n, @hn, @a, @p, @pn, @la, @lo, 1, 1, 0, @src, @nt)`);
      houseId = Number(h.recordset[0].id);
    }

    // ── ลูกค้า: คนใหม่ = สร้าง + เบอร์หลัก · คนเดิม = เติมเบอร์/เลขบัตรที่เพิ่งรู้ เฉพาะที่ไม่ได้เป็นของคนอื่น
    if (!customerId) {
      const c = await rq()
        .input("fn", sql.NVarChar(200), customerName.slice(0, 200))
        .input("t", sql.NVarChar(40), x.title).input("f", sql.NVarChar(120), x.firstName).input("l", sql.NVarChar(120), x.lastName)
        .input("cid", sql.NVarChar(20), x.idCard || null)
        .query(`INSERT INTO om_customers (full_name, title, first_name, last_name, id_card, note)
                OUTPUT INSERTED.id VALUES (@fn, @t, @f, @l, @cid, N'${SOURCE_REF}')`);
      customerId = Number(c.recordset[0].id);
      await rq().input("c", sql.Int, customerId).input("p", sql.NVarChar(20), x.phone)
        .query(`INSERT INTO om_customer_phones (customer_id, phone, is_primary, source) VALUES (@c, @p, 1, 'admin')`);
      await rq().input("c", sql.Int, customerId).input("u", sql.Int, actorUserId)
        .input("to", sql.NVarChar(sql.MAX), JSON.stringify({ full_name: customerName, phone: x.phone, house_id: houseId }))
        .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, to_json, reason)
                VALUES (@c, 'create', @u, @to, N'${SOURCE_REF}')`);
    } else {
      if (x.phone && !others.some((c) => c.kind === "phone")) {
        await rq().input("c", sql.Int, customerId).input("p", sql.NVarChar(20), x.phone)
          .query(`IF NOT EXISTS (SELECT 1 FROM om_customer_phones WHERE customer_id = @c AND phone = @p)
                    INSERT INTO om_customer_phones (customer_id, phone, is_primary, source)
                    VALUES (@c, @p, CASE WHEN EXISTS (SELECT 1 FROM om_customer_phones WHERE customer_id = @c) THEN 0 ELSE 1 END, 'admin')`);
      }
      if (x.idCard && !others.some((c) => c.kind === "id_card")) {
        await rq().input("c", sql.Int, customerId).input("cid", sql.NVarChar(20), x.idCard)
          .query(`UPDATE om_customers SET id_card = ISNULL(id_card, @cid), updated_at = SYSDATETIMEOFFSET() WHERE id = @c`);
      }
      await rq().input("c", sql.Int, customerId).input("u", sql.Int, actorUserId)
        .input("r", sql.NVarChar(300), `ผูกบ้าน id ${houseId} (owner) · ${SOURCE_REF}`)
        .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
                VALUES (@c, 'link_house', @u, @r)`);
    }
    await rq().input("h", sql.Int, houseId).input("c", sql.Int, customerId)
      .query(`IF NOT EXISTS (SELECT 1 FROM om_house_customers WHERE house_id = @h AND customer_id = @c AND is_current = 1)
                INSERT INTO om_house_customers (house_id, customer_id, role, is_current, source)
                VALUES (@h, @c, 'owner', 1, 'admin');
              UPDATE om_houses SET primary_customer_id = ISNULL(primary_customer_id, @c) WHERE id = @h;`);

    // ── ระบบติดตั้ง: บ้านใหม่ = สร้างแถวเสมอ · บ้านเดิมที่มีระบบแล้ว = เติมเฉพาะช่องว่าง
    //   ค่าที่ต่างจากของเดิม → ไม่เขียนทับ เก็บใน om_field_sources แบบ probable ("ไม่เขียนทับ" ในการ์ดระบบ — แบบไฟล์นำเข้า)
    const inst = (await rq().input("h", sql.Int, houseId).query(`
      SELECT TOP 1 id, ${SPEC_COLS.join(", ")} FROM om_installations WITH (UPDLOCK)
       WHERE house_id = @h ORDER BY id`)).recordset[0] as Record<string, unknown> | undefined;
    const given = SPEC_COLS.filter((c) => x.spec[c] != null);
    const fill = inst ? given.filter((c) => inst[c] == null) : given;
    const differ = inst ? given.filter((c) => inst[c] != null && specText(inst[c]) !== specText(x.spec[c])) : [];
    const withSpec = (r: sql.Request, cols: SpecCol[]) => {
      for (const c of cols) r.input(c, SPEC_TYPE[c], specValue(c, x.spec[c]!));
      return r;
    };
    let installationId: number;
    if (!inst) {
      const r = await withSpec(rq().input("h", sql.Int, houseId), fill).query(`
        INSERT INTO om_installations (house_id${fill.map((c) => `, ${c}`).join("")}, note)
        OUTPUT INSERTED.id VALUES (@h${fill.map((c) => `, @${c}`).join("")}, N'${SOURCE_REF}')`);
      installationId = Number(r.recordset[0].id);
    } else {
      installationId = Number(inst.id);
      if (fill.length) {
        await withSpec(rq().input("i", sql.Int, installationId), fill).query(`
          UPDATE om_installations SET ${fill.map((c) => `${c} = ISNULL(${c}, @${c})`).join(", ")},
                 updated_at = SYSDATETIMEOFFSET() WHERE id = @i`);
      }
    }
    const sources = [
      ...(x.reuseHouseId ? [] : [{ table: "om_houses", inst: null as number | null, col: "house_number", value: x.houseNumber as string | null, old: null as string | null, probable: false }]),
      ...fill.map((c) => ({ table: "om_installations", inst: installationId, col: c, value: specText(x.spec[c]), old: null, probable: false })),
      ...differ.map((c) => ({ table: "om_installations", inst: installationId, col: c, value: specText(x.spec[c]), old: specText(inst![c]), probable: true })),
    ];
    for (const s of sources) {
      await rq().input("h", sql.Int, houseId).input("i", sql.Int, s.inst)
        .input("t", sql.VarChar(40), s.table).input("c", sql.VarChar(40), s.col)
        .input("v", sql.NVarChar(200), s.value?.slice(0, 200) ?? null).input("o", sql.NVarChar(200), s.old?.slice(0, 200) ?? null)
        .input("m", sql.NVarChar(80), x.reuseHouseId ? "กรอกเองตอนเปิดใช้บ้านเดิม" : "กรอกเองตอนเพิ่มบ้าน")
        .input("cf", sql.VarChar(12), s.probable ? "probable" : null).input("u", sql.Int, actorUserId)
        .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value,
                                              source_kind, source_ref, match_method, confidence, actor_user_id)
                VALUES (@h, @i, @t, @c, @v, @o, 'manual', N'${SOURCE_REF}', @m, @cf, @u)`);
    }

    await tx.commit();
    return { ok: true, house_id: houseId, customer_id: customerId, installation_id: installationId, reused_house: !!x.reuseHouseId };
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}
