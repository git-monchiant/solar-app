"use client";

// ปฏิทิน / จ่ายงาน — ดูนัดตามวัน แล้วลากจ่ายให้ทีมช่าง (mockup 20260831_01 · แผน 20260907_01)
// ★ ผู้ใช้เคาะ 9 ก.ย. 69 "ไม่อยากเพิ่มเมนู" — ทีมช่างเป็นแท็บที่นี่ ไม่แยกเมนู
// ★ mobile = list · desktop = month (กติกา ui-rules)
import { Fragment, useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { statusLabel, statusTone } from "@/lib/om/booking";

interface Row {
  id: number; house_id: number; house_number: string | null; project_name: string | null;
  service_type: string | null; status: string; scheduled_at: string | null;
  team_id: number | null; team_name: string | null; team_color: string | null;
  queue_index: number | null; customer_name: string | null; customer_phone: string | null;
}
type Team = { id: number; name: string; color: string | null; members: number; open_jobs?: number; done_jobs?: number };
// ช่วงเวลาทำงาน + ความจุต่อช่วง — weekday 0=อาทิตย์ … 6=เสาร์
type Slot = { id: number; center_id: number | null; weekday: number; start_time: string; end_time: string; capacity: number; is_open: number };
type Block = { id: number; kind: string; block_date: string; end_date: string | null; title: string | null; team_id: number | null; center_id: number | null; time_slot: string | null };
type Member = { id: number; team_id: number; user_id: number; full_name: string | null; role: string };
type User = { id: number; full_name: string; username: string };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const thTime = (s: string | null) => (s ? new Date(s).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "");
const MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export default function OmCalendarPage() {
  const [tab, setTab] = useState<"cal" | "teams">("cal");
  return (
    <div className="p-3 md:p-5 flex flex-col gap-3">
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center px-4">
          {([["cal", "ปฏิทิน / จ่ายงาน"], ["teams", "ทีมช่าง"]] as const).map(([k, t]) => (
            <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => setTab(k)}
              className={`px-2.5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px whitespace-nowrap cursor-pointer ${
                tab === k ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>{t}</button>
          ))}
        </div>
      </div>
      {tab === "cal" ? <CalendarTab /> : <TeamsTab />}
    </div>
  );
}

function CalendarTab() {
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  // ★ ช่วงเวลา/ความจุมาจาก om_slot_config เสมอ (กติกาโปรเจกต์ ห้าม hardcode)
  const [slots, setSlots] = useState<Slot[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pickDay, setPickDay] = useState<string | null>(null);
  // desktop สลับ เดือน/สัปดาห์/วัน ได้ · mobile เป็น list เสมอ (ui-rules)
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);

  const load = useCallback(() => {
    setRows(null);
    apiFetch(`/api/om/bookings?from=${ymd(first)}&to=${ymd(last)}&size=200`)
      .then((d) => { setRows(d.rows ?? []); setTeams(d.teams ?? []); setSlots(d.slots ?? []); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
    // วันหยุด/วันที่ทีมลา — ช่องที่ตรงกับ block ต้องเทาและวางงานไม่ได้
    apiFetch("/api/om/calendar-blocks?past=1")
      .then((d) => setBlocks(d.blocks ?? []))
      .catch(() => setBlocks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  useEffect(() => { load(); }, [load]);

  const assign = async (id: number, teamId: number | null) => {
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ team_id: teamId }) });
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // ลากแล้วบันทึก — ใช้ร่วมกันทั้งมุมมองสัปดาห์และวัน (ย้ายเวลา · จ่ายทีม · สลับคิว)
  //   ส่งได้หลายใบใน 1 ครั้งเพราะการแทรกคิวต้องไล่เลขใบอื่นในช่องเดียวกันด้วย
  const patch = async (jobs: { id: number; body: Record<string, unknown> }[]) => {
    if (!jobs.length) return;
    setBusy(true); setErr("");
    try {
      for (const j of jobs)
        await apiFetch(`/api/om/bookings/${j.id}`, { method: "PATCH", body: JSON.stringify(j.body) });
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const byDay = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    if (!r.scheduled_at) continue;
    const k = r.scheduled_at.slice(0, 10);
    byDay.set(k, [...(byDay.get(k) ?? []), r]);
  }
  // ช่องว่างหน้าเดือน — สัปดาห์เริ่มวันอาทิตย์ตามปฏิทินไทย
  const pad = first.getDay();
  const cells: (Date | null)[] = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: last.getDate() }, (_, i) => new Date(cur.getFullYear(), cur.getMonth(), i + 1)),
  ];
  const today = ymd(new Date());
  const dayRows = pickDay ? (byDay.get(pickDay) ?? []) : [];

  return (
    <div className="flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-gray-100">
          <button type="button" style={{ minHeight: 0 }} onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() - 1, 1))}
            className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer">‹</button>
          <b className="text-base font-bold">{MONTH[cur.getMonth()]} {cur.getFullYear() + 543}</b>
          <button type="button" style={{ minHeight: 0 }} onClick={() => setCur(new Date(cur.getFullYear(), cur.getMonth() + 1, 1))}
            className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer">›</button>
          <button type="button" style={{ minHeight: 0 }} onClick={() => { const d = new Date(); d.setDate(1); setCur(d); }}
            className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 cursor-pointer">เดือนนี้</button>

          {/* สลับมุมมอง — desktop เท่านั้น (mobile เป็น list เสมอตาม ui-rules) */}
          <span className="hidden md:inline-flex rounded-lg border border-gray-200 overflow-hidden ml-1">
            {([["month", "เดือน"], ["week", "สัปดาห์"], ["day", "วัน"]] as const).map(([k, t]) => (
              <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => setView(k)}
                className={`h-8 px-3 text-xs font-bold cursor-pointer border-l first:border-l-0 border-gray-200 ${
                  view === k ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-50"}`}>{t}</button>
            ))}
          </span>

          <span className="ml-auto text-xs text-gray-500">{(rows ?? []).length} งานในเดือนนี้</span>
        </div>

        {rows === null ? <Loading /> : (
          <>
            {/* desktop = เดือน / สัปดาห์ / วัน */}
            <div className="hidden md:block p-3">
              {view === "day" ? (
                <DayTimeline day={pickDay ?? today} rows={rows ?? []} teams={teams} slots={slots} blocks={blocks}
                  busy={busy} onDay={setPickDay} onPatch={patch} />
              ) : view === "week" ? (
                <WeekGrid anchor={pickDay ?? today} rows={rows ?? []} slots={slots} blocks={blocks}
                  busy={busy} onDay={(k) => { setPickDay(k); setView("day"); }} onPatch={patch} />
              ) : <>
              <div className="grid grid-cols-7 gap-1 text-xxs font-bold text-gray-400 uppercase tracking-wide pb-1">
                {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => <div key={d} className="px-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} className="min-h-[92px] rounded-lg bg-gray-50/60" />;
                  const k = ymd(d);
                  const list = byDay.get(k) ?? [];
                  return (
                    <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => setPickDay(k)}
                      className={`min-h-[92px] rounded-lg border p-1.5 text-left cursor-pointer align-top ${
                        k === today ? "border-primary bg-teal-50/40" : "border-gray-100 hover:bg-gray-50"}`}>
                      <div className={`text-xs font-bold ${k === today ? "text-primary-dark" : "text-gray-600"}`}>{d.getDate()}</div>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {list.slice(0, 3).map((r) => (
                          <span key={r.id} className="text-xxs truncate flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusTone(r.status)}`} />
                            <span className="truncate">{thTime(r.scheduled_at)} {r.house_number}</span>
                          </span>
                        ))}
                        {list.length > 3 && <span className="text-xxs text-gray-400">+{list.length - 3} งาน</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              </>}
            </div>

            {/* mobile = list */}
            <div className="md:hidden">
              {[...byDay.entries()].sort().map(([k, list]) => (
                <div key={k} className="border-b border-gray-100">
                  <div className="px-4 py-1.5 bg-gray-50 text-xs font-bold text-gray-600">
                    {new Date(k).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })} · {list.length} งาน
                  </div>
                  {list.map((r) => <JobLine key={r.id} r={r} teams={teams} busy={busy} onAssign={assign} />)}
                </div>
              ))}
              {!byDay.size && <div className="px-4 py-10 text-center text-sm text-gray-400">เดือนนี้ยังไม่มีนัด</div>}
            </div>
          </>
        )}
      </div>

      {pickDay && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden hidden md:block">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <b className="text-base font-bold">
              {new Date(pickDay).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
            </b>
            <span className="text-xs text-gray-500">{dayRows.length} งาน · เลือกทีมเพื่อจ่ายงาน</span>
            <button type="button" style={{ minHeight: 0 }} onClick={() => setPickDay(null)}
              className="ml-auto text-lg text-gray-400 cursor-pointer">×</button>
          </div>
          {dayRows.length ? dayRows.map((r) => <JobLine key={r.id} r={r} teams={teams} busy={busy} onAssign={assign} />)
            : <div className="px-4 py-8 text-center text-sm text-gray-400">วันนี้ไม่มีนัด</div>}
        </div>
      )}
    </div>
  );
}

/* ───────── ตัวช่วยของมุมมองสัปดาห์/วัน ───────── */

// ช่วงเวลาของวันนั้น — อ่านจาก om_slot_config ตาม weekday (0=อาทิตย์) ห้าม hardcode
const slotsOf = (slots: Slot[], k: string) => {
  const wd = new Date(`${k}T00:00:00`).getDay();
  return slots.filter((s) => s.weekday === wd && s.is_open)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
};
const hm = (s: string | null) => (s ? s.slice(11, 16) : "");
const dayOf = (s: string | null) => (s ? s.slice(0, 10) : "");
const inSlot = (r: Row, s: Slot) => !!r.scheduled_at && hm(r.scheduled_at) >= s.start_time && hm(r.scheduled_at) < s.end_time;
// วันหยุด/ทีมลา/ศูนย์ปิด — ช่องที่โดนต้องเทาและวางงานไม่ได้
const blockOn = (blocks: Block[], k: string, teamId: number | null) =>
  blocks.find((b) => {
    if (k < b.block_date || k > (b.end_date ?? b.block_date)) return false;
    if (b.kind === "team_off") return teamId != null && b.team_id === teamId;
    return true;
  });
const addDays = (k: string, n: number) => {
  const d = new Date(`${k}T00:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
type PatchFn = (jobs: { id: number; body: Record<string, unknown> }[]) => void | Promise<void>;

// บล็อกงานที่ลากได้ — ใช้ทั้งในช่องเวลาและในถาดคิวรอจ่ายงาน
function Blk({ r, queue }: { r: Row; queue?: boolean }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", String(r.id))}
      title={`${r.house_number ?? ""} · ${r.service_type ?? ""} · ${statusLabel(r.status)}`}
      className="rounded-md border-l-[3px] bg-white px-2 py-1 text-xxs leading-snug cursor-grab active:cursor-grabbing shadow-sm"
      style={{ borderLeftColor: r.team_color ?? "#9ca3af" }}>
      <b className="block truncate">
        {queue === false && r.queue_index ? <span className="text-gray-400 mr-1">คิว {r.queue_index}</span> : null}
        {r.house_number} · {r.service_type}
      </b>
      <span className="block truncate text-gray-500">{r.customer_name ?? r.project_name ?? ""}</span>
    </div>
  );
}

/* ───────── มุมมองวัน = timeline จ่ายงานช่าง (คอลัมน์=ทีม แถว=ช่วงเวลา) ───────── */
// ★ แบ่งคอลัมน์ตาม "ทีมช่าง" ไม่ใช่ศูนย์บริการ — ข้อมูลจริงมีศูนย์เดียว แบ่งตามศูนย์จะได้คอลัมน์เดียว
function DayTimeline({ day, rows, teams, slots, blocks, busy, onDay, onPatch }: {
  day: string; rows: Row[]; teams: Team[]; slots: Slot[]; blocks: Block[];
  busy: boolean; onDay: (k: string) => void; onPatch: PatchFn;
}) {
  const daySlots = slotsOf(slots, day);
  const ofDay = rows.filter((r) => dayOf(r.scheduled_at) === day);
  const pool = ofDay.filter((r) => r.team_id == null);
  const holiday = blockOn(blocks, day, null);

  const drop = (e: React.DragEvent, teamId: number | null, s: Slot | null) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    const r = rows.find((x) => x.id === id);
    if (!r || busy) return;
    const body: Record<string, unknown> = {};
    if (r.team_id !== teamId) body.team_id = teamId;
    if (s) {
      const when = `${day}T${s.start_time}`;
      if (`${dayOf(r.scheduled_at)}T${hm(r.scheduled_at)}` !== when) body.scheduled_at = when;
      // ต่อท้ายคิวของช่องนั้น — เลข queue_index คือลำดับที่ช่างจะเข้าทำ
      const cell = ofDay.filter((x) => x.team_id === teamId && inSlot(x, s) && x.id !== id);
      body.queue_index = cell.length + 1;
    } else if (r.team_id !== null) body.queue_index = null;
    if (Object.keys(body).length) onPatch([{ id, body }]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" style={{ minHeight: 0 }} onClick={() => onDay(addDays(day, -1))}
          className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer">‹</button>
        <b className="text-sm font-bold">
          {new Date(`${day}T00:00:00`).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long" })}
        </b>
        <button type="button" style={{ minHeight: 0 }} onClick={() => onDay(addDays(day, 1))}
          className="w-8 h-8 rounded-lg border border-gray-200 cursor-pointer">›</button>
        <span className="text-xs text-gray-500">{ofDay.length} งาน</span>
        {holiday && <span className="text-xs font-bold text-red-600">· {holiday.title ?? "วันหยุด"}</span>}
      </div>

      {!daySlots.length ? (
        <div className="py-10 text-center text-sm text-gray-400">
          วันนี้ไม่ใช่วันทำการตาม <b>ตั้งค่าช่วงเวลา</b> — ไม่มีช่องให้จ่ายงาน
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden min-w-[640px]"
            style={{ gridTemplateColumns: `72px repeat(${teams.length || 1}, minmax(180px, 1fr))` }}>
            <div className="bg-gray-50 px-2 py-1.5 text-xxs font-bold text-gray-400">เวลา</div>
            {teams.map((t) => (
              <div key={t.id} className="bg-gray-50 px-2 py-1.5 text-xxs font-bold text-gray-600 text-center">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: t.color ?? "#9ca3af" }} />
                {t.name}
                <span className="block font-normal text-gray-400">ช่าง {t.members} คน</span>
              </div>
            ))}

            {daySlots.map((s) => {
              const booked = ofDay.filter((r) => inSlot(r, s)).length;
              return (
                <Fragment key={s.id}>
                  <div className="bg-gray-50 px-2 py-1.5 text-right">
                    <div className="text-xxs font-bold text-gray-500 tabular-nums">{s.start_time}</div>
                    <div className={`text-xxs tabular-nums ${booked >= s.capacity ? "text-red-600 font-bold" : "text-gray-400"}`}>
                      {booked}/{s.capacity}
                    </div>
                  </div>
                  {teams.map((t) => {
                    const off = blockOn(blocks, day, t.id);
                    const cell = ofDay.filter((r) => r.team_id === t.id && inSlot(r, s))
                      .sort((a, b) => (a.queue_index ?? 99) - (b.queue_index ?? 99));
                    return (
                      <div key={t.id} onDragOver={(e) => { if (!off) e.preventDefault(); }} onDrop={(e) => !off && drop(e, t.id, s)}
                        className={`min-h-[62px] p-1 flex flex-col gap-1 ${off ? "bg-gray-100 opacity-60" : "bg-white hover:bg-teal-50/40"}`}>
                        {off && !cell.length && <span className="text-xxs text-gray-400">{off.title ?? "หยุด"}</span>}
                        {cell.map((r) => <Blk key={r.id} r={r} queue={false} />)}
                      </div>
                    );
                  })}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* ★ ถาดคิวรอจ่ายงาน = งานของวันนี้ที่ยังไม่มีทีม (ของเดียวกับแท็บ "ยังไม่จ่ายทีม" ในหน้างานบริการ) */}
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(e, null, null)}
        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center gap-2 flex-wrap">
        <b className="text-xs">คิวรอจ่ายงาน {pool.length ? `${pool.length} งาน` : ""}</b>
        {pool.map((r) => <span key={r.id} className="min-w-[200px]"><Blk r={r} /></span>)}
        {!pool.length && <span className="text-xs text-gray-400">ว่าง — งานของวันนี้จ่ายทีมครบแล้ว</span>}
        <span className="ml-auto text-xxs text-gray-400">ลากบล็อกไปวางในคอลัมน์ทีม = จ่ายงาน · ลากกลับมาที่นี่ = ถอนทีม</span>
      </div>
    </div>
  );
}

/* ───────── มุมมองสัปดาห์ = 7 วัน × ช่วงเวลา (ลากข้ามวัน/ข้ามเวลา ไม่เปลี่ยนทีม) ───────── */
function WeekGrid({ anchor, rows, slots, blocks, busy, onDay, onPatch }: {
  anchor: string; rows: Row[]; slots: Slot[]; blocks: Block[];
  busy: boolean; onDay: (k: string) => void; onPatch: PatchFn;
}) {
  const start = addDays(anchor, -new Date(`${anchor}T00:00:00`).getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // แถวของสัปดาห์ = ช่วงเวลาที่เปิดของวันไหนก็ได้ในสัปดาห์นั้น (เสาร์-อาทิตย์ปิดจะไม่มีช่อง)
  const times = [...new Set(days.flatMap((k) => slotsOf(slots, k).map((s) => `${s.start_time}|${s.end_time}`)))]
    .sort();

  const drop = (e: React.DragEvent, k: string, t: string) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/plain"));
    const r = rows.find((x) => x.id === id);
    if (!r || busy) return;
    const when = `${k}T${t}`;
    if (`${dayOf(r.scheduled_at)}T${hm(r.scheduled_at)}` !== when) onPatch([{ id, body: { scheduled_at: when } }]);
  };

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden min-w-[760px]"
        style={{ gridTemplateColumns: "64px repeat(7, minmax(96px, 1fr))" }}>
        <div className="bg-gray-50 px-2 py-1.5 text-xxs font-bold text-gray-400">เวลา</div>
        {days.map((k) => (
          <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => onDay(k)}
            className="bg-gray-50 px-2 py-1.5 text-xxs font-bold text-gray-600 text-center cursor-pointer hover:bg-gray-100">
            {new Date(`${k}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric" })}
          </button>
        ))}

        {times.map((tt) => {
          const [st, et] = tt.split("|");
          return (
            <Fragment key={tt}>
              <div className="bg-gray-50 px-2 py-1.5 text-right text-xxs font-bold text-gray-500 tabular-nums">{st}</div>
              {days.map((k) => {
                const slot = slotsOf(slots, k).find((s) => s.start_time === st && s.end_time === et);
                const off = blockOn(blocks, k, null);
                const cell = rows.filter((r) => dayOf(r.scheduled_at) === k && slot && inSlot(r, slot));
                const full = slot ? cell.length >= slot.capacity : false;
                return (
                  <div key={k} onDragOver={(e) => { if (slot && !off) e.preventDefault(); }}
                    onDrop={(e) => slot && !off && drop(e, k, st)}
                    className={`relative min-h-[58px] p-1 flex flex-col gap-1 ${
                      !slot || off ? "bg-gray-100 opacity-60" : "bg-white hover:bg-teal-50/40"}`}>
                    {full && <span className="absolute right-1 top-0.5 text-xxs font-bold text-red-600">เต็ม</span>}
                    {cell.slice(0, 3).map((r) => <Blk key={r.id} r={r} />)}
                    {cell.length > 3 && <span className="text-xxs text-gray-400">+{cell.length - 3} งาน</span>}
                  </div>
                );
              })}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function JobLine({ r, teams, busy, onAssign }: {
  r: Row; teams: Team[]; busy: boolean; onAssign: (id: number, t: number | null) => void;
}) {
  return (
    <div className="px-4 py-2.5 border-b border-gray-100 flex gap-3 items-center flex-wrap">
      <span className={`text-xxs font-semibold uppercase px-2 py-0.5 rounded-full text-white shrink-0 ${statusTone(r.status)}`}>
        {statusLabel(r.status)}
      </span>
      <span className="text-xs font-bold tabular-nums shrink-0">{thTime(r.scheduled_at)}</span>
      <span className="min-w-0 flex-1">
        <b className="text-sm">{r.house_number}</b>
        <span className="text-xs text-gray-500"> · {r.service_type}</span>
        <span className="block text-xs text-gray-400 truncate">{r.project_name}{r.customer_name ? ` · ${r.customer_name}` : ""}</span>
      </span>
      <select value={r.team_id ?? ""} disabled={busy} onChange={(e) => onAssign(r.id, e.target.value ? Number(e.target.value) : null)}
        className={`h-8 rounded-lg border px-2 text-xxs font-bold outline-none cursor-pointer shrink-0 ${
          r.team_id ? "border-gray-200 text-gray-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
        <option value="">ยังไม่จ่ายทีม</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );
}

function TeamsTab() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [addTo, setAddTo] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () =>
    apiFetch("/api/om/teams")
      .then((d) => { setTeams(d.teams ?? []); setMembers(d.members ?? []); setUsers(d.users ?? []); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  useEffect(() => { load(); }, []);

  const call = async (body: Record<string, unknown>, method: "POST" | "PATCH") => {
    setBusy(true); setErr("");
    try { await apiFetch("/api/om/teams", { method, body: JSON.stringify(body) }); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!teams) return <Loading />;
  return (
    <div className="flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <b className="text-base font-bold">ทีมช่าง {teams.length} ทีม</b>
          <span className="text-xs text-gray-500">งานค้างรวม {teams.reduce((s, t) => s + (t.open_jobs ?? 0), 0)} งาน</span>
          <span className="md:ml-auto flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อทีมใหม่"
              className="h-8 w-40 rounded-lg border border-gray-200 px-3 text-xs font-semibold outline-none focus:border-primary" />
            <button type="button" style={{ minHeight: 0 }} disabled={busy || !name.trim()}
              onClick={() => call({ name: name.trim() }, "POST").then(() => setName(""))}
              className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-40">+ เพิ่มทีม</button>
          </span>
        </div>

        {teams.map((t) => {
          const mem = members.filter((m) => m.team_id === t.id);
          return (
            <div key={t.id} className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color ?? "#9ca3af" }} />
                <b className="text-sm">{t.name}</b>
                <span className="text-xs text-gray-500">ช่าง {mem.length} คน · งานค้าง {t.open_jobs ?? 0} · ปิดแล้ว {t.done_jobs ?? 0}</span>
                <button type="button" style={{ minHeight: 0 }} onClick={() => setAddTo(addTo === t.id ? null : t.id)}
                  className="ml-auto h-8 px-3 rounded-lg border border-gray-200 text-xxs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                  + เพิ่มช่าง
                </button>
              </div>

              {addTo === t.id && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  <select defaultValue="" disabled={busy}
                    onChange={(e) => { if (e.target.value) { call({ team_id: t.id, user_id: Number(e.target.value) }, "POST"); setAddTo(null); } }}
                    className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none cursor-pointer">
                    <option value="">— เลือกคน —</option>
                    {users.filter((u) => !mem.some((m) => m.user_id === u.id)).map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {mem.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 text-xxs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                    {m.full_name ?? `user ${m.user_id}`}
                    <button type="button" style={{ minHeight: 0 }} disabled={busy}
                      onClick={() => call({ member_id: m.id, remove: true }, "PATCH")}
                      className="text-gray-400 hover:text-red-600 cursor-pointer">×</button>
                  </span>
                ))}
                {!mem.length && <span className="text-xs text-gray-400">ยังไม่มีช่างในทีมนี้</span>}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 px-1">
        ★ ระบบสิทธิ์ยังไม่มีบทบาท &quot;ช่าง&quot; แยก — สมาชิกทีมเลือกจากผู้ใช้ระบบทั้งหมดไปก่อน
      </p>
    </div>
  );
}
