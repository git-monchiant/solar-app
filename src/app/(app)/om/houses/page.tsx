"use client";

// บ้าน / ระบบติดตั้ง — ทะเบียนบ้านสำหรับไล่ตรวจ/เติมข้อมูล (mockup 20260901_04)
// สิทธิ์ล้างอยู่หน้านี้ (ledger รายบ้าน) — ไม่อยู่หน้าลูกค้า
// ★ 25 ก.ย. 69 (แผน 20260925-03 · mockup docs/mockup/20260925-03-om-houses-list-sales-style/)
//   โครงหน้าแบบฝั่งขาย: ListPageHeader + แถวเครื่องมือยกจากหน้างานบริการ · desktop ยังเป็นตาราง
//   (ไม่มีขั้นงานให้โชว์ การ์ดอยู่หน้างานบริการแล้ว) · มือถือเป็นการ์ด · กดทั้งแถวเปิดบ้าน ไม่มีปุ่มแก้ไข
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import { useMe } from "@/lib/roles";
import { hasAnyGrantedRole } from "@/lib/role-permissions";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import ListPageHeader from "@/components/layout/ListPageHeader";
import Dropdown from "@/components/ui/Dropdown";
import Loading from "@/components/ui/Loading";
import ModalBase from "@/components/ui/ModalBase";
import SyncBar from "@/components/om/SyncBar";

interface Row {
  id: number; house_number: string | null; project_name: string | null; project_id: string | null;
  segment: string; is_vip: boolean; has_solar: boolean; unit_status: string | null; note: string | null;
  system_count: number; kwp_list: string | null; warranty_start: string | null; balance: number;
  customer_name: string | null; customer_count: number; has_booking: number;
  last_wash: string | null; wash_count: number; customer_phone: string | null;
  om_excluded_reason: string | null; om_excluded_at: string | null;
}
interface Group {
  grp: string; pid: string | null; name: string; special: boolean; nonHouse: boolean; hidden: boolean;
  houses: number; vip: number; nophone: number; nowarr: number;
  noinv: number; nocust: number; duewash: number; nosolar: number; nospec: number; bal: number;
}
interface Stats { total: number; nophone: number; nowarr: number; noinv: number; nocust: number;
  duewash: number; nosolar: number; nospec: number; hidden: number }
interface Detail {
  house: { id: number; house_number: string | null; project_name: string | null; project_id: string | null;
    segment: string; is_vip: boolean; has_solar: boolean; unit_status: string | null; note: string | null;
    latitude?: string | null; longitude?: string | null; model_name?: string | null; titledeed_area?: number | null;
    om_excluded_reason?: string | null; om_excluded_at?: string | null };
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
    service_type_id: number; service_type: string }[];
  redemptions: { id: number; service_date: string; note?: string | null;
    service_type_id: number; service_type: string }[];
  // ★ ยอดสิทธิ์คงเหลือแยกตามประเภทงาน (9 ก.ย. 69) — ล้างแผงเป็นแค่ชนิดหนึ่ง ไม่ใช่ทั้งหมด
  balances?: { service_type_id: number; service_type_code: string; service_type_label: string;
    total_granted: number; total_used: number; balance: number }[];
  serviceTypes?: { id: number; code: string; label_th: string; consumes_quota: number;
    cycle_months: number | null }[];
  customers: { link_id: number; role: string; customer_id: number; full_name: string; phone: string | null }[];
  bookings: { id: number; scheduled_at: string; status: string; service_type: string | null }[];
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
  if (batchFile && /^สรุป บ้านเสนาติดตั้ง solar ส่ง/.test(batchFile)) return { text: "ข้อมูลจากบัญชี", cls: "bg-emerald-50 text-emerald-700" };
  return { text: "ข้อมูล O&M_Solar", cls: "bg-gray-200 text-gray-600" };
}
const FIELD_LABEL: Record<string, string> = {
  install_date: "วันติดตั้ง", inverter_kw: "อินเวอร์เตอร์ kW", po_number: "เลข PO",
  warranty_start: "วันเริ่มประกัน", transfer_date: "วันโอน", inverter_brand: "ยี่ห้ออินเวอร์เตอร์",
};

// ★ ที่มาข้อมูลรายช่องของระบบติดตั้ง 1 ระบบ (mockup 20260909_01 · ผู้ใช้เคาะ 9 ก.ย. 69)
//   25 ก.ย. 69: ผู้ใช้สั่งให้แสดงในการ์ดระบบเลย — เดิมต้องกด "ดูรายละเอียด" เปิดกล่องแยกที่รวมทุกระบบ
//   ช่องระดับบ้าน (installation_id ว่าง — ตอนนี้ยังไม่มี) ไปอยู่การ์ดระบบแรก
type SrcRow = { key: string; field: string; value: string; label: { text: string; cls: string };
  ref: string; method: string; at: string; kept?: boolean };
