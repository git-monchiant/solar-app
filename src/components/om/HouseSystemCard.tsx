"use client";

// การ์ด "ระบบที่ n" ของบ้าน O&M + ที่มาข้อมูลรายช่อง — ใช้ร่วม 2 ที่
//   · modal บ้านในหน้า /om/houses (ของเดิม ย้ายออกมาทั้งก้อน 28 ก.ย. 69 แผน 20260928-04 ข้อ 6)
//   · แท็บ "อุปกรณ์" ในหน้ารายละเอียดงานบริการ (/om/services/[house])
// ★ แก้ที่ไฟล์นี้ที่เดียว หน้าตาของทั้งสองที่จะตรงกันเสมอ
// ★ ชนิดข้อมูล HouseDetail = คำตอบของ GET /api/om/houses/[id]

export interface HouseDetail {
  house: { id: number; house_number: string | null; project_name: string | null; project_id: string | null;
    segment: string; is_vip: boolean; has_solar: boolean; unit_status: string | null; note: string | null;
    latitude?: string | null; longitude?: string | null; model_name?: string | null; titledeed_area?: number | null;
    om_excluded_reason?: string | null; om_excluded_at?: string | null;
    // ครบรอบล้างถัดไป (YYYY-MM-DD · ไม่เคยล้าง = null) + ถึงรอบแล้วไหม — เกณฑ์เดียวกับแท็บติดตาม
    next_wash?: string | null; wash_due?: number };
  systems: { id: number; kwp: number | null; promo_size_kw: number | null; promo_om_years: number | null;
    promo_name: string | null; promo_contract_id: string | null;
    inverter_kw: number | null; inverter_brand: string | null; inverter_sn: string | null;
    install_date: string | null; transfer_date: string | null; warranty_start: string | null;
    sales_warranty_start: string | null; sales_warranty_end: string | null;
    warranty_doc_no: string | null; battery_brand: string | null; battery_kwh: number | null; lead_id: number | null;
    rem_contract_id: string | null; rem_contract_status: string | null; rem_transfer_date: string | null;
    rem_checked_at: string | null; source_batch_id: number | null; batch_file: string | null;
    batch_note: string | null; batch_at: string | null; po_number: string | null; created_at: string | null }[];
  grants: { id: number; qty: number; source: string; reason: string | null; created_at: string;
    service_type_id: number; service_type: string; contract_term?: string | null }[];
  redemptions: { id: number; service_date: string; note?: string | null;
    service_type_id: number; service_type: string }[];
  // ★ ยอดสิทธิ์คงเหลือแยกตามประเภทงาน (9 ก.ย. 69) — ล้างแผงเป็นแค่ชนิดหนึ่ง ไม่ใช่ทั้งหมด
  balances?: { service_type_id: number; service_type_code: string; service_type_label: string;
    total_granted: number; total_used: number; balance: number }[];
  serviceTypes?: { id: number; code: string; label_th: string; consumes_quota: number;
    cycle_months: number | null }[];
  customers: { link_id: number; role: string; customer_id: number; full_name: string; phone: string | null }[];
  bookings: { id: number; scheduled_at: string; time_slot?: string | null; status: string; service_type: string | null }[];
  // ของแถมตอนขาย — เก็บแค่ "เจอกี่รายการ" กับข้อมูลโซลาร์ · ★ ไม่มีราคา ไม่มีรายชื่อของแถม
  promo?: { n_items: number; n_solar: number; solar_kw: number | null; om_years: number | null;
    solar_name: string | null; contract_id: string | null } | null;
  // ★ ที่มาข้อมูลรายฟิลด์ — ค่าไหนมาจากไฟล์ไหน แถวไหน (แสดงในการ์ดระบบติดตั้ง · sourceRows)
  // ★ เลข PO ทุกใบ — บ้านหนึ่งมีได้หลายใบ (งานติดตั้ง + งานบริการรายงวด)
  pos?: { id: number; installation_id: number; po_number: string; po_date: string | null;
    kind: string; note: string | null; amount_kw: number | null; source_ref: string | null;
    batch_file: string | null }[];
  fieldSources?: { id: number; installation_id: number | null; column_name: string;
    new_value: string | null; old_value: string | null; source_kind: string;
    source_ref: string | null; match_method: string | null; confidence: string | null;
    created_at: string | null; batch_file: string | null; batch_note: string | null }[];
}

