"use client";

// ทีมช่าง · ศูนย์บริการ · วันที่ทำงานไม่ได้ (แผน 20260831_02)
// ★ ผู้ใช้เคาะ 9 ก.ย. "ไม่อยากเพิ่มเมนู" ⇒ อยู่เป็นแท็บในหน้าตั้งค่า O&M
// ★ วันหยุดกับวันที่ทีมหยุด ใช้ตารางเดียวกัน om_calendar_blocks (ยุบมารวม 10 ก.ย.)
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

type Team = {
  id: number; name: string; color: string | null; center_id: number | null; center_name: string | null;
  is_active: number; capacity_override: number | null; open_jobs: number; done_jobs: number;
  members?: { id: number; user_id: number; full_name: string; role: string }[];
};
type Block = {
  id: number; kind: string; block_date: string; end_date: string | null; title: string;
  team_id: number | null; team_name: string | null; time_slot: string | null; note: string | null;
};

const KIND_LABEL: Record<string, string> = {
  holiday: "วันหยุดบริษัท", team_off: "ทีมหยุด", center_off: "ศูนย์ปิด",
};
const thD = (s: string | null) =>
  !s ? "" : new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });

export default function TeamsTab() {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [newTeam, setNewTeam] = useState("");
  const [bKind, setBKind] = useState("holiday");
  const [bDate, setBDate] = useState("");
  const [bEnd, setBEnd] = useState("");
  const [bTitle, setBTitle] = useState("");
  const [bTeam, setBTeam] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    Promise.all([
      apiFetch("/api/om/teams").then((d) => d.teams ?? []).catch(() => []),
      apiFetch("/api/om/calendar-blocks").then((d) => d.blocks ?? []).catch(() => []),
    ]).then(([t, b]) => { setTeams(t); setBlocks(b); });
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(""); setMsg("");
    try { await fn(); setMsg(ok); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!teams) return <Loading />;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {(err || msg) && (
        <div className={`lg:col-span-2 rounded-xl px-4 py-2 text-sm ${err ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
          {err || msg}
        </div>
      )}

      {/* ทีมช่าง */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <b className="text-base">ทีมช่าง</b>
          <span className="text-xs text-gray-500">{teams.length} ทีม</span>
        </div>
        <div className="divide-y divide-gray-100">
          {teams.map((t) => (
            <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color ?? "#6b7280" }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {t.name}
                  {!t.is_active && <span className="ml-2 text-xxs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">ปิดใช้</span>}
                </div>
                <div className="text-xs text-gray-500">
                  {t.center_name ?? "ไม่ระบุศูนย์"} · งานค้าง {t.open_jobs} · ปิดแล้ว {t.done_jobs}
                  {t.members?.length ? ` · ${t.members.length} คน` : " · ยังไม่มีสมาชิก"}
                </div>
              </div>
              <button type="button" disabled={busy} style={{ minHeight: 0 }}
                onClick={() => run(() => apiFetch("/api/om/teams", { method: "PATCH", body: JSON.stringify({ team_id: t.id, is_active: !t.is_active }) }), t.is_active ? "ปิดใช้ทีมแล้ว" : "เปิดใช้ทีมแล้ว")}
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 bg-white cursor-pointer">
                {t.is_active ? "ปิดใช้" : "เปิดใช้"}
              </button>
            </div>
          ))}
          {!teams.length && <div className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีทีมช่าง</div>}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex gap-2">
          <input value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="ชื่อทีมใหม่ เช่น ทีม D"
            className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white outline-none focus:border-primary" />
          <button type="button" disabled={busy || !newTeam.trim()} style={{ minHeight: 0 }}
            onClick={() => run(async () => {
              await apiFetch("/api/om/teams", { method: "POST", body: JSON.stringify({ name: newTeam.trim() }) });
              setNewTeam("");
            }, "เพิ่มทีมแล้ว")}
            className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">เพิ่มทีม</button>
        </div>
      </div>

      {/* วันที่ทำงานไม่ได้ */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
          <b className="text-base">วันที่ทำงานไม่ได้</b>
          <span className="text-xs text-gray-500">{blocks.length} รายการข้างหน้า</span>
        </div>
        <div className="divide-y divide-gray-100 max-h-[320px] overflow-auto">
          {blocks.map((b) => (
            <div key={b.id} className="px-4 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold truncate">
                  {b.title}
                  <span className="ml-2 text-xxs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">
                    {KIND_LABEL[b.kind] ?? b.kind}{b.team_name ? ` · ${b.team_name}` : ""}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  {thD(b.block_date)}{b.end_date && b.end_date !== b.block_date ? ` – ${thD(b.end_date)}` : ""}
                  {b.time_slot ? ` · ${b.time_slot}` : " · ทั้งวัน"}
                </div>
              </div>
              <button type="button" disabled={busy} style={{ minHeight: 0 }}
                onClick={() => run(() => apiFetch(`/api/om/calendar-blocks?id=${b.id}`, { method: "DELETE" }), "ลบแล้ว")}
                className="w-7 h-7 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 cursor-pointer">×</button>
            </div>
          ))}
          {!blocks.length && <div className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีวันหยุดที่ตั้งไว้</div>}
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 grid gap-2">
          <div className="flex gap-2 flex-wrap">
            <select value={bKind} onChange={(e) => setBKind(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white outline-none">
              {Object.entries(KIND_LABEL).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            {bKind === "team_off" && (
              <select value={bTeam} onChange={(e) => setBTeam(e.target.value)}
                className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white outline-none">
                <option value="">เลือกทีม</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <input type="date" value={bDate} onChange={(e) => setBDate(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white outline-none" />
            <input type="date" value={bEnd} onChange={(e) => setBEnd(e.target.value)} title="ถึงวันที่ (ไม่ใส่ = วันเดียว)"
              className="h-9 rounded-lg border border-gray-200 px-2 text-sm bg-white outline-none" />
          </div>
          <div className="flex gap-2">
            <input value={bTitle} onChange={(e) => setBTitle(e.target.value)} placeholder="ชื่อ เช่น วันสงกรานต์ / อบรมทีม"
              className="flex-1 h-9 rounded-lg border border-gray-200 px-3 text-sm bg-white outline-none focus:border-primary" />
            <button type="button" disabled={busy || !bDate || !bTitle.trim() || (bKind === "team_off" && !bTeam)} style={{ minHeight: 0 }}
              onClick={() => run(async () => {
                await apiFetch("/api/om/calendar-blocks", { method: "POST", body: JSON.stringify({
                  kind: bKind, block_date: bDate, end_date: bEnd || null, title: bTitle.trim(),
                  team_id: bKind === "team_off" ? Number(bTeam) : null }) });
                setBDate(""); setBEnd(""); setBTitle(""); setBTeam("");
              }, "เพิ่มวันหยุดแล้ว")}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">เพิ่ม</button>
          </div>
          <div className="text-xxs text-gray-400">
            วันที่อยู่ในรายการนี้จะไม่ให้จองคิว และไม่ขึ้นในปฏิทินจ่ายงาน
          </div>
        </div>
      </div>
    </div>
  );
}
