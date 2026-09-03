"use client";

// บ้าน / ระบบติดตั้ง — สองคอลัมน์: ซ้าย=กลุ่มโครงการ ขวา=ตารางบ้าน (mockup 20260901_04)
// สิทธิ์ล้างอยู่หน้านี้ (ledger รายบ้าน) — ไม่อยู่หน้าลูกค้า
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
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
  grp: string; pid: string | null; name: string; special: boolean; nonHouse: boolean;
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
    warranty_doc_no: string | null; battery_brand: string | null; battery_kwh: number | null; lead_id: number | null;
    rem_contract_id: string | null; rem_contract_status: string | null; rem_transfer_date: string | null;
    rem_checked_at: string | null; source_batch_id: number | null; batch_file: string | null;
    batch_note: string | null; batch_at: string | null }[];
  grants: { id: number; qty: number; source: string; reason: string | null; created_at: string }[];
  redemptions: { id: number; service_date: string; note?: string | null }[];
  customers: { link_id: number; role: string; customer_id: number; full_name: string; phone: string | null }[];
  bookings: { id: number; scheduled_at: string; status: string; service_type: string | null }[];
  // ของแถมตอนขาย — เก็บแค่ "เจอกี่รายการ" กับข้อมูลโซลาร์ · ★ ไม่มีราคา ไม่มีรายชื่อของแถม
  promo?: { n_items: number; n_solar: number; solar_kw: number | null; om_years: number | null;
    solar_name: string | null; contract_id: string | null } | null;
}
const ROLE: Record<string, string> = { owner: "เจ้าของ", resident: "ผู้อยู่อาศัย", contact: "ผู้ติดต่อ" };
const SRC: Record<string, string> = { contract_base: "สิทธิ์ตั้งต้น", renewal: "ต่อสัญญา", purchase: "ซื้อเพิ่ม", import: "import", manual_adjust: "ปรับมือ" };
// แท็บกรอง — key ตรงกับทั้ง /api/om/houses?filter= และธงใน /api/om/houses/groups
const TABS: { k: string; t: string; s: keyof Stats }[] = [
  { k: "", t: "ทั้งหมด", s: "total" },
  { k: "duewash", t: "ถึงคิวล้าง", s: "duewash" },
  { k: "nophone", t: "ไม่มีเบอร์", s: "nophone" },
  { k: "nowarr", t: "ไม่มีวันประกัน", s: "nowarr" },
  { k: "noinv", t: "ไม่รู้อินเวอร์เตอร์", s: "noinv" },
  { k: "nocust", t: "ยังไม่ผูกลูกค้า", s: "nocust" },
  // ★ 2 ก.ย.: บ้านที่จดว่าไม่ติดโซลาร์ 50 หลัง ถูกซ่อนออกไปแล้ว (is_om=0 + om_excluded_reason)
  //   เหลือ "รอตรวจ" = ไม่มีสเปกระบบและไม่เคยล้าง ยังจับไม่ได้ว่ามีโซลาร์จริงไหม
  { k: "nospec", t: "รอตรวจ · ไม่มีสเปก", s: "nospec" },
  { k: "hidden", t: "ซ่อนไว้", s: "hidden" },
];

// วันล้างล่าสุด → ข้อความ "ผ่านมานานแค่ไหน" + ธงเกิน 1 ปี
function washAgo(d: string | null): { text: string; old: boolean } | null {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  const text = days < 31 ? `${days} วัน` : days < 365 ? `${Math.round(days / 30)} เดือน` : `${(days / 365).toFixed(1)} ปี`;
  return { text, old: days > 365 };
}