// ★ คำเรียก "ที่มาข้อมูล" ที่ผู้ใช้เคาะ 9 ก.ย. 69 — ไฟล์ของฝ่ายบัญชี vs ไฟล์นำเข้าของทีม O&M
//   ห้ามใช้ชื่อคนหรือชื่อไฟล์ดิบเป็นป้าย คนอ่านต้องรู้ทันทีว่ามาจากฝ่ายไหน
function sourceLabel(kind: string, batchFile: string | null): { text: string; cls: string } {
  if (kind === "rem") return { text: "REM", cls: "bg-blue-50 text-blue-700" };
  if (kind === "sales") return { text: "ระบบขาย", cls: "bg-active-light text-active" };
  if (kind === "manual") return { text: "กรอกเอง", cls: "bg-amber-50 text-amber-700" };   // ฟอร์มเพิ่มบ้าน (แผน 20261014-08)
  if (batchFile && /^สรุป บ้านเสนาติดตั้ง solar ส่ง/.test(batchFile)) return { text: "ข้อมูลจากบัญชี", cls: "bg-emerald-50 text-emerald-700" };
  return { text: "ข้อมูล O&M_Solar", cls: "bg-gray-200 text-gray-600" };
}
const FIELD_LABEL: Record<string, string> = {
  install_date: "วันติดตั้ง", inverter_kw: "อินเวอร์เตอร์ kW", po_number: "เลข PO",
  warranty_start: "วันเริ่มประกัน", transfer_date: "วันโอน", inverter_brand: "ยี่ห้ออินเวอร์เตอร์",
  rem_size_kwp: "ขนาดระบบ kWp", battery_brand: "ยี่ห้อแบตเตอรี่", battery_kwh: "แบตเตอรี่ kWh", house_number: "บ้านเลขที่",
};

// ★ ที่มาข้อมูลรายช่องของระบบติดตั้ง 1 ระบบ (mockup 20260909_01 · ผู้ใช้เคาะ 9 ก.ย. 69)
//   25 ก.ย. 69: ผู้ใช้สั่งให้แสดงในการ์ดระบบเลย — เดิมต้องกด "ดูรายละเอียด" เปิดกล่องแยกที่รวมทุกระบบ
//   ช่องระดับบ้าน (installation_id ว่าง — ตอนนี้ยังไม่มี) ไปอยู่การ์ดระบบแรก
type SrcRow = { key: string; field: string; value: string; label: { text: string; cls: string };
  ref: string; method: string; at: string; kept?: boolean };
