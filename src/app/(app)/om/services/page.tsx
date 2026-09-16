"use client";

// งานบริการ O&M — ไปป์ไลน์ ติดตาม → ทำนัด → รอ O&M → เข้า O&M → ปิดงาน
// mockup: 20260907_01 (โครงหน้า+ใบงาน) · 20260909_05 (แท็บติดตาม+บันทึกการโทร)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69
//   - การ์ดในแท็บติดตาม "คำนวณสด" ไม่มีแถวงานรอไว้ · แถวงานเกิดตอนโทรแล้วได้ความเท่านั้น
//   - ไม่มีรอบโทร ไม่มีเจ้าของงาน ใครเปิดหน้านี้ก็โทรต่อได้ (ประวัติอยู่ในใบงาน)
//   - การ์ดไม่มีปุ่ม กดทั้งใบเข้าไปทำข้างใน เหมือน LeadCard ของฝั่งขาย
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { CALL_OUTCOME } from "@/lib/om/booking";

// 5 ขั้นที่ผู้ใช้เคาะ 9 ก.ย. (ตรงกับ mockup 20260909_04)
const FLOW = [
  { k: "follow", t: "ติดตาม" },
  { k: "pending", t: "ทำนัด" },
  { k: "confirmed", t: "รอ O&M" },
  { k: "progress", t: "เข้า O&M" },
  { k: "closed", t: "ปิดงาน" },
] as const;

const TABS = [
  { k: "follow", t: "ติดตาม" },
  { k: "pending", t: "ทำนัด" },
  { k: "confirmed", t: "รอ O&M" },
  { k: "progress", t: "เข้า O&M" },
  { k: "checked", t: "รอลูกค้ายืนยัน" },
  { k: "closed", t: "ปิดงาน" },
  { k: "unreachable", t: "ติดต่อไม่ได้" },
  { k: "declined", t: "ไม่เอา" },
  { k: "noquota", t: "สิทธิ์หมด" },
] as const;

const TONE: Record<string, string> = {
  follow: "bg-gray-500", pending: "bg-amber-500", confirmed: "bg-blue-600",
  progress: "bg-violet-600", checked: "bg-teal-600", closed: "bg-emerald-600",
  unreachable: "bg-red-500", declined: "bg-gray-400", noquota: "bg-orange-500",
};
const BUCKET_LABEL: Record<string, string> = Object.fromEntries(TABS.map((t) => [t.k, t.t]));

const SORTS = [
  { k: "overdue", t: "ค้างนานที่สุดก่อน" },
  { k: "recent", t: "เพิ่งถึงรอบก่อน" },
  { k: "quota", t: "สิทธิ์เหลือมากก่อน" },
  { k: "project", t: "รวมตามโครงการ" },
  { k: "house", t: "บ้านเลขที่" },
];

interface Item {
  house_id: number; house_number: string | null; project_id: string | null; project_name: string | null;
  balance: number; last_wash: string | null; wash_count: number;
  customer_id: number | null; customer_name: string | null; phone: string | null;
  kwp_list: string | null; warranty_start: string | null;
  calls: number; no_answer: number; last_call_at: string | null; next_call: string | null;
  last_outcome: string | null; last_by: string | null;
  booking_id: number | null; job_status: string | null; scheduled_at: string | null;
  team_id: number | null; team_name: string | null; service_type: string | null;
  bucket: string;
}
type Team = { id: number; name: string; color: string | null; open_jobs: number };

const thD = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const thDT = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const monthsAgo = (s: string | null) =>
  !s ? null : Math.round((Date.now() - new Date(s).getTime()) / 2592000000);

