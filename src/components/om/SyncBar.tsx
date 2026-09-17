"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// แถบสถานะ sync บนหน้าบ้าน (mockup 20260902_01)
// ★ ที่ต้องแยก 3 ช่อง เพราะมันคนละกลไกกัน:
//   1) ดึงทะเบียนจาก REM  2) กวาดงานขายที่ติดตั้งเสร็จเข้ามาเอง  3) ของที่ระบบไม่มั่นใจ รอคนตัดสิน
//   ของเดิมเป็นปุ่มเดียวชื่อ "sync ข้อมูลขาย" ซึ่งกำกวมและไม่บอกสถานะอะไรเลย

type Stats = { units: number; transfers: number; owners: number; projects: number; last_synced: string | null };
type Log = { id: number; kind: string; scope: string | null; status: string; started_at: string;
  finished_at: string | null; n_fetched: number; n_inserted: number; n_skipped: number; message: string | null };
type Counts = { tier: string; status: string; n: number };

const th = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

export default function SyncBar({ onChanged }: { onChanged?: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [hProjects, setHProjects] = useState(0);
  const [log, setLog] = useState<Log[]>([]);
  const [counts, setCounts] = useState<Counts[]>([]);
  const [busy, setBusy] = useState<"" | "rem" | "sweep">("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([apiFetch("/api/om/rem/sync"), apiFetch("/api/om/sweep?status=pending")]);
      setStats(a.stats ?? null); setHProjects(a.h_projects ?? 0);
      setCounts(b.counts ?? []); setLog(b.recent ?? []);
    } catch { /* แถบสถานะพังไม่ควรทำให้ทั้งหน้าพัง */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (what: "rem" | "sweep") => {
    setBusy(what); setMsg("");
    try {
      const r = what === "rem"
        ? await apiFetch("/api/om/rem/sync", { method: "POST", body: JSON.stringify({ limit: 5 }) })
        : await apiFetch("/api/om/sweep", { method: "POST", body: JSON.stringify({}) });
      setMsg(what === "rem"
        ? `ดึงแล้ว ${r.projects} โครงการ`
        : `กวาด ${r.scanned} · เข้าระบบ ${(r.results ?? []).filter((x: { action: string }) => x.action !== "queued").length} · เข้าคิว ${(r.results ?? []).filter((x: { action: string }) => x.action === "queued").length}`);
      await load(); onChanged?.();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); setTimeout(() => setMsg(""), 6000); }
  };

  const pending = counts.filter((c) => c.status === "pending").reduce((s, c) => s + c.n, 0);
  const lastSweep = log.find((l) => l.kind === "sales_sweep");
  const done = stats?.projects ?? 0;
  const pct = hProjects ? Math.round((done * 100) / hProjects) : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-3">
        {/* ── ทะเบียน REM ── */}
        <div className="p-3.5 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col gap-1.5">
          <div className="text-xxs font-bold uppercase tracking-wider text-gray-500 leading-none">ทะเบียน REM</div>
          <div className="text-lg font-bold text-gray-900 leading-tight">
            {(stats?.units ?? 0).toLocaleString()} <span className="text-xxs font-normal text-gray-500">unit</span>
          </div>
          <div className="text-xxs text-gray-500">
            {(stats?.transfers ?? 0).toLocaleString()} สัญญาโอน · {(stats?.owners ?? 0).toLocaleString()} เจ้าของ
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xxs text-gray-500">ดึงครบ {done} / {hProjects} โครงการบ้าน ({pct}%)</div>
          <div className="text-xxs text-gray-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-success inline-block shrink-0" />ล่าสุด {th(stats?.last_synced ?? null)}
          </div>
          <div className="flex gap-1.5 mt-0.5">
            <button type="button" style={{ minHeight: 0 }} disabled={busy !== ""} onClick={() => run("rem")}
              className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 cursor-pointer disabled:opacity-50">
              {busy === "rem" ? "กำลังดึง…" : "⟳ ดึงทะเบียนเดี๋ยวนี้"}
            </button>
          </div>
        </div>

        {/* ── กวาดงานขาย ── */}
        <div className="p-3.5 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col gap-1.5">
          <div className="text-xxs font-bold uppercase tracking-wider text-gray-500 leading-none">กวาดงานขาย → O&amp;M</div>
          <div className="text-lg font-bold text-gray-900 leading-tight">
            อัตโนมัติ <span className="text-xxs font-normal text-gray-500">ทุก 1 ชั่วโมง</span>
          </div>
          <div className="text-xxs text-gray-500">งานที่ติดตั้งเสร็จแล้ว จะกลายเป็นบ้าน O&amp;M เอง</div>
          <div className="text-xxs text-gray-500 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${lastSweep?.status === "ok" ? "bg-success" : "bg-gray-400"}`} />
            รอบล่าสุด {th(lastSweep?.started_at ?? null)}
          </div>
          {lastSweep?.message && <div className="text-xxs text-gray-500">{lastSweep.message}</div>}
          <div className="flex gap-1.5 mt-auto pt-0.5">
            <button type="button" style={{ minHeight: 0 }} disabled={busy !== ""} onClick={() => run("sweep")}
              className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 cursor-pointer disabled:opacity-50">
              {busy === "sweep" ? "กำลังกวาด…" : "▶ กวาดเดี๋ยวนี้"}
            </button>
          </div>
        </div>

        {/* ── รอคนตัดสิน ── */}
        <div className="p-3.5 flex flex-col gap-1.5">
          <div className="text-xxs font-bold uppercase tracking-wider text-gray-500 leading-none">รอคนตัดสิน</div>
          <div className={`text-lg font-bold leading-tight ${pending ? "text-warning" : "text-gray-900"}`}>
            {pending.toLocaleString()} <span className="text-xxs font-normal text-gray-500">รายการ</span>
          </div>
          <div className="text-xxs text-gray-500">ระบบไม่มั่นใจว่าเป็นบ้านหลังไหน — ไม่แตะข้อมูลจริง</div>
          <div className="flex gap-1.5 mt-auto pt-0.5">
            <Link href="/om/match-queue" style={{ minHeight: 0 }}
              className={`h-8 px-3 rounded-full text-xs font-bold inline-flex items-center ${
                pending ? "bg-active text-white" : "border border-gray-200 bg-white text-gray-700"}`}>
              {pending ? "→ ไปจับคู่" : "ดูคิว"}
            </Link>
          </div>
        </div>
      </div>
      {msg && <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs font-semibold text-gray-700">{msg}</div>}
    </div>
  );
}