function sourceRows(sel: HouseDetail, sy: HouseDetail["systems"][number], first: boolean): SrcRow[] {
  const list: SrcRow[] = [];
  // ระดับระเบียน — ระบบนี้เกิดจากที่ไหน
  if (sy.rem_contract_id) list.push({
    key: `rem${sy.id}`, field: "ขนาดตามสัญญา",
    value: sy.kwp ? `${sy.kwp} kWp` : sy.promo_size_kw ? `${sy.promo_size_kw} kW` : "—",
    label: sourceLabel("rem", null),
    ref: `${sy.rem_contract_id}${sy.rem_contract_status ? ` · ${sy.rem_contract_status}` : ""}`,
    method: `ทะเบียนสัญญา${sy.rem_transfer_date ? ` · โอน ${sy.rem_transfer_date}` : ""}`,
    at: sy.rem_checked_at ? sy.rem_checked_at.slice(0, 10) : "—",
  });
  if (sy.lead_id) list.push({
    key: `lead${sy.id}`, field: "ระเบียนระบบติดตั้ง", value: "สร้างจากงานขายที่ติดตั้งเสร็จ",
    label: sourceLabel("sales", null),
    ref: `lead ${sy.lead_id}${sy.warranty_doc_no ? ` · ใบรับประกัน ${sy.warranty_doc_no}` : ""}`,
    method: "รอบกวาดงานขาย → O&M", at: sy.created_at || "—",
  });
  if (sy.batch_file) list.push({
    key: `imp${sy.id}`, field: "ระเบียนระบบติดตั้ง", value: "สร้างจากไฟล์นำเข้า",
    label: sourceLabel("import", sy.batch_file), ref: sy.batch_file,
    method: sy.batch_note || "—", at: sy.batch_at || "—",
  });
  // ★ ของแถมโซลาร์จาก REM — ที่มาของ "ขนาดระบบ" เวลาไฟล์นำเข้าไม่มี kWp (ข้อมูลระดับบ้าน โชว์ทุกระบบแบบของเดิม)
  if (sel.promo && sel.promo.n_solar > 0) list.push({
    key: `promo${sy.id}`, field: "ของแถมโซลาร์", value: sel.promo.solar_kw ? `${sel.promo.solar_kw} kW` : "—",
    label: { text: "ของแถม", cls: "bg-active-light text-active" },
    ref: sel.promo.contract_id || "—",
    method: `${sel.promo.solar_name || "Solar Roof"}${sel.promo.om_years ? ` · O&M ${sel.promo.om_years} ปี` : ""}`,
    at: "—",
  });
  // ใบ PO ทุกใบ — ใบไหนเป็นงานบริการติดป้ายไว้ ไม่ปนกับใบตอนติดตั้ง
  for (const po of (sel.pos ?? []).filter((p) => p.installation_id === sy.id)) list.push({
    key: `po${po.id}`, field: po.kind === "service" ? "เลข PO งานบริการ" : "เลข PO งานติดตั้ง",
    value: po.po_number, label: sourceLabel("import", po.batch_file),
    ref: po.source_ref || "—", method: po.note || "—", at: po.po_date || "—",
  });
  const poSet = new Set((sel.pos ?? []).map((p) => p.po_number));
  for (const f of sel.fieldSources ?? []) {
    if (f.installation_id !== sy.id && !(first && f.installation_id == null)) continue;
    if (f.column_name === "po_number" && f.new_value && poSet.has(f.new_value)) continue;
    const kept = f.confidence === "probable";   // ค่าที่ต่างจากของเดิม — ไม่เขียนทับ เก็บไว้ตรวจ
    list.push({
      key: `fs${f.id}`,
      field: `${FIELD_LABEL[f.column_name] ?? f.column_name}${kept ? " (ไม่เขียนทับ)" : ""}`,
      // เขียนทับค่าเดิม → โชว์ "เดิม → ใหม่" (การเติมช่องว่างปกติไม่มีค่าเดิม)
      value: !kept && f.old_value && f.old_value !== f.new_value ? `${f.old_value} → ${f.new_value ?? "—"}` : (f.new_value ?? "—"),
      label: sourceLabel(f.source_kind, f.batch_file),
      ref: f.source_ref || f.batch_file || "—",
      method: kept ? `ค่าต่างจากของเดิม${f.old_value ? ` (${f.old_value})` : ""} เก็บไว้ตรวจ` : (f.match_method || "—"),
      at: f.created_at || "—", kept,
    });
  }
  return list;
}

/** การ์ดระบบติดตั้ง 1 ระบบ — ขนาด · อินเวอร์เตอร์ · ประกัน · PO · แบต + ที่มาข้อมูลรายช่อง
 *  className = ระยะขอบรอบการ์ด (modal ใช้ mx-5 my-3 ของเดิม · แท็บในหน้ารายละเอียดส่งค่าของตัวเอง) */