const I = ({ d, c, fill }: { d: string; c: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill={fill ? c : "none"} stroke={fill ? "none" : c} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const D = {
  house: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z",
  pin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.14-7.5 11.25-7.5 11.25S4.5 17.64 4.5 10.5a7.5 7.5 0 1115 0z",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
};

/** วงกลม 5 ขั้นในการ์ด (โผล่บนจอกว้าง) */
function Flow({ status }: { status: string }) {
  let idx = FLOW.findIndex((f) => f.k === status);
  if (idx < 0) idx = 0;
  return (
    <div className="hidden xl:flex items-start pt-1 shrink-0">
      {FLOW.map((f, i) => {
        const cur = i === idx, past = i < idx;
        return (
          <div key={f.k} className="flex items-start">
            <div className="flex flex-col items-center w-14">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${past ? "bg-success" : cur ? "bg-primary ring-2 ring-primary/20" : "bg-gray-200"}`}>
                {past ? <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : cur ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <span className={`text-xxs mt-1 leading-tight whitespace-nowrap ${cur ? "font-bold text-primary-dark" : past ? "text-green-700" : "text-gray-400"}`}>{f.t}</span>
            </div>
            {i < FLOW.length - 1 && <div className={`h-0.5 w-1.5 mt-2.5 ${past ? "bg-green-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function OmServicesPage() {
  const [tab, setTab] = useState<string>("follow");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState("overdue");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"card" | "table">("card");
  const [items, setItems] = useState<Item[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [projects, setProjects] = useState<{ project_id: string; project_name: string; n: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Item | null>(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(() => {
    setItems(null);
    const p = new URLSearchParams({ tab, sort, size: "40" });
    if (group) p.set("group", group);
    if (q.trim()) p.set("q", q.trim());
    apiFetch(`/api/om/follow?${p}`)
      .then((d) => {
        setItems(d.items ?? []); setCounts(d.counts ?? {});
        setTotal(d.total ?? 0); setProjects(d.projects ?? []);
      })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setItems([]); });
  }, [tab, group, sort, q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  if (sel) return <JobDetail item={sel} onBack={() => { setSel(null); load(); }} onSaved={(m) => { say(m); }} />;

  const totalAll = Object.values(counts).reduce((s, n) => s + n, 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="px-5 py-2 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">งานบริการ</h1>
            <div className="text-xxs font-bold uppercase tracking-wide text-gray-500">
              O&amp;M · ติดตาม → ทำนัด → รอ O&amp;M → เข้า O&amp;M → ปิดงาน
            </div>
          </div>
        </div>

        <div className="px-5 pb-2 flex gap-2 flex-wrap">
          <div className="relative flex-1 max-w-[420px] min-w-[180px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นบ้านเลขที่ · ชื่อลูกค้า · เบอร์โทร"
              className="w-full h-9 pl-10 pr-4 rounded-full border border-gray-200 bg-gray-50 text-sm outline-none focus:bg-white focus:border-gray-300" />
          </div>
        </div>

        <div className="px-5 flex items-center gap-1 border-t border-gray-100 overflow-x-auto">
          <span className="shrink-0 py-1.5 mr-3 text-sm font-bold text-gray-600 whitespace-nowrap">
            {totalAll.toLocaleString("th-TH")} รายการ
          </span>
          {TABS.map((t) => (
            <button key={t.k} type="button" style={{ minHeight: 0 }} onClick={() => setTab(t.k)}
              className={`px-2.5 py-2.5 text-xs font-bold tracking-wide whitespace-nowrap border-b-2 -mb-px cursor-pointer ${tab === t.k ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {t.t}<span className={`ml-1 font-normal ${tab === t.k ? "text-active" : "text-gray-400"}`}>{(counts[t.k] ?? 0).toLocaleString("th-TH")}</span>
            </button>
          ))}
        </div>

        <div className="px-5 py-1.5 flex items-center gap-2 flex-wrap border-t border-gray-100">
          <span className="text-sm font-bold text-gray-700 whitespace-nowrap">{total.toLocaleString("th-TH")} หลังในแท็บนี้</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}
            className="h-8 rounded-lg border border-gray-200 px-2 pr-7 text-sm bg-white outline-none max-w-[240px]">
            <option value="">ทุกโครงการ ({projects.length})</option>
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.project_name} · {p.n}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="h-8 rounded-lg border border-active bg-active-light text-active-dark font-bold px-2 pr-7 text-sm outline-none">
            {SORTS.map((s) => <option key={s.k} value={s.k}>เรียง: {s.t}</option>)}
          </select>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">มุมมอง</span>
            <span className="flex rounded-full border border-gray-200 overflow-hidden">
              {(["table", "card"] as const).map((v) => (
                <button key={v} type="button" style={{ minHeight: 0 }} onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-bold cursor-pointer ${view === v ? "bg-active-light text-active-dark" : "bg-white text-gray-500"}`}>
                  {v === "table" ? "แบบตาราง" : "แบบการ์ด"}
                </button>
              ))}
            </span>
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 px-5 py-3">
        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {tab === "follow" && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-900 leading-relaxed">
            การ์ดในแท็บนี้<b>คำนวณสดจากฐาน</b> ยังไม่มีแถวงาน — เกณฑ์คือมีระบบติดตั้งและเลยรอบล้างแล้ว ·
            แถวงานจะเกิดตอนโทรแล้วลูกค้า<b>ตกลงนัด</b>หรือ<b>ขอเลื่อน</b>เท่านั้น
          </div>
        )}
        {items === null ? <Loading /> : items.length === 0 ? (
          <div className="text-center text-gray-400 py-16 text-sm">ไม่มีรายการในแท็บนี้</div>
        ) : view === "card" ? (
          <div className="space-y-2.5 max-w-[1600px]">
            {items.map((r) => <Card key={r.house_id} r={r} onOpen={() => setSel(r)} />)}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-[1600px]">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["บ้าน", "ลูกค้า", "เบอร์", "สิทธิ์", "ล้างล่าสุด", "สถานะ", "โทรล่าสุด"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xxs font-bold uppercase tracking-wide text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.house_id} onClick={() => setSel(r)} className="border-b border-gray-100 last:border-0 hover:bg-teal-50/40 cursor-pointer">
                    <td className="px-4 py-2 text-sm font-bold">{r.house_number}</td>
                    <td className="px-4 py-2 text-sm">{r.customer_name || <span className="text-gray-400">ไม่มีชื่อ</span>}</td>
                    <td className="px-4 py-2 text-sm tabular-nums">{r.phone || <span className="text-amber-600 font-bold">ไม่มีเบอร์</span>}</td>
                    <td className="px-4 py-2 text-sm font-bold text-primary-dark">{Math.max(0, r.balance)}</td>
                    <td className="px-4 py-2 text-sm">{r.last_wash ? `${thD(r.last_wash)} (${monthsAgo(r.last_wash)} ด.)` : <span className="text-amber-600 font-bold">ยังไม่เคยล้าง</span>}</td>
                    <td className="px-4 py-2"><span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold ${TONE[r.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</span></td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.last_outcome ? `${CALL_OUTCOME[r.last_outcome]?.t ?? r.last_outcome} · ${thD(r.last_call_at)}` : "ยังไม่มีใครโทร"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">{toast}</div>}
    </div>
  );
}

function Card({ r, onOpen }: { r: Item; onOpen: () => void }) {
  const m = monthsAgo(r.last_wash);
  return (
    <div onClick={onOpen} className="bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:border-indigo-200">
      <div className="flex gap-4 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <I d={D.house} c="#0ea5e9" />
            <span className="text-base font-bold text-gray-900 truncate">{r.house_number} · {r.customer_name || "ไม่มีชื่อในฐาน"}</span>
            <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold shrink-0 ${TONE[r.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</span>
            {!r.booking_id && r.bucket === "follow" && (
              <span className="text-xxs px-2 py-0.5 rounded-full bg-active-light text-active-dark font-bold shrink-0 max-md:hidden">ยังไม่มีแถวงาน · คำนวณสด</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
            <I d={D.pin} c="#f43f5e" /><span className="truncate">{r.project_name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <I d={D.phone} c={r.phone ? "#10b981" : "#9ca3af"} />
            {r.phone ? <span className="tabular-nums">{r.phone}</span> : <span className="text-gray-400">ไม่มีเบอร์ในฐาน</span>}
            {r.kwp_list && <span className="text-xs text-gray-400 max-md:hidden">· {r.kwp_list} kW</span>}
          </div>
          <div className="text-sm text-gray-700">
            {r.balance > 0 ? <>สิทธิ์เหลือ <b className="text-primary-dark">{r.balance}</b> ครั้ง</> : <span className="text-amber-600 font-bold">สิทธิ์หมด</span>}
            {" · "}
            {r.last_wash ? <>ล้างล่าสุด <b>{thD(r.last_wash)}</b> <span className="text-xxs text-gray-400">({m} เดือน)</span></>
              : <span className="text-amber-600 font-bold">ยังไม่เคยล้างเลย</span>}
            {r.scheduled_at && <> · นัด <b>{thDT(r.scheduled_at)}</b></>}
          </div>
        </div>
        <Flow status={r.job_status ?? "follow"} />
      </div>
      <div className="border-t border-black/5 px-4 py-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-400 bg-gray-50/60">
        {r.last_outcome ? (
          <span className="text-green-700 font-semibold">
            โทรล่าสุด <b>{r.last_by ?? "—"}</b> · <i className="not-italic text-gray-500 font-normal">
              ครั้งที่ {r.calls} {CALL_OUTCOME[r.last_outcome]?.t ?? r.last_outcome} {thDT(r.last_call_at)}</i>
          </span>
        ) : <span>ยังไม่มีใครโทร</span>}
        {r.team_name && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">ทีม {r.team_name}</span>}
        {r.next_call && <span className="ml-auto font-semibold text-gray-500">นัดโทรใหม่ {thD(r.next_call)}</span>}
        {!r.next_call && r.no_answer > 0 && <span className="ml-auto font-bold text-danger">ไม่รับสายแล้ว {r.no_answer} ครั้ง</span>}
      </div>
    </div>
  );
}

// ── ใบงานเต็มหน้า — โครงเดียวกับใบงานฝั่งขาย (rail ขั้นตอน + แผงงานของขั้นนั้น) ──
function JobDetail({ item, onBack, onSaved }: { item: Item; onBack: () => void; onSaved: (m: string) => void }) {
  const cur = item.job_status ?? "follow";
  const [step, setStep] = useState(Math.max(0, FLOW.findIndex((f) => f.k === cur)));
  const [outcome, setOutcome] = useState<string>("agreed");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/api/om/teams").then((d) => setTeams(d.teams ?? [])).catch(() => {});
    if (item.booking_id)
      apiFetch(`/api/om/bookings/${item.booking_id}`).then((d) => setHistory(d.history ?? [])).catch(() => {});
  }, [item.booking_id]);

  const saveCall = async () => {
    if (outcome === "agreed" && !when) { setErr("ตกลงนัดแล้วต้องระบุวันและเวลา"); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch("/api/om/follow", {
        method: "POST",
        body: JSON.stringify({
          house_id: item.house_id, booking_id: item.booking_id, outcome,
          note: note || null, next_date: nextDate || null,
          scheduled_at: outcome === "agreed" ? when : null,
          phone: item.phone,
        }),
      });
      onSaved("บันทึกการโทรแล้ว"); onBack();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const patchJob = async (patch: Record<string, unknown>, msg: string) => {
    if (!item.booking_id) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/bookings/${item.booking_id}`, { method: "PATCH", body: JSON.stringify(patch) });
      onSaved(msg); onBack();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="border-b border-gray-200 px-5 py-2.5 flex items-start gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold leading-tight">{item.house_number} — {item.customer_name || "ไม่มีชื่อในฐาน"}</h1>
            <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold ${TONE[item.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[item.bucket] ?? item.bucket}</span>
            {item.team_name ? <span className="text-xxs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">ทีม {item.team_name}</span>
              : item.booking_id && <span className="text-xxs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">⚠ ยังไม่จ่ายทีม</span>}
          </div>
          <div className="flex gap-3 flex-wrap text-xs text-gray-500 mt-0.5">
            <span>{item.project_name}</span>
            <span className="tabular-nums">☎ {item.phone || "ไม่มีเบอร์"}</span>
            <span>สิทธิ์เหลือ <b className="text-gray-800">{Math.max(0, item.balance)}</b> ครั้ง</span>
            <span>{item.last_wash ? <>ล้างล่าสุด <b className="text-gray-800">{thD(item.last_wash)}</b></> : <b className="text-amber-600">ยังไม่เคยล้าง</b>}</span>
            {item.booking_id && <span>ใบงาน #{item.booking_id}</span>}
          </div>
        </div>
        <button type="button" onClick={onBack} style={{ minHeight: 0 }}
          className="h-8 px-3.5 rounded-full border border-gray-200 text-xs font-bold text-gray-700 bg-white cursor-pointer">‹ กลับรายการ</button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-20 border-r border-gray-200 bg-gray-50 p-2 flex flex-col gap-1.5 shrink-0 overflow-y-auto">
          <div className="text-xxs text-gray-400 text-center font-bold tracking-widest">STEPS</div>
          {FLOW.map((f, i) => {
            const at = Math.max(0, FLOW.findIndex((x) => x.k === cur));
            const cls = i === step ? "bg-active text-white" : i < at ? "text-green-700" : i === at ? "text-gray-700" : "text-gray-400";
            return (
              <button key={f.k} type="button" onClick={() => setStep(i)} style={{ minHeight: 0 }}
                className={`w-full py-1.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer ${cls}`}>
                <span className="text-sm font-bold leading-none">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-xxs leading-tight text-center">{f.t}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}

          {step === 0 && (
            <div className="max-w-[880px] rounded-2xl border-2 border-active bg-active-light p-4">
              <div className="text-xxs font-bold tracking-widest text-active-dark">STEP 01 · O&amp;M</div>
              <div className="text-base font-bold mb-3">ติดตาม — บันทึกการโทร</div>

              <div className="rounded-xl bg-white p-3.5">
                <div className="text-sm font-bold mb-2">ผลการโทรครั้งนี้ <span className="text-danger">*</span></div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.entries(CALL_OUTCOME).map(([k, v]) => (
                    <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => setOutcome(k)}
                      className={`px-3.5 py-1.5 rounded-xl border text-sm font-bold cursor-pointer ${outcome === k ? "border-active bg-active-light text-active-dark" : "border-gray-200 bg-white text-gray-700"}`}>
                      {v.t}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {outcome === "agreed" && (
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-gray-600">วันและเวลานัด <span className="text-danger">*</span></span>
                      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                        className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary" />
                    </label>
                  )}
                  {(outcome === "postponed" || outcome === "no_answer") && (
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-gray-600">นัดโทรใหม่</span>
                      <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
                        className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary" />
                      <span className="text-xxs text-gray-400">ไม่ใส่ = ระบบตั้งให้ตามกติกาในหน้าตั้งค่า</span>
                    </label>
                  )}
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-gray-600">โน้ต</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ลูกค้าไม่อยู่บ้านช่วงเช้า"
                      className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary" />
                  </label>
                </div>

                <div className="mt-3 rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-xs leading-relaxed text-gray-600">
                  {outcome === "agreed" && <>กดบันทึกแล้ว <b>สร้างใบงาน</b> ขั้น <b>ทำนัด</b> พร้อมวันเวลาที่เลือก การ์ดจะย้ายออกจากแท็บติดตาม</>}
                  {outcome === "postponed" && <>สร้างใบงานขั้น <b>ติดตาม</b> พร้อมวันนัดโทรใหม่ ยังอยู่แท็บเดิมแต่จะไม่โผล่ซ้ำจนถึงวันนัด</>}
                  {outcome === "no_answer" && <><b>ไม่สร้างใบงาน</b> บันทึกประวัติอย่างเดียว · ครบจำนวนครั้งที่ตั้งไว้จะย้ายไปแท็บติดต่อไม่ได้</>}
                  {outcome === "declined" && <><b>ไม่สร้างใบงาน</b> ย้ายไปแท็บไม่เอา · <b>สิทธิ์ไม่ถูกตัด</b> ยังใช้ได้ถ้าเปลี่ยนใจ</>}
                  {outcome === "wrong_number" && <>ทำเครื่องหมายเบอร์นี้ว่า <b>ใช้ไม่ได้</b> ถ้าไม่เหลือเบอร์อื่นจะตกไปแท็บติดต่อไม่ได้</>}
                </div>

                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} onClick={saveCall} style={{ minHeight: 0 }}
                    className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">
                    {busy ? "กำลังบันทึก…" : "บันทึกการโทร"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <StepBox n="02" t="ทำนัด — รอลูกค้ายืนยัน">
              {item.scheduled_at ? (
                <>
                  <div className="text-sm mb-3">นัดไว้ <b>{thDT(item.scheduled_at)}</b></div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" disabled={busy || !item.booking_id} style={{ minHeight: 0 }}
                      onClick={() => patchJob({ status: "confirmed" }, "ยืนยันนัดแล้ว")}
                      className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">ลูกค้ายืนยันแล้ว</button>
                    <button type="button" disabled={busy || !item.booking_id} style={{ minHeight: 0 }}
                      onClick={() => patchJob({ status: "follow" }, "ย้ายกลับไปติดตาม")}
                      className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white cursor-pointer">กลับไปติดตาม</button>
                  </div>
                </>
              ) : <div className="text-sm text-gray-500">ยังไม่มีวันนัด — กลับไปขั้นติดตามเพื่อบันทึกการโทร</div>}
            </StepBox>
          )}

          {step === 2 && (
            <StepBox n="03" t="รอ O&M — จ่ายทีมช่าง">
              <div className="text-sm text-gray-600 mb-2">ปกติจ่ายงานด้วยการลากวางในปฏิทิน ตรงนี้เป็นทางลัดสำหรับงานเดี่ยว</div>
              <div className="flex gap-2 flex-wrap">
                {teams.map((t) => (
                  <button key={t.id} type="button" disabled={busy || !item.booking_id} style={{ minHeight: 0 }}
                    onClick={() => patchJob({ team_id: t.id }, `จ่ายงานให้ทีม ${t.name} แล้ว`)}
                    className={`h-9 px-4 rounded-xl border text-sm font-bold cursor-pointer ${item.team_id === t.id ? "border-active bg-active-light text-active-dark" : "border-gray-200 bg-white text-gray-700"}`}>
                    ทีม {t.name} <span className="font-normal text-gray-400">· ค้าง {t.open_jobs}</span>
                  </button>
                ))}
                {!teams.length && <span className="text-sm text-gray-400">ยังไม่มีทีมช่างในระบบ</span>}
              </div>
              {item.team_id && (
                <button type="button" disabled={busy} style={{ minHeight: 0 }}
                  onClick={() => patchJob({ status: "progress" }, "เริ่มงานแล้ว")}
                  className="mt-3 h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">ช่างถึงหน้างานแล้ว</button>
              )}
            </StepBox>
          )}

          {step === 3 && (
            <StepBox n="04" t="เข้า O&M — ช่างทำงานหน้างาน">
              <div className="text-sm text-gray-600">ช่างกรอกเช็คลิสต์และถ่ายรูปในหน้าช่างบนมือถือ แอดมินดูอย่างเดียว</div>
              {item.booking_id && (
                <a href={`/om/field/${item.booking_id}`}
                  className="inline-flex mt-3 h-9 px-5 items-center rounded-xl bg-primary text-white text-sm font-bold no-underline">เปิดใบตรวจรับงาน</a>
              )}
            </StepBox>
          )}

          {step === 4 && (
            <StepBox n="05" t="ปิดงาน">
              <div className="text-sm text-gray-600">
                ปิดงานทำที่หน้าช่าง หลังลูกค้าเซ็นรับหรือยืนยันทาง LINE ·
                ปิดแล้วระบบจะ<b>ตัดสิทธิ์ล้าง 1 ครั้ง</b> เหลือ {Math.max(0, item.balance - 1)} ครั้ง
              </div>
            </StepBox>
          )}

          {history.length > 0 && (
            <div className="mt-5 max-w-[880px]">
              <div className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-2">ประวัติงานนี้</div>
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div key={String(h.id)} className="flex gap-3 text-sm border-b border-gray-100 pb-1.5">
                    <span className="font-semibold w-32 shrink-0">{String(h.action_label ?? h.action)}</span>
                    <span className="flex-1 text-gray-600 truncate">{String(h.reason ?? "")}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{thDT(String(h.created_at))} · {String(h.actor_name ?? "—")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepBox({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[880px] rounded-2xl border-2 border-active bg-active-light p-4">
      <div className="text-xxs font-bold tracking-widest text-active-dark">STEP {n} · O&amp;M</div>
      <div className="text-base font-bold mb-3">{t}</div>
      <div className="rounded-xl bg-white p-3.5">{children}</div>
    </div>
  );
}