export default function OmHousesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [grp, setGrp] = useState("__ALL__");   // เริ่มที่ ทุกโครงการ — กดแท็บงานค้างต้องเห็นทั้งระบบ
  const [gq, setGq] = useState("");
  const [showSite, setShowSite] = useState(false);  // คอนโด/สำนักงานขาย/ส่วนกลาง — ไม่ใช่บ้านลูกค้า ซ่อนไว้ก่อน
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
      ...(showSite ? {} : { nosite: "1" }),
    });
    apiFetch(`/api/om/houses?${u}`)
      .then((d) => { setRows(d.houses ?? []); setTotal(d.total ?? 0); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [q, filter, grp, page, size, showSite]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => {
    if (!showSite && groups?.some((g) => g.grp === grp && g.nonHouse)) setGrp("__ALL__");
  }, [showSite, grp, groups]);

  const show = async (id: number) => {
    setOpen(true); setSel(null);
    try { setSel(await apiFetch(`/api/om/houses/${id}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setOpen(false); }
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
  const addWash = () => entCall({ method: "POST", body: JSON.stringify({ kind: "redemption", service_date: washDate, note: washNote || null }) });
  const addGrant = () => entCall({ method: "POST", body: JSON.stringify({ kind: "grant", qty: Number(grantQty), source: grantSrc, reason: grantWhy || null }) });
  const delEnt = (kind: "grant" | "redemption", ref: number, label: string) => {
    if (!confirm(`ลบ "${label}" ออกจากสิทธิ์บ้านหลังนี้?`)) return;
    entCall({ method: "DELETE" }, `?kind=${kind}&ref=${ref}`);
  };

  const balance = sel ? Math.max(0, sel.grants.reduce((s, g) => s + g.qty, 0) - sel.redemptions.length) : 0;

  const cur = groups?.find((g) => g.grp === grp) ?? null;
  const allHouses = (groups ?? []).reduce((n, g) => n + (g.nonHouse && !showSite ? 0 : g.houses), 0);
  const nonHouse = (groups ?? []).filter((g) => g.nonHouse);
  const nonHouseTotal = nonHouse.reduce((n, g) => n + g.houses, 0);
  const shownGroups = (groups ?? []).filter((g) => {
    if (g.nonHouse && !showSite) return false;
    const t = gq.trim().toLowerCase();
    if (t && !`${g.name} ${g.pid ?? ""}`.toLowerCase().includes(t)) return false;
    if (filter === "hidden") return true;   // ของที่ซ่อนไม่อยู่ในตัวนับรายกลุ่ม
    return !filter || Number(g[filter as keyof Group] ?? 0) > 0;
  });
  // ตัวเลขบนแท็บต้องตรงกับสิ่งที่เห็น — หักไซต์บริษัทออกเมื่อซ่อนอยู่
  const shownStats: Stats | null = !stats ? null : showSite ? stats : {
    total: stats.total - nonHouseTotal,
    nophone: stats.nophone - nonHouse.reduce((n, g) => n + g.nophone, 0),
    nowarr: stats.nowarr - nonHouse.reduce((n, g) => n + g.nowarr, 0),
    noinv: stats.noinv - nonHouse.reduce((n, g) => n + g.noinv, 0),
    nocust: stats.nocust - nonHouse.reduce((n, g) => n + g.nocust, 0),
    duewash: stats.duewash - nonHouse.reduce((n, g) => n + g.duewash, 0),
    nosolar: stats.nosolar - nonHouse.reduce((n, g) => n + g.nosolar, 0),
    nospec: stats.nospec - nonHouse.reduce((n, g) => n + g.nospec, 0),
    hidden: stats.hidden,   // ของที่ซ่อนอยู่นอก is_om อยู่แล้ว ไม่ต้องหักกลุ่ม
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

  return (
    <div className="p-3 md:p-5 flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      {/* แถบ sync — ทะเบียน REM · กวาดงานขาย · ของค้างรอคนตัดสิน (mockup 20260902_01) */}
      <SyncBar onChanged={() => { load(); loadGroups(); }} />

      {/* แถบบน — ค้นหาข้ามทุกกลุ่ม + แท็บงานค้าง */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="ค้นหา บ้านเลขที่ · ชื่อลูกค้า · เบอร์"
            className="h-9 w-full max-w-[420px] rounded-full border border-gray-200 bg-gray-50 px-4 text-sm font-semibold outline-none focus:bg-white focus:border-gray-300" />
          <button type="button" style={{ minHeight: 0 }}
            className="h-9 px-4 rounded-full bg-primary text-white text-sm font-bold cursor-pointer">+ เพิ่มบ้าน</button>
        </div>
        <div className="flex items-center px-4 border-t border-gray-100 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.k} type="button" style={{ minHeight: 0 }}
              onClick={() => { setFilter(t.k); setGrp("__ALL__"); setPage(1); setQ(""); }}
              className={`px-2.5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px whitespace-nowrap shrink-0 cursor-pointer ${
                filter === t.k ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {t.t}
              {tabCount(t.s) !== null && <span className={`ml-1 text-xs font-medium normal-case ${filter === t.k ? "text-active" : "text-gray-400"}`}>
                ({tabCount(t.s)!.toLocaleString()})</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[300px_1fr] items-start">
        {/* ซ้าย — กลุ่มโครงการ */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="p-2.5 border-b border-gray-100">
            <input value={gq} onChange={(e) => setGq(e.target.value)} placeholder="ค้นหาโครงการ…"
              className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
          </div>
          {groups === null ? <Loading /> : (
            <div className="max-h-[280px] md:max-h-[60vh] overflow-y-auto">
              <button type="button" style={{ minHeight: 0 }}
                onClick={() => { setGrp("__ALL__"); setPage(1); setQ(""); }}
                className={`w-full text-left px-3.5 py-2 border-b border-gray-100 flex items-center gap-2 cursor-pointer ${
                  allSelected && !q ? "bg-active-light shadow-[inset_3px_0_0_var(--active)]" : "hover:bg-gray-50"}`}>
                <span className="flex-1 text-sm font-bold">ทุกโครงการ</span>
                <b className="text-sm text-blue-900">{allHouses.toLocaleString()}</b>
              </button>
              {[false, true].map((sp) => {
                const list = shownGroups.filter((g) => g.special === sp);
                if (!list.length) return null;
                return (
                  <div key={String(sp)}>
                    <div className="px-3.5 py-1.5 bg-gray-50 border-b border-gray-100 text-xxs font-bold text-gray-400 tracking-wide">
                      {sp ? "กลุ่มพิเศษ" : `โครงการ · ${list.length}`}
                    </div>
                    {list.map((g) => (
                      <button key={g.grp} type="button" style={{ minHeight: 0 }}
                        onClick={() => { setGrp(g.grp); setPage(1); setQ(""); }}
                        className={`w-full text-left px-3.5 py-2 border-b border-gray-100 flex items-center gap-2 cursor-pointer ${
                          g.grp === grp && !q ? "bg-active-light shadow-[inset_3px_0_0_var(--active)]" : "hover:bg-gray-50"}`}>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm truncate ${g.special ? "font-bold" : "font-semibold"}`}>{g.name || "(ไม่ระบุ)"}</span>
                          <span className="block text-xxs font-medium text-gray-400 truncate">
                            {g.pid ?? (g.grp === "__VIP__" ? "รายบุคคล" : g.grp === "__SITE__" ? "ของบริษัท" : "—")}
                            {g.duewash > 0 && <span className="text-amber-600 font-bold"> · ถึงคิวล้าง {g.duewash}</span>}
                          </span>
                        </span>
                        <b className="text-sm text-blue-900 shrink-0">{g.houses.toLocaleString()}</b>
                      </button>
                    ))}
                  </div>
                );
              })}
              {!shownGroups.length && <div className="px-4 py-3 text-xs text-gray-400">ไม่พบโครงการ</div>}
              {nonHouse.length > 0 && (
                <button type="button" style={{ minHeight: 0 }} onClick={() => setShowSite(!showSite)}
                  className="w-full px-3.5 py-2 text-left text-xxs font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer">
                  {showSite ? "ซ่อน" : "แสดง"}กลุ่มที่ไม่ใช่บ้าน ({nonHouseTotal})
                  <span className="block font-medium text-gray-400">
                    {nonHouse.map((g) => `${g.name} ${g.houses}`).join(" · ")}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ขวา — ตารางบ้าน */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-baseline gap-3 flex-wrap">
            <b className="text-base font-bold">
              {q ? `ผลค้นหา "${q}"` : allSelected ? "ทุกโครงการ" : (cur?.name ?? "—")}
            </b>
            <span className="text-xs font-medium text-gray-500">
              {q ? `${total.toLocaleString()} รายการ`
                : allSelected ? `${total.toLocaleString()} หลัง${filter ? ` · ${TABS.find((t) => t.k === filter)?.t}` : ""}`
                : cur ? `${cur.pid ? `${cur.pid} · ` : ""}${total.toLocaleString()} หลัง · สิทธิ์เหลือรวม ${cur.bal.toLocaleString()}${cur.vip && !isVipGroup ? ` · VIP ${cur.vip}` : ""}`
                : ""}
            </span>
          </div>
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
                          const w = washAgo(h.last_wash);
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
                      <td className="px-4 py-2 border-b border-gray-100 text-right">
                        <button type="button" style={{ minHeight: 0 }} onClick={(e) => { e.stopPropagation(); show(h.id); }}
                          className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">แก้ไข</button>
                      </td>
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
                        const w = washAgo(h.last_wash);
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
                  <button type="button" style={{ minHeight: 0 }} onClick={(e) => { e.stopPropagation(); show(h.id); }}
                    className="h-10 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 shrink-0">แก้ไข</button>
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

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setOpen(false)} />
          <div className="fixed z-50 bg-white flex flex-col md:top-0 md:right-0 md:bottom-0 md:w-[520px]
                          max-md:inset-x-0 max-md:bottom-0 max-md:h-[88vh] max-md:rounded-t-2xl">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-2">
              <b className="text-base font-bold">
                {sel ? (sel.house.house_number ? `บ้าน ${sel.house.house_number}` : sel.house.project_name) : "กำลังโหลด…"}
              </b>
              {sel && <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500">id {sel.house.id}</span>}
              <button type="button" style={{ minHeight: 0 }} onClick={() => setOpen(false)}
                className="ml-auto text-lg text-gray-400 cursor-pointer">×</button>
            </div>

            {!sel ? <Loading /> : (
              <div className="flex-1 overflow-y-auto">
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">บ้านเลขที่</span>
                    <input value={sel.house.house_number ?? ""} onChange={(e) => upd({ house_number: e.target.value })}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-gray-700">โครงการ <small className="font-medium text-gray-400">{sel.house.project_id ? `รหัส ${sel.house.project_id}` : "ยังไม่มีรหัส"}</small></span>
                    <input value={sel.house.project_name ?? ""} disabled
                      className="h-9 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-500" /></label>
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
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                      {sel.house.model_name && <span>แบบบ้าน <b className="text-gray-800">{sel.house.model_name}</b></span>}
                      {sel.house.titledeed_area ? <span>เนื้อที่ <b className="text-gray-800">{sel.house.titledeed_area}</b> ตร.ว.</span> : null}
                      {sel.house.latitude && sel.house.longitude && (
                        <a href={`https://www.google.com/maps?q=${sel.house.latitude},${sel.house.longitude}`} target="_blank" rel="noreferrer"
                          className="font-bold text-active hover:underline">📍 เปิดแผนที่</a>
                      )}
                    </div>
                  )}
                  <label className="grid gap-1 sm:col-span-2">
                    <span className="text-xs font-bold text-gray-700">note ทีม <small className="font-medium text-gray-400">— ลูกค้าไม่เห็น</small></span>
                    <input value={sel.house.note ?? ""} onChange={(e) => upd({ note: e.target.value })}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" /></label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={sel.house.is_vip} onChange={(e) => upd({ is_vip: e.target.checked })}
                      className="w-5 h-5 accent-amber-500" /> ลูกค้า VIP</label>
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={sel.house.has_solar} onChange={(e) => upd({ has_solar: e.target.checked })}
                      className="w-5 h-5 accent-teal-500" /> มีระบบโซลาร์</label>
                </div>

                {/* ★ ซ่อนออกจาก O&M — ซ่อน ไม่ใช่ลบ ข้อมูลทุกอย่างยังอยู่ครบ กดคืนได้ทันที */}
                <div className="mx-5 mb-3">
                  {sel.house.om_excluded_reason ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex items-start gap-3 flex-wrap">
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
                  ) : (
                    <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={() => { const r = window.prompt("ซ่อนบ้านหลังนี้ออกจากงาน O&M เพราะอะไร?\n(ข้อมูลไม่ถูกลบ กดคืนได้ทุกเมื่อ)", "ไม่ได้ติดโซลาร์"); if (r) setOm(false, r); }}
                      className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-600 cursor-pointer disabled:opacity-50">
                      ซ่อนออกจากงาน O&amp;M
                    </button>
                  )}
                </div>

                <Sec t={`ระบบติดตั้ง (${sel.systems.length})`} />
                {/* ★ ผู้ใช้เคาะ 2 ก.ย.: ของแถมไม่ต้องโชว์เป็นรายการและห้ามโชว์ราคา
                    บอกแค่ว่า "เจอใน REM" กับข้อมูลโซลาร์ซึ่งเป็นที่มาของขนาดระบบ */}
                {!!sel.promo?.n_items && (
                  <div className="mx-5 mb-2 text-xxs text-gray-500">
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
                {sel.systems.map((s, i) => (
                  <div key={s.id} className="mx-5 my-3 rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-3.5 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-xs font-bold">
                      ระบบที่ {i + 1}
                      {s.lead_id && <span className="text-xxs font-bold px-2 rounded-full bg-active-light text-active">จากระบบขาย · lead {s.lead_id}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 px-3.5 py-2 text-xxs leading-relaxed">
                      <span className="text-gray-500">ขนาด</span>
                      <span className="text-right font-semibold">
                        {s.kwp ? `${s.kwp} kWp`
                          : s.promo_size_kw ? <>{s.promo_size_kw} kW <small className="font-medium text-gray-400">— จากของแถม</small></>
                          : "— ขาด"}
                      </span>
                      <span className="text-gray-500">Inverter</span><span className="text-right font-semibold">{s.inverter_brand || "—"}{s.inverter_sn ? ` · ${s.inverter_sn}` : ""}</span>
                      <span className="text-gray-500">วันเริ่มประกัน</span><span className="text-right font-semibold">{s.warranty_start || "ยังไม่มี"}</span>
                      <span className="text-gray-500">ใบรับประกัน</span><span className="text-right font-semibold">{s.warranty_doc_no || "—"}</span>
                      {s.battery_brand && <><span className="text-gray-500">แบตเตอรี่</span>
                        <span className="text-right font-semibold">{s.battery_brand}{s.battery_kwh ? ` ${s.battery_kwh} kWh` : ""}</span></>}
                    </div>
                    {/* ที่มาข้อมูล — ตอบว่าเลข kWp/วันที่มาจากไหน (REM / ไฟล์ import / ระบบขาย) */}
                    <div className="px-3.5 py-2 border-t border-gray-100 bg-gray-50 grid gap-0.5 text-xxs text-gray-500">
                      <b className="text-gray-600">ที่มาข้อมูล</b>
                      {s.rem_contract_id && (
                        <div>
                          <span className="text-xxs font-bold px-2 rounded-full bg-blue-50 text-blue-700">REM</span>{" "}
                          สัญญา <b className="text-gray-700">{s.rem_contract_id}</b>
                          {s.rem_contract_status ? ` · ${s.rem_contract_status}` : ""}
                          {s.kwp ? ` · ขนาด ${s.kwp} kWp` : ""}
                          {s.rem_transfer_date ? ` · โอน ${s.rem_transfer_date}` : ""}
                          {s.rem_checked_at ? ` · ดึงเมื่อ ${s.rem_checked_at.slice(0, 16).replace("T", " ")}` : ""}
                        </div>
                      )}
                      {s.lead_id && (
                        <div>
                          <span className="text-xxs font-bold px-2 rounded-full bg-active-light text-active">ระบบขาย</span>{" "}
                          lead {s.lead_id}
                        </div>
                      )}
                      {s.batch_file && (
                        <div>
                          <span className="text-xxs font-bold px-2 rounded-full bg-gray-200 text-gray-600">นำเข้า</span>{" "}
                          {s.batch_file}{s.batch_at ? ` · ${s.batch_at}` : ""}
                          {s.batch_note ? <span className="block pl-1 text-gray-400">{s.batch_note}</span> : null}
                        </div>
                      )}
                      {/* ★ ของแถมโซลาร์จาก REM — ที่มาของ "ขนาดระบบ" เวลาไฟล์นำเข้าไม่มี kWp */}
                      {sel.promo && sel.promo.n_solar > 0 && (
                        <div>
                          <span className="text-xxs font-bold px-2 rounded-full bg-active-light text-active">ของแถม</span>{" "}
                          <span className="text-active-dark font-bold">☀ {sel.promo.solar_name || "Solar Roof"}</span>
                          {sel.promo.solar_kw ? ` · ${sel.promo.solar_kw} kW` : ""}
                          {sel.promo.om_years ? ` · O&M ${sel.promo.om_years} ปี` : ""}
                        </div>
                      )}
                      {!s.rem_contract_id && !s.lead_id && !s.batch_file && <div className="text-gray-400">ไม่มีข้อมูลที่มา (กรอกมือ)</div>}
                    </div>
                  </div>
                ))}

                <Sec t="สิทธิ์ล้างแผง" action={<span className="text-xl font-bold text-primary-dark">{balance} <small className="text-xxs font-medium text-gray-500">ครั้ง คงเหลือ</small></span>} />

                {/* ปุ่มแก้ไข — ข้อมูล import ถึงแค่ มิ.ย. 69 ต้องเติมของใหม่เองได้ */}
                <div className="flex gap-2 px-5 py-2 border-b border-gray-100">
                  <button type="button" style={{ minHeight: 0 }} disabled={!sel.systems.length}
                    onClick={() => { setEntForm(entForm === "wash" ? "" : "wash"); setWashDate(new Date().toISOString().slice(0, 10)); }}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-40">
                    + บันทึกล้างแผง</button>
                  <button type="button" style={{ minHeight: 0 }} disabled={!sel.systems.length}
                    onClick={() => setEntForm(entForm === "grant" ? "" : "grant")}
                    className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-40">
                    ± ปรับสิทธิ์</button>
                  {!sel.systems.length && <span className="self-center text-xxs text-gray-400">ต้องมีระบบติดตั้งก่อน</span>}
                </div>

                {entForm === "wash" && (
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 grid gap-2">
                    <div className="flex gap-2 flex-wrap">
                      <label className="grid gap-1"><span className="text-xxs font-bold text-gray-600">วันที่ล้าง</span>
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
                      <label className="grid gap-1"><span className="text-xxs font-bold text-gray-600">ประเภท</span>
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
                    <span className="flex-1 truncate">{g.reason || ""}</span>
                    <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={() => delEnt("grant", g.id, `${g.qty > 0 ? "+" : ""}${g.qty} ${SRC[g.source] ?? g.source}`)}
                      className="w-6 h-6 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer shrink-0">×</button>
                  </div>
                ))}
                {sel.redemptions.map((r, i) => (
                  <div key={`r${r.id}`} className="flex items-center gap-2.5 px-5 py-1.5 border-b border-gray-100 text-xxs text-gray-500">
                    <b className="text-gray-700 min-w-[38px]">−1</b>
                    <span className="text-xxs font-bold px-2 rounded-full bg-gray-100 text-gray-500">ล้างครั้งที่ {i + 1}</span>
                    <span className="flex-1 truncate">{r.service_date}{r.note ? ` · ${r.note}` : ""}</span>
                    <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={() => delEnt("redemption", r.id, `ล้างวันที่ ${r.service_date}`)}
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

                <Sec t={`ชื่อลูกค้า (${sel.customers.length})`} />
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
            )}

            {sel && (
              <div className="px-5 py-3 border-t border-gray-200 flex gap-2">
                <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={save}
                  className="h-9 px-5 rounded-lg bg-primary text-white text-sm font-semibold cursor-pointer max-md:flex-1">บันทึกการแก้ไข</button>
              </div>
            )}
          </div>
        </>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}</div>
      )}
    </div>
  );
}

function Sec({ t, action }: { t: string; action?: React.ReactNode }) {
  return (
    <div className="px-5 py-2 border-t border-gray-200 border-b border-b-gray-100 bg-gray-50 flex items-center gap-2">
      <b className="text-xs font-bold">{t}</b><span className="ml-auto">{action}</span>
    </div>
  );
}