export function SystemCard({ sel, s, i, className = "mx-5 my-3" }: {
  sel: HouseDetail; s: HouseDetail["systems"][number]; i: number; className?: string;
}) {
  const pos = (sel.pos ?? []).filter((p) => p.installation_id === s.id);
  const rows = sourceRows(sel, s, i === 0);
  return (
    <div className={`${className} rounded-xl border border-gray-200 overflow-hidden bg-white`}>
      <div className="px-3.5 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-xs font-bold">
        ระบบที่ {i + 1}
        {s.lead_id && <span className="text-xxs font-bold px-2 rounded-full bg-active-light text-active">จากระบบขาย · lead {s.lead_id}</span>}
      </div>
      {/* ป้ายซ้ายกว้างเท่าที่ต้องใช้ ค่าชิดขวา — อ่านเป็นแถวได้ทันทีโดยไม่ต้องไล่สายตาข้ามครึ่งการ์ด */}
      <div className="grid grid-cols-[auto_1fr] gap-x-4 px-3.5 py-2 text-xs leading-relaxed">
        <span className="text-gray-500">ขนาด</span>
        <span className="text-right font-semibold">
          {s.kwp ? `${s.kwp} kWp`
            : s.promo_size_kw ? <>{s.promo_size_kw} kW <small className="font-medium text-gray-400">— จากของแถม</small></>
            : <span className="text-amber-600">— ขาด</span>}
        </span>
        <span className="text-gray-500">Inverter</span>
        {/* ★ 28 ก.ย. 69 ไฟล์บัญชีส่งมาแค่ kW ไม่มียี่ห้อ/SN (737 ระบบ) — เดิมขึ้น "—" ทั้งที่รู้ขนาด */}
        <span className="text-right font-semibold break-all">
          {[s.inverter_brand, s.inverter_sn, s.inverter_kw ? `${s.inverter_kw} kW` : null].filter(Boolean).join(" · ") || "—"}
          {!!s.inverter_kw && !s.inverter_brand && <small className="font-medium text-gray-400"> — ยังไม่รู้ยี่ห้อ</small>}
        </span>
        {/* ★ บ้านจากงานขาย: ช่วงประกันตามใบรับประกันฝั่งขาย (แผน 20260925-01) */}
        <span className="text-gray-500">{s.sales_warranty_end ? "ช่วงประกันติดตั้ง" : "วันเริ่มประกัน"}</span>
        <span className="text-right font-semibold">
          {s.warranty_start || <span className="text-amber-600">ยังไม่มี</span>}
          {s.sales_warranty_end && ` – ${s.sales_warranty_end}`}
          {s.sales_warranty_start && <small className="block font-medium text-gray-400">ตามใบรับประกัน</small>}
        </span>
        <span className="text-gray-500">ใบรับประกัน</span><span className="text-right font-semibold">{s.warranty_doc_no || "—"}</span>
        {pos.length > 0 ? <>
          <span className="text-gray-500">เลข PO{pos.length > 1 ? ` · ${pos.length} ใบ` : ""}</span>
          <span className="text-right font-semibold">
            {pos.map((p) => (
              <span key={p.id} className="block">
                {p.po_number}
                {p.kind === "service" && <span className="ml-1 text-xxs font-bold px-1.5 rounded-full bg-amber-50 text-amber-700">งานบริการ</span>}
                {p.po_date && <span className="ml-1 text-xxs font-medium text-gray-400">{p.po_date}</span>}
              </span>
            ))}
          </span>
        </> : s.po_number ? <>
          <span className="text-gray-500">เลข PO</span><span className="text-right font-semibold">{s.po_number}</span>
        </> : null}
        {s.battery_brand && <><span className="text-gray-500">แบตเตอรี่</span>
          <span className="text-right font-semibold">{s.battery_brand}{s.battery_kwh ? ` ${s.battery_kwh} kWh` : ""}</span></>}
      </div>
      {/* ★ ที่มาข้อมูลรายช่อง — ตอบว่าเลข kWp/วันที่มาจากไหน (REM / ไฟล์นำเข้า / ระบบขาย)
          25 ก.ย. 69 ผู้ใช้สั่งให้แสดงเลย ไม่ต้องกด "ดูรายละเอียด" — ยกแบบการ์ด mobile ของกล่องเดิมมาใช้
          (คอลัมน์ขวาแคบ ตาราง 6 คอลัมน์ไม่พอ) · แต่ละช่อง 2 บรรทัด: ช่อง/ค่า/ป้าย แล้วจุดอ้างอิง · วิธี · เมื่อ */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="px-3.5 pt-1.5 text-xxs font-bold text-gray-600">ที่มาข้อมูล</div>
        {rows.length === 0 && <div className="px-3.5 pb-1.5 text-xxs text-gray-400">ไม่มีข้อมูลที่มา (กรอกมือ)</div>}
        {rows.map((r) => {
          const sub = [r.ref, r.method, r.at].filter((x) => x && x !== "—").join(" · ");
          return (
            <div key={r.key} className="px-3.5 py-1.5 border-b border-gray-100 last:border-b-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className={`text-xs font-semibold ${r.kept ? "text-amber-700" : "text-gray-600"}`}>{r.field}</span>
                <span className={`text-xs font-bold ${r.kept ? "text-amber-700" : "text-gray-800"}`}>{r.value}</span>
                <span className={`ml-auto text-xxs font-bold px-2 rounded-full shrink-0 ${r.label.cls}`}>{r.label.text}</span>
              </div>
              {sub && <div className="text-xxs text-gray-400 leading-snug">{sub}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