function sourceRows(sel: Detail, sy: Detail["systems"][number], first: boolean): SrcRow[] {
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
const ROLE: Record<string, string> = { owner: "เจ้าของ", resident: "ผู้อยู่อาศัย", contact: "ผู้ติดต่อ" };
const SRC: Record<string, string> = { contract_base: "สิทธิ์ตั้งต้น", renewal: "ต่อสัญญา", purchase: "ซื้อเพิ่ม", import: "import", manual_adjust: "ปรับมือ", expire: "หมดอายุ" };
// แท็บกรอง — key ตรงกับทั้ง /api/om/houses?filter= และธงใน /api/om/houses/groups
const TABS: { k: string; t: string; s: keyof Stats }[] = [
  { k: "", t: "ทั้งหมด", s: "total" },
  // ★ 25 ก.ย. 69 เอาแท็บ "ถึงคิวล้าง" ออก (ผู้ใช้เลือก B1) — นิยามไม่ตรงกับแท็บติดตามของหน้างานบริการ
  //   (ที่นี่ 1,546 vs ที่นั่น 919) คนเห็นสองตัวเลขเรื่องเดียวกัน · คิวล้างดูที่หน้างานบริการที่เดียว
  //   API ยังรับ filter=duewash อยู่ · หน้านี้เหลือแท็บคุณภาพข้อมูลล้วน ๆ
  { k: "nophone", t: "ไม่มีเบอร์", s: "nophone" },
  { k: "nowarr", t: "ไม่มีวันประกัน", s: "nowarr" },
  { k: "noinv", t: "ไม่รู้อินเวอร์เตอร์", s: "noinv" },
  { k: "nocust", t: "ยังไม่ผูกลูกค้า", s: "nocust" },
  // ★ 2 ก.ย.: บ้านที่จดว่าไม่ติดโซลาร์ 50 หลัง ถูกซ่อนออกไปแล้ว (is_om=0 + om_excluded_reason)
  //   เหลือ "รอตรวจ" = ไม่มีสเปกระบบและไม่เคยล้าง ยังจับไม่ได้ว่ามีโซลาร์จริงไหม
  { k: "nospec", t: "รอตรวจ · ไม่มีสเปก", s: "nospec" },
  { k: "hidden", t: "ซ่อนไว้", s: "hidden" },
];

// วันล้างล่าสุด → ข้อความ "ผ่านมานานแค่ไหน" + ธง "เลยรอบแล้ว"
// ★ รอบมาจาก om_service_type.cycle_months (ตอนนี้ 6 เดือน) ส่งมากับ API — อย่า hardcode 1 ปี
function washAgo(d: string | null, cycleMonths: number | null): { text: string; old: boolean } | null {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  const text = days < 31 ? `${days} วัน` : days < 365 ? `${Math.round(days / 30)} เดือน` : `${(days / 365).toFixed(1)} ปี`;
  return { text, old: days > (cycleMonths ?? 12) * 30.4 };
}

export default function OmHousesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [washCycle, setWashCycle] = useState<number | null>(null);   // รอบล้าง (เดือน) จาก om_service_type
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [grp, setGrp] = useState("__ALL__");   // เริ่มที่ ทุกโครงการ — กดแท็บงานค้างต้องเห็นทั้งระบบ
  const { me } = useMe();
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const isAdmin = !!me?.roles?.includes("admin");   // ★ ลบบ้านถาวรได้เฉพาะแอดมินสูงสุด
  // ★ สถานะ sync — API อ่านได้เฉพาะ 3 role นี้ (เช็กแบบเดียวกับ requireAnyRole ฝั่ง server)
  //   เดิมทุกคนเห็นกล่อง แต่ role อื่นได้ค่าว่าง "0 unit · รอบล่าสุด —" มาตลอด
  const canSync = hasAnyGrantedRole(me?.roles, ["admin", "solar_sup", "sales_sup"]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(30);
  const [sel, setSel] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [entForm, setEntForm] = useState<"" | "wash" | "grant">("");
  const [washDate, setWashDate] = useState("");
  const [washNote, setWashNote] = useState("");
  const [grantQty, setGrantQty] = useState("1");
  const [grantSrc, setGrantSrc] = useState("renewal");
  const [washType, setWashType] = useState("");    // ชนิดงานของใบตัดสิทธิ์ (ว่าง = ล้างแผง)
  const [grantType, setGrantType] = useState("");  // ชนิดงานของสิทธิ์ที่จะเพิ่ม (ว่าง = ล้างแผง)
  const [grantWhy, setGrantWhy] = useState("");
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const loadGroups = useCallback(() => {
    apiFetch("/api/om/houses/groups")
      .then((d) => {
        setGroups(d.groups ?? []);
        setStats(d.stats ?? null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  const load = useCallback(() => {
    // ค้นหาข้ามทุกกลุ่ม — พิมพ์ค้นแล้วไม่ต้องเดาว่าบ้านอยู่โครงการไหน
    const u = new URLSearchParams({
      q, filter, page: String(page), size: String(size),
      ...(q ? {} : { group: grp }),
    });
    apiFetch(`/api/om/houses?${u}`)
      .then((d) => { setRows(d.houses ?? []); setTotal(d.total ?? 0); setWashCycle(d.cleaningCycleMonths ?? null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [q, filter, grp, page, size]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const show = async (id: number) => {
    setOpen(true); setSel(null); setErr("");
    // ★ โหลดไม่ขึ้นต้องเด้ง toast ด้วย — แถบ error อยู่บนสุดของหน้า ถ้าเลื่อนลงมาจะไม่เห็นเลย
    //   (เคยเกิด 24 ก.ย. 69: view om_entitlement_balance ถูกย้อนรุ่น modal เปิดแล้วหายไปเฉย ๆ)
    try { setSel(await apiFetch(`/api/om/houses/${id}`)); }
    catch (e) { const m = e instanceof Error ? e.message : String(e); setErr(m); say(`เปิดบ้านไม่ได้: ${m}`); setOpen(false); }
  };
  const upd = (patch: Partial<Detail["house"]>) => setSel((s) => (s ? { ...s, house: { ...s.house, ...patch } } : s));

  const save = async () => {
    if (!sel) return;
    setBusy(true); setErr("");
    try {
      const h = sel.house;
      await apiFetch(`/api/om/houses/${h.id}`, {
        method: "PATCH",
        body: JSON.stringify({ house_number: h.house_number, segment: h.segment, unit_status: h.unit_status,
          note: h.note, is_vip: h.is_vip, has_solar: h.has_solar }),
      });
      say("บันทึกแล้ว"); load(); loadGroups();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // แก้สิทธิ์ล้างแผง — เพิ่ม/ลบแล้วโหลด drawer กับยอดในตารางใหม่
  // ★ ซ่อน/คืน บ้านออกจากงาน O&M — ไม่ลบข้อมูล แค่พลิก is_om + จดเหตุผล
  const setOm = async (on: boolean, reason?: string) => {
    if (!sel) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/houses/${sel.house.id}`, {
        method: "PATCH",
        body: JSON.stringify(on ? { restore: true } : { exclude: reason ?? "ไม่ได้ติดโซลาร์" }),
      });
      setSel(await apiFetch(`/api/om/houses/${sel.house.id}`));
      load(); loadGroups();
      say(on ? "เอากลับเข้าระบบแล้ว" : "ซ่อนออกจากงาน O&M แล้ว — ข้อมูลยังอยู่ครบ");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // ★ ลบบ้านถาวร — เฉพาะแอดมินสูงสุด · ปกติ server กันบ้านมีประวัติ (409) → เสนอ "force" ลบทั้งประวัติ
  //   ใช้ raw fetch (ไม่ใช่ apiFetch) เพราะต้องอ่าน status 409 + จำนวนประวัติ เพื่อถามยืนยันซ้ำ
  const del = async (force = false) => {
    if (!sel) return;
    const label = sel.house.house_number || sel.house.project_name || `#${sel.house.id}`;
    if (!force && !confirm(`ลบบ้าน "${label}" ถาวร?\n\nข้อมูลระบบติดตั้ง · ลูกค้า · สิทธิ์ ของบ้านหลังนี้จะถูกลบทั้งหมด กู้คืนไม่ได้\n(บ้านที่เคยล้างแผง / มีนัด / ผูก LINE จะขึ้นให้ยืนยันซ้ำก่อนลบ)`)) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch(`/api/om/houses/${sel.house.id}${force ? "?force=1" : ""}`,
        { method: "DELETE", headers: { ...getUserContextHeaders() } });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.locked) {
        setBusy(false);
        if (confirm(`⚠ บ้านนี้มีประวัติงานจริง — ล้างแผง ${body.washes} · นัด ${body.bookings} · LINE ${body.lineLinks}\n\nลบทั้งประวัติเลยไหม? (force — ลบถาวร กู้คืนไม่ได้ ประวัติล้าง/นัดจะหายด้วย)`)) return del(true);
        return;
      }
      if (!res.ok) throw new Error(body.error || `ลบไม่สำเร็จ (${res.status})`);
      say(force ? "ลบบ้านถาวรแล้ว (รวมประวัติ)" : "ลบบ้านถาวรแล้ว");
      setOpen(false); setSel(null); load(); loadGroups();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const entCall = async (init: RequestInit, path = "") => {
    if (!sel) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/houses/${sel.house.id}/entitlements${path}`, init);
      setSel(await apiFetch(`/api/om/houses/${sel.house.id}`));
      load(); loadGroups();
      setEntForm(""); setWashNote(""); setGrantWhy(""); setGrantQty("1");
      say("บันทึกแล้ว");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const addWash = () => entCall({ method: "POST", body: JSON.stringify({ kind: "redemption", service_date: washDate, note: washNote || null, service_type_id: washType || null }) });
  const addGrant = () => entCall({ method: "POST", body: JSON.stringify({ kind: "grant", qty: Number(grantQty), source: grantSrc, reason: grantWhy || null, service_type_id: grantType || null }) });
  const delEnt = (kind: "grant" | "redemption", ref: number, label: string) => {
    if (!confirm(`ลบ "${label}" ออกจากสิทธิ์บ้านหลังนี้?`)) return;
    entCall({ method: "DELETE" }, `?kind=${kind}&ref=${ref}`);
  };

  // ★ ยอดคงเหลือมาจากวิว om_entitlement_balance ซึ่งแยกตามประเภทงานแล้ว
  //   "balance" ตัวเดียวหมายถึงล้างแผงเสมอ (เลขใหญ่บนหัวข้อ) ชนิดอื่นโชว์เป็นชิปข้าง ๆ
  const bals = sel?.balances ?? [];
  const balance = Math.max(0, bals.find((b) => b.service_type_code === "cleaning")?.balance ?? 0);
  const otherBals = bals.filter((b) => b.service_type_code !== "cleaning" && b.total_granted !== 0);
  const types = sel?.serviceTypes ?? [];
  const quotaTypes = types.filter((t) => t.consumes_quota === 1);
  const cleaningId = types.find((t) => t.code === "cleaning")?.id ?? 0;
  // ลำดับ "ครั้งที่" ต้องนับแยกตามชนิดงาน ไม่ใช่นับรวมทั้งกอง
  const redIndex = new Map<number, number>();
  {
    const n = new Map<number, number>();
    for (const r of sel?.redemptions ?? []) {
      const k = (n.get(r.service_type_id) ?? 0) + 1;
      n.set(r.service_type_id, k); redIndex.set(r.id, k);
    }
  }

  const cur = groups?.find((g) => g.grp === grp) ?? null;
  // ★ กลุ่ม "ซ่อนจากลิสต์หลัก" (คอนโด/สนง.ขาย/ส่วนกลาง/ยังไม่ขาย/บ้านตัวอย่าง) — แสดงแยกส่วนล่าง
  const hiddenGroups = (groups ?? []).filter((g) => g.hidden);
  const hiddenTotal = hiddenGroups.reduce((n, g) => n + g.houses, 0);
  const allHouses = (groups ?? []).reduce((n, g) => n + (g.hidden ? 0 : g.houses), 0);
  const shownGroups = (groups ?? []).filter((g) => {
    if (g.hidden) return false;   // กลุ่มซ่อนไม่ปนลิสต์หลัก
    if (filter === "hidden") return true;   // ของที่ซ่อนไม่อยู่ในตัวนับรายกลุ่ม
    return !filter || Number(g[filter as keyof Group] ?? 0) > 0;
  });
  // ตัวเลขบนแท็บ = แนวราบที่ให้บริการ — หักกลุ่มซ่อนออกเสมอ (scope เคาะ 3 ก.ย.)
  const shownStats: Stats | null = !stats ? null : {
    total: stats.total - hiddenTotal,
    nophone: stats.nophone - hiddenGroups.reduce((n, g) => n + g.nophone, 0),
    nowarr: stats.nowarr - hiddenGroups.reduce((n, g) => n + g.nowarr, 0),
    noinv: stats.noinv - hiddenGroups.reduce((n, g) => n + g.noinv, 0),
    nocust: stats.nocust - hiddenGroups.reduce((n, g) => n + g.nocust, 0),
    duewash: stats.duewash - hiddenGroups.reduce((n, g) => n + g.duewash, 0),
    nosolar: stats.nosolar - hiddenGroups.reduce((n, g) => n + g.nosolar, 0),
    nospec: stats.nospec - hiddenGroups.reduce((n, g) => n + g.nospec, 0),
    hidden: stats.hidden,   // "ซ่อนไว้" (is_om=0 จากปุ่มซ่อน) คนละเรื่องกับกลุ่มซ่อน scope
  };
  const isVipGroup = grp === "__VIP__";
  const allSelected = grp === "__ALL__";
  // ตัวเลขบนแท็บต้องตรงกับสิ่งที่แสดงเสมอ: เลือกโครงการอยู่ก็นับเฉพาะโครงการนั้น
  const tabCount = (k: keyof Stats): number | null => {
    // ★ "ซ่อนไว้" อยู่นอก is_om — ไม่มีในสรุปรายกลุ่ม ต้องใช้ตัวเลขทั้งระบบเสมอ
    if (k === "hidden") return stats?.hidden ?? null;
    if (allSelected) return shownStats ? shownStats[k] : null;
    if (!cur) return null;
    return k === "total" ? cur.houses : Number(cur[k as keyof Group] ?? 0);
  };
  const pages = Math.max(1, Math.ceil(total / size));
  // เลขหน้าแบบย่อ: 1 … 4 5 6 … 12 (null = จุดไข่ปลา)
  const pageNums: (number | null)[] = (() => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const near = [page - 1, page, page + 1].filter((n) => n > 1 && n < pages);
    const out: (number | null)[] = [1];
    if (near[0] > 2) out.push(null);
    out.push(...near);
    if (near[near.length - 1] < pages - 1) out.push(null);
    out.push(pages);
    return out;
  })();

  // ★ dropdown โครงการ — Dropdown ตัวกลางจัดกลุ่มไม่ได้ ใช้คำนำหน้าแทน optgroup เดิม
  //   (ลำดับเดิม: โครงการ → กลุ่มพิเศษ → กลุ่มที่ซ่อนจากลิสต์หลัก) · มีช่องค้นหาเพราะโครงการเยอะ
  const grpOptions = [
    { value: "__ALL__", label: `ทุกโครงการ · ${allHouses.toLocaleString()} หลัง` },
    ...shownGroups.filter((g) => !g.special)
      .map((g) => ({ value: g.grp, label: `${g.name || "(ไม่ระบุ)"} · ${g.houses.toLocaleString()}` })),
    ...shownGroups.filter((g) => g.special)
      .map((g) => ({ value: g.grp, label: `กลุ่มพิเศษ · ${g.name || "(ไม่ระบุ)"} · ${g.houses.toLocaleString()}` })),
    // ★ กลุ่มซ่อนจากลิสต์หลัก — คอนโด/สนง.ขาย/ส่วนกลาง ไม่ใช่แนวราบ · ยังไม่ขาย/บ้านตัวอย่าง ยังไม่ให้บริการ
    ...hiddenGroups.map((g) => ({ value: g.grp,
      label: `ซ่อนจากลิสต์หลัก · ${g.name} · ${g.houses.toLocaleString()} · ${["__CONDO__", "__SALES__", "__FACILITY__"].includes(g.grp) ? "ไม่ใช่แนวราบ" : "ยังไม่ให้บริการ"}` })),
  ];

  return (
    <div>
      {/* หัวจอกลางชุดเดียวกับ Pipeline/Today/งานบริการ — หัวเรื่อง = ชื่อเมนูที่ active
          ★ 25 ก.ย. 69 เอาปุ่ม "+ เพิ่มบ้าน" ออก (ผู้ใช้เลือก C1) — ปุ่มไม่เคยผูกคำสั่ง กดแล้วไม่มีอะไรเกิดขึ้น
            บ้านเข้าระบบเอง 3 ทาง: ทะเบียน REM · งานขายที่ติดตั้งเสร็จ · คิวจับคู่ที่แอดมินตัดสิน
          ★ ตัดแถบสรุปใต้แท็บ ("ทุกโครงการ 1,713 หลัง · ไม่มีเบอร์ …") — ซ้ำกับตัวเลขบนแท็บ */}
      <ListPageHeader
        title={activeItem?.label ?? "บ้าน / ระบบติดตั้ง"}
        subtitle="O&M · ทะเบียนบ้านที่ติดโซลาร์ · ข้อมูลจาก REM / ระบบขาย / ไฟล์นำเข้า"
        search={q}
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        searchPlaceholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · เบอร์"
        tabs={TABS.map((t) => ({ key: t.k, label: t.t, count: tabCount(t.s) ?? undefined }))}
        activeTab={filter}
        onTabChange={(k) => { setFilter(k); setGrp("__ALL__"); setPage(1); setQ(""); }}
        tabsLeft={shownStats ? <span className="whitespace-nowrap">{shownStats.total.toLocaleString("th-TH")} หลัง</span> : undefined}
      />

      <div className="p-3 md:p-4 flex flex-col gap-3">
        {/* แถวเครื่องมือ — ยกจากหน้างานบริการ: ซ้าย = จำนวน+โครงการ · ขวา = สถานะ sync (A1) */}
        <div className="flex flex-wrap items-center gap-2 px-1">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">
            {q ? `ผลค้นหา "${q}" · ${total.toLocaleString("th-TH")} รายการ` : `${total.toLocaleString("th-TH")} หลังในแท็บนี้`}
          </span>
          {groups === null ? <span className="text-xs text-gray-400">กำลังโหลดโครงการ…</span> : (
            <Dropdown
              className="w-full md:w-72 font-normal"
              value={grp}
              onChange={(v) => { setGrp(v || "__ALL__"); setPage(1); setQ(""); }}   // เลือกซ้ำ = ล้าง → กลับทุกโครงการ
              options={grpOptions}
              searchable
            />
          )}
          {canSync && (
            <span className="md:ml-auto max-md:w-full">
              <SyncBar onChanged={() => { load(); loadGroups(); }} />
            </span>
          )}
        </div>

        {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

        {/* ตารางบ้าน — เต็มความกว้าง */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {rows === null ? <Loading /> : (
          <>
            {/* ตาราง desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead><tr className="bg-gray-50 text-left">
                  {[isVipGroup ? "ชื่อบ้าน / เจ้าของ" : "บ้านเลขที่", "ระบบ / kWp", "วันเริ่มประกัน", "ล้างล่าสุด", "สิทธิ์เหลือ", "ชื่อลูกค้า", "เบอร์", ""].map((h) => (
                    <th key={h} className="px-4 py-2 text-xs font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.id} onClick={() => show(h.id)} className="cursor-pointer hover:bg-teal-50/40">
                      <td className="px-4 py-2 border-b border-gray-100">
                        <span className="text-sm font-bold">{h.house_number || h.project_name || "—"}</span>
                        {h.is_vip && !isVipGroup && <span className="ml-1 text-xxs font-bold px-2 rounded-full bg-amber-100 text-amber-700">VIP</span>}
                        {/* ตอนค้นหาข้ามกลุ่ม ต้องบอกว่าบ้านอยู่โครงการไหน */}
                        {(q || allSelected) && h.house_number && <div className="text-xs font-semibold text-blue-900/70 truncate">{h.project_name}</div>}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm">
                        {h.system_count > 1 && <span className="mr-1 text-xxs font-bold px-2 rounded-full bg-active-light text-active">{h.system_count} ระบบ</span>}
                        {h.kwp_list ? `${h.kwp_list} kW` : "—"}
                        {!h.has_solar && <div className="text-xxs font-bold text-red-600">ไม่มีโซลาร์</div>}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm">
                        {h.warranty_start || <span className="text-amber-600 font-bold text-xs">ยังไม่มี</span>}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm whitespace-nowrap">
                        {(() => {
                          const w = washAgo(h.last_wash, washCycle);
                          if (!w) return <span className="text-gray-400 text-xs">ยังไม่เคยล้าง</span>;
                          return <>
                            <span className={w.old ? "text-amber-600 font-bold" : ""}>{h.last_wash}</span>
                            <span className="text-xxs font-medium text-gray-400"> · {w.text}{h.wash_count > 1 ? ` · ${h.wash_count} ครั้ง` : ""}</span>
                          </>;
                        })()}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-center">
                        <span className={`text-sm font-bold ${h.balance > 0 ? "text-primary-dark" : "text-gray-400"}`}>{Math.max(0, h.balance)}</span>
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm">
                        {h.customer_name || <span className="text-gray-400">ยังไม่ผูก</span>}
                        {h.customer_count > 1 && <span className="ml-1 text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500">+{h.customer_count - 1}</span>}
                      </td>
                      <td className="px-4 py-2 border-b border-gray-100 text-sm whitespace-nowrap">
                        {h.customer_phone || <span className="text-gray-400">—</span>}
                      </td>
                      {/* ★ 25 ก.ย. 69 ปุ่ม "แก้ไข" → ลูกศร — กดทั้งแถวเปิดบ้านอยู่แล้ว (แบบการ์ดฝั่งขาย ไม่มีปุ่มบนการ์ด) */}
                      <td className="px-3 py-2 border-b border-gray-100 text-right text-lg leading-none text-gray-300 w-8">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* การ์ด mobile */}
            <div className="md:hidden">
              {rows.map((h) => (
                <div key={h.id} onClick={() => show(h.id)}
                  className="flex gap-3 px-4 py-3 border-t border-gray-100 items-start cursor-pointer active:bg-teal-50/40">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{h.house_number ? `บ้าน ${h.house_number}` : (h.project_name || "—")}</div>
                    {(q || allSelected) && h.house_number && <div className="text-xs font-semibold text-blue-900/70 truncate">{h.project_name}</div>}
                    <div className="text-xs font-medium text-gray-500">
                      {h.kwp_list ? `${h.kwp_list} kW` : "—"} · เหลือ <b>{Math.max(0, h.balance)}</b> · {h.customer_phone || "ไม่มีเบอร์"}
                    </div>
                    <div className="text-xs font-medium text-gray-500">
                      {(() => {
                        const w = washAgo(h.last_wash, washCycle);
                        return w
                          ? <>ล้างล่าสุด <span className={w.old ? "text-amber-600 font-bold" : ""}>{h.last_wash}</span> · {w.text}</>
                          : <span className="text-gray-400">ยังไม่เคยล้าง</span>;
                      })()}
                    </div>
                    <div className="mt-0.5 flex gap-1 flex-wrap">
                      {h.is_vip && <span className="text-xxs font-bold px-2 rounded-full bg-amber-100 text-amber-700">VIP</span>}
                      {!h.has_solar && <span className="text-xxs font-bold px-2 rounded-full bg-red-100 text-red-700">ไม่มีโซลาร์</span>}
                      {h.system_count > 1 && <span className="text-xxs font-bold px-2 rounded-full bg-active-light text-active">{h.system_count} ระบบ</span>}
                      {h.has_booking ? <span className="text-xxs font-bold px-2 rounded-full bg-emerald-50 text-emerald-700">มีนัด</span> : null}
                    </div>
                  </div>
                  <span className="self-center text-xl leading-none text-gray-300 shrink-0">›</span>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap text-xs text-gray-500">
              <span className="font-semibold">
                {total === 0 ? "ไม่มีรายการ"
                  : `${((page - 1) * size + 1).toLocaleString()}–${Math.min(page * size, total).toLocaleString()} จาก ${total.toLocaleString()} หลัง`}
              </span>
              {pages > 1 && <span>· หน้า <b className="text-gray-700">{page}</b> จาก {pages}</span>}
              <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold outline-none focus:border-primary cursor-pointer">
                {[30, 50, 100].map((n) => <option key={n} value={n}>{n} ต่อหน้า</option>)}
              </select>

              {pages > 1 && (
                <span className="ml-auto flex gap-1 items-center">
                  <button type="button" style={{ minHeight: 0 }} disabled={page <= 1} onClick={() => setPage(page - 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">‹</button>
                  {pageNums.map((n, i) => n === null
                    ? <span key={`gap${i}`} className="px-1 text-gray-400">…</span>
                    : <button key={n} type="button" style={{ minHeight: 0 }} onClick={() => setPage(n)}
                        className={`min-w-9 h-9 px-2 rounded-lg border text-xs font-bold cursor-pointer ${
                          n === page ? "bg-active-light border-active text-active" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                        {n}</button>)}
                  <button type="button" style={{ minHeight: 0 }} disabled={page >= pages} onClick={() => setPage(page + 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">›</button>
                </span>
              )}
            </div>
          </>
        )}
        </div>
      </div>

      {/* ★ 24 ก.ย. 69: เดิมเป็น drawer ขวา — ผู้ใช้สั่งให้เป็น modal กลางจอแบบเดียวกับการ์ดอื่น (ModalBase)
          ★ 25 ก.ย. 69: ผู้ใช้สั่งจัดใหม่ให้ดูง่ายและไม่สูงเกินไป — desktop แบ่ง 2 คอลัมน์
            ซ้าย = ข้อมูลบ้าน + ลูกค้า · ขวา = ระบบติดตั้ง + สิทธิ์ + นัด
            ปุ่มซ่อน/ลบย้ายไป footer แบบเดียวกับ modal ลูกค้า (สำเนาก่อนจัด: docs/mockup/20260925-02-om-house-modal-layout/) */}
      {open && (
        <ModalBase
          size="2xl"
          onClose={() => setOpen(false)}
          title={
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </span>
              <span className="truncate">
                {sel ? (sel.house.house_number ? `บ้าน ${sel.house.house_number}` : sel.house.project_name) : "กำลังโหลด…"}
              </span>
              {sel && <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500 shrink-0">id {sel.house.id}</span>}
              {sel?.house.is_vip && <span className="text-xxs font-bold px-2 rounded-full bg-amber-100 text-amber-700 shrink-0">VIP</span>}
            </div>
          }
          footer={sel && (
            <div className="flex gap-2 flex-wrap">
              {(!sel.house.om_excluded_reason || isAdmin) && (
                // mobile: ปุ่มจัดการบ้านอยู่แถวบน · ปิด/บันทึก อยู่แถวล่าง
                <div className="flex gap-2 max-md:w-full">
                  {/* ★ ซ่อนออกจาก O&M — ซ่อน ไม่ใช่ลบ ข้อมูลทุกอย่างยังอยู่ครบ
                      ถูกซ่อนอยู่แล้ว → ปุ่มคืนอยู่แถบเหลืองบนสุดของ modal แทน */}
                  {!sel.house.om_excluded_reason && (
                    <button type="button" style={{ minHeight: 0 }} disabled={busy} title="ซ่อน ไม่ใช่ลบ — ข้อมูลอยู่ครบ กดคืนได้ทุกเมื่อ"
                      onClick={() => { const r = window.prompt("ซ่อนบ้านหลังนี้ออกจากงาน O&M เพราะอะไร?\n(ข้อมูลไม่ถูกลบ กดคืนได้ทุกเมื่อ)", "ไม่ได้ติดโซลาร์"); if (r) setOm(false, r); }}
                      className="py-3 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white disabled:opacity-50 cursor-pointer max-md:flex-1">
                      ซ่อนจาก O&amp;M</button>
                  )}
                  {/* ★ ลบบ้านถาวร — เฉพาะแอดมินสูงสุด · สำหรับข้อมูลขยะจริง (บ้านมีประวัติลบไม่ได้ ให้ใช้ซ่อน) */}
                  {isAdmin && (
                    <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={() => del()}
                      className="py-3 px-4 rounded-xl border border-red-200 text-sm font-semibold text-red-600 bg-white hover:bg-red-50 disabled:opacity-50 cursor-pointer max-md:flex-1">
                      ลบถาวร</button>
                  )}
                </div>
              )}
              <button type="button" style={{ minHeight: 0 }} onClick={() => setOpen(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white cursor-pointer">ปิด</button>
              <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={save}
                className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:bg-primary-dark transition-colors cursor-pointer">
                {busy ? "กำลังบันทึก…" : "บันทึกการแก้ไข"}</button>
            </div>
          )}
        >
            {!sel ? <Loading /> : (
              // แถวข้างในใช้ px-5 ของตัวเองอยู่แล้ว — หักระยะขอบของ body ModalBase ออก
              <div className="-mx-5 -my-4">
                {err && <div className="mx-5 mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}

                {/* ถูกซ่อนออกจาก O&M — บอกไว้บนสุดพร้อมปุ่มคืน (ซ่อน ไม่ใช่ลบ) */}
                {sel.house.om_excluded_reason && (
                  <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <div className="text-xs font-bold text-amber-900">ซ่อนออกจากงาน O&amp;M แล้ว</div>
                      <div className="text-xxs text-amber-800">{sel.house.om_excluded_reason}</div>
                      <div className="text-xxs text-amber-700">ข้อมูลบ้าน · ลูกค้า · สิทธิ์ · ประวัติล้าง ยังอยู่ครบ</div>
                    </div>
                    <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={() => setOm(true)}
                      className="h-8 px-3 rounded-full bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-50">
                      ↩ เอากลับเข้าระบบ
                    </button>
                  </div>
                )}

                <div className="grid md:grid-cols-2 md:divide-x md:divide-gray-100">
                  {/* ── ซ้าย: ข้อมูลบ้าน (แก้ได้ · ปุ่มบันทึกอยู่ footer) + ลูกค้า */}
                  <div className="min-w-0">
                    <Sec t="ข้อมูลบ้าน" flush />
                    <div className="grid grid-cols-2 gap-3 px-5 py-3">
                      <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">บ้านเลขที่</span>
                        <input value={sel.house.house_number ?? ""} onChange={(e) => upd({ house_number: e.target.value })}
                          className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                      <label className="grid gap-1 min-w-0">
                        <span className="text-xs font-bold text-gray-700 truncate">โครงการ <small className="font-medium text-gray-400">{sel.house.project_id ? `รหัส ${sel.house.project_id}` : "ยังไม่มีรหัส"}</small></span>
                        <input value={sel.house.project_name ?? ""} disabled placeholder="ไม่อยู่ในโครงการ"
                          className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-500 truncate" /></label>
                      <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">segment</span>
                        <select value={sel.house.segment} onChange={(e) => upd({ segment: e.target.value })}
                          className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold outline-none focus:border-primary">
                          {["house", "condo", "sales_office", "facility"].map((s) => <option key={s}>{s}</option>)}
                        </select></label>
                      <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">สถานะยูนิต</span>
                        <select value={sel.house.unit_status ?? ""} onChange={(e) => upd({ unit_status: e.target.value || null })}
                          className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold outline-none focus:border-primary">
                          <option value="">—</option>
                          {["occupied", "ห้องว่าง", "บ้านตัวอย่าง", "พร้อมขาย"].map((s) => <option key={s}>{s}</option>)}
                        </select></label>
                      {/* ★ แบบบ้าน · เนื้อที่ · พิกัด จาก REM (อ่านอย่างเดียว) — ช่างใช้ประเมินงาน + นำทาง */}
                      {(sel.house.model_name || sel.house.titledeed_area || sel.house.latitude) && (
                        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                          {sel.house.model_name && <span>แบบบ้าน <b className="text-gray-800">{sel.house.model_name}</b></span>}
                          {sel.house.titledeed_area ? <span>เนื้อที่ <b className="text-gray-800">{sel.house.titledeed_area}</b> ตร.ว.</span> : null}
                          {sel.house.latitude && sel.house.longitude && (
                            <a href={`https://www.google.com/maps?q=${sel.house.latitude},${sel.house.longitude}`} target="_blank" rel="noreferrer"
                              className="font-bold text-active hover:underline">📍 เปิดแผนที่</a>
                          )}
                        </div>
                      )}
                      <label className="grid gap-1 col-span-2">
                        <span className="text-xs font-bold text-gray-700">note ทีม <small className="font-medium text-gray-400">— ลูกค้าไม่เห็น</small></span>
                        <input value={sel.house.note ?? ""} onChange={(e) => upd({ note: e.target.value })}
                          className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                      <div className="col-span-2 flex flex-wrap gap-x-6 gap-y-2">
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" checked={sel.house.is_vip} onChange={(e) => upd({ is_vip: e.target.checked })}
                            className="w-5 h-5 accent-amber-500" /> ลูกค้า VIP</label>
                        <label className="flex items-center gap-2 text-sm font-semibold">
                          <input type="checkbox" checked={sel.house.has_solar} onChange={(e) => upd({ has_solar: e.target.checked })}
                            className="w-5 h-5 accent-teal-500" /> มีระบบโซลาร์</label>
                      </div>
                    </div>

                    <Sec t={`ลูกค้า (${sel.customers.length})`} />
                    {sel.customers.length === 0 && <div className="px-5 py-2 text-xs text-gray-400">ยังไม่ผูกลูกค้า</div>}
                    {sel.customers.map((c) => (
                      <div key={c.link_id} className="flex items-center gap-2 px-5 py-2 border-b border-gray-100 text-sm">
                        <div className="flex-1 min-w-0">
                          <b>{c.full_name}</b>
                          <div className="text-xxs font-medium text-gray-500">{c.phone || "ไม่มีเบอร์"}</div>
                        </div>
                        <span className={`text-xxs font-bold px-2 rounded-full ${c.role === "owner" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                          {ROLE[c.role] ?? c.role}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── ขวา: ระบบติดตั้ง + สิทธิ์ + นัด */}
                  <div className="min-w-0">
                    <Sec t={`ระบบติดตั้ง (${sel.systems.length})`} flush />
                    {/* ★ ผู้ใช้เคาะ 2 ก.ย.: ของแถมไม่ต้องโชว์เป็นรายการและห้ามโชว์ราคา
                        บอกแค่ว่า "เจอใน REM" กับข้อมูลโซลาร์ซึ่งเป็นที่มาของขนาดระบบ */}
                    {!!sel.promo?.n_items && (
                      <div className="mx-5 mt-2 text-xxs text-gray-500">
                        พบรายการของแถมใน REM {sel.promo.n_items} รายการ
                        {sel.promo.n_solar > 0 && (
                          <span className="text-active-dark font-bold">
                            {" · ☀ มีโซลาร์"}
                            {sel.promo.solar_kw ? ` ${sel.promo.solar_kw} kW` : ""}
                            {sel.promo.om_years ? ` · O&M ${sel.promo.om_years} ปี` : ""}
                          </span>
                        )}
                        {sel.promo.contract_id && <span className="text-gray-400"> · {sel.promo.contract_id}</span>}
                      </div>
                    )}
                    {sel.systems.length === 0 && (
                      <div className="px-5 py-2 text-xs text-gray-400">ไม่มีระบบติดตั้ง{sel.house.has_solar ? "" : " (has_solar=0)"}</div>
                    )}
                    {sel.systems.map((s, i) => {
                      const pos = (sel.pos ?? []).filter((p) => p.installation_id === s.id);
                      return (
                      <div key={s.id} className="mx-5 my-3 rounded-xl border border-gray-200 overflow-hidden">
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
                          <span className="text-right font-semibold break-all">{s.inverter_brand || "—"}{s.inverter_sn ? ` · ${s.inverter_sn}` : ""}</span>
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
                        {(() => {
                          const rows = sourceRows(sel, s, i === 0);
                          return (
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
                          );
                        })()}
                      </div>
                      );
                    })}

                    <Sec t="สิทธิ์ล้างแผง" action={<span className="text-xl font-bold text-primary-dark">{balance} <small className="text-xxs font-medium text-gray-500">ครั้ง คงเหลือ</small></span>} />

                    {/* ปุ่มแก้ไข — ข้อมูล import ถึงแค่ มิ.ย. 69 ต้องเติมของใหม่เองได้
                        ★ สิทธิ์ชนิดอื่นที่ขายเป็นครั้ง (แพ็คตรวจเช็ก ฯลฯ) ยอดแยกกันคนละใบ — ชิปอยู่แถวเดียวกับปุ่ม */}
                    <div className="flex flex-wrap items-center gap-2 px-5 py-2 border-b border-gray-100">
                      <button type="button" style={{ minHeight: 0 }} disabled={!sel.systems.length}
                        onClick={() => { setEntForm(entForm === "wash" ? "" : "wash"); setWashDate(new Date().toISOString().slice(0, 10)); }}
                        className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-40">
                        {quotaTypes.length > 1 ? "+ บันทึกใช้สิทธิ์" : "+ บันทึกล้างแผง"}</button>
                      <button type="button" style={{ minHeight: 0 }} disabled={!sel.systems.length}
                        onClick={() => setEntForm(entForm === "grant" ? "" : "grant")}
                        className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-40">
                        ± ปรับสิทธิ์</button>
                      {!sel.systems.length && <span className="text-xxs text-gray-400">ต้องมีระบบติดตั้งก่อน</span>}
                      {otherBals.map((b) => (
                        <span key={b.service_type_id} className="text-xxs font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">
                          {b.service_type_label} เหลือ {Math.max(0, b.balance)}/{b.total_granted}
                        </span>
                      ))}
                    </div>

                    {entForm === "wash" && (
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 grid gap-2">
                        <div className="flex gap-2 flex-wrap">
                          {quotaTypes.length > 1 && (
                            <label className="grid gap-1"><span className="text-xxs font-bold text-gray-600">งานที่ทำ</span>
                              <select value={washType || String(cleaningId)} onChange={(e) => setWashType(e.target.value)}
                                className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold bg-white outline-none focus:border-primary">
                                {quotaTypes.map((t) => <option key={t.id} value={String(t.id)}>{t.label_th}</option>)}
                              </select></label>
                          )}
                          <label className="grid gap-1"><span className="text-xxs font-bold text-gray-600">วันที่</span>
                            <input type="date" value={washDate} onChange={(e) => setWashDate(e.target.value)}
                              className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold bg-white outline-none focus:border-primary" /></label>
                          <label className="grid gap-1 flex-1 min-w-[160px]"><span className="text-xxs font-bold text-gray-600">หมายเหตุ</span>
                            <input value={washNote} onChange={(e) => setWashNote(e.target.value)} placeholder="เช่น ทีม A ล้างรอบประจำปี"
                              className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold bg-white outline-none focus:border-primary" /></label>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" style={{ minHeight: 0 }} disabled={busy || !washDate} onClick={addWash}
                            className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">บันทึก (หักสิทธิ์ 1)</button>
                          <button type="button" style={{ minHeight: 0 }} onClick={() => setEntForm("")}
                            className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">ยกเลิก</button>
                        </div>
                      </div>
                    )}

                    {entForm === "grant" && (
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 grid gap-2">
                        <div className="flex gap-2 flex-wrap">
                          <label className="grid gap-1 w-24"><span className="text-xxs font-bold text-gray-600">จำนวน (+/−)</span>
                            <input type="number" value={grantQty} onChange={(e) => setGrantQty(e.target.value)}
                              className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold bg-white outline-none focus:border-primary" /></label>
                          <label className="grid gap-1"><span className="text-xxs font-bold text-gray-600">สิทธิ์ของงาน</span>
                            <select value={grantType || String(cleaningId)} onChange={(e) => setGrantType(e.target.value)}
                              className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold bg-white outline-none focus:border-primary">
                              {types.map((t) => <option key={t.id} value={String(t.id)}>{t.label_th}</option>)}
                            </select></label>
                          <label className="grid gap-1"><span className="text-xxs font-bold text-gray-600">ที่มา</span>
                            <select value={grantSrc} onChange={(e) => setGrantSrc(e.target.value)}
                              className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold bg-white outline-none focus:border-primary">
                              <option value="renewal">ต่อสัญญา</option>
                              <option value="purchase">ซื้อเพิ่ม</option>
                              <option value="manual_adjust">ปรับมือ / หมดสิทธิ์</option>
                            </select></label>
                          <label className="grid gap-1 flex-1 min-w-[160px]"><span className="text-xxs font-bold text-gray-600">เหตุผล</span>
                            <input value={grantWhy} onChange={(e) => setGrantWhy(e.target.value)} placeholder="เช่น ต่อสัญญา 2 ปี / หมดอายุ 31 ธ.ค. 69"
                              className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold bg-white outline-none focus:border-primary" /></label>
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <button type="button" style={{ minHeight: 0 }} disabled={busy || !Number(grantQty)} onClick={addGrant}
                            className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">บันทึก</button>
                          <button type="button" style={{ minHeight: 0 }} onClick={() => setEntForm("")}
                            className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 cursor-pointer">ยกเลิก</button>
                          <span className="text-xxs text-gray-500">ใส่เลขติดลบเพื่อตัดสิทธิ์ เช่น −{Math.max(1, balance)} = ตัดให้เหลือ 0</span>
                        </div>
                      </div>
                    )}

                    {sel.grants.map((g) => (
                      <div key={`g${g.id}`} className="flex items-center gap-2.5 px-5 py-1.5 border-b border-gray-100 text-xxs text-gray-500">
                        <b className={`min-w-[38px] ${g.qty < 0 ? "text-red-600" : "text-gray-700"}`}>{g.qty > 0 ? "+" : ""}{g.qty}</b>
                        <span className="text-xxs font-bold px-2 rounded-full bg-emerald-50 text-emerald-700">{SRC[g.source] ?? g.source}</span>
                        {g.service_type_id !== cleaningId && (
                          <span className="text-xxs font-bold px-2 rounded-full bg-sky-50 text-sky-700">{g.service_type}</span>
                        )}
                        <span className="flex-1 truncate">{g.reason || ""}</span>
                        <button type="button" style={{ minHeight: 0 }} disabled={busy}
                          onClick={() => delEnt("grant", g.id, `${g.qty > 0 ? "+" : ""}${g.qty} ${SRC[g.source] ?? g.source}`)}
                          className="w-6 h-6 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer shrink-0">×</button>
                      </div>
                    ))}
                    {sel.redemptions.map((r) => (
                      <div key={`r${r.id}`} className="flex items-center gap-2.5 px-5 py-1.5 border-b border-gray-100 text-xxs text-gray-500">
                        <b className="text-gray-700 min-w-[38px]">−1</b>
                        <span className={`text-xxs font-bold px-2 rounded-full ${r.service_type_id === cleaningId ? "bg-gray-100 text-gray-500" : "bg-sky-50 text-sky-700"}`}>
                          {r.service_type_id === cleaningId ? `ล้างครั้งที่ ${redIndex.get(r.id)}` : `${r.service_type} ครั้งที่ ${redIndex.get(r.id)}`}</span>
                        <span className="flex-1 truncate">{r.service_date}{r.note ? ` · ${r.note}` : ""}</span>
                        <button type="button" style={{ minHeight: 0 }} disabled={busy}
                          onClick={() => delEnt("redemption", r.id, `${r.service_type} วันที่ ${r.service_date}`)}
                          className="w-6 h-6 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer shrink-0">×</button>
                      </div>
                    ))}

                    {sel.bookings.length > 0 && (
                      <>
                        <Sec t="นัดล่าสุด" />
                        {sel.bookings.map((b) => (
                          <div key={b.id} className="flex gap-2 px-5 py-1.5 border-b border-gray-100 text-xs">
                            <span>{b.scheduled_at?.slice(0, 16).replace("T", " · ")}</span>
                            <span className="font-semibold">{b.service_type || "—"}</span>
                            <span className="ml-auto text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500">{b.status}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
        </ModalBase>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[90] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}</div>
      )}
    </div>
  );
}

// flush = หัวข้อบนสุดของคอลัมน์ใน modal — ชิดเส้นใต้หัว modal อยู่แล้ว ไม่ต้องมีเส้นบนซ้ำ
function Sec({ t, action, flush }: { t: string; action?: React.ReactNode; flush?: boolean }) {
  return (
    <div className={`px-5 py-2 ${flush ? "" : "border-t border-gray-200"} border-b border-b-gray-100 bg-gray-50 flex items-center gap-2`}>
      <b className="text-xs font-bold">{t}</b><span className="ml-auto">{action}</span>
    </div>
  );
}
