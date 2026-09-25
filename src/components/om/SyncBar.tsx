"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

// แถบสถานะ sync บนหน้าบ้าน (mockup 20260902_01)
// ★ ที่ต้องแยก 3 อัน เพราะมันคนละกลไกกัน:
//   1) ดึงทะเบียนจาก REM  2) กวาดงานขายที่ติดตั้งเสร็จเข้ามาเอง  3) ของที่ระบบไม่มั่นใจ รอคนตัดสิน
//   ของเดิมเป็นปุ่มเดียวชื่อ "sync ข้อมูลขาย" ซึ่งกำกวมและไม่บอกสถานะอะไรเลย
// ★ 25 ก.ย. 69 (แผน 20260925-03 · ผู้ใช้เลือก A1): ย่อจากกล่อง 3 ใบ (~250px) เหลือบรรทัดเดียวในแถวเครื่องมือ
//   กดแต่ละอันเปิดรายละเอียด + ปุ่มสั่งรัน · จุดส้ม = ข้อมูลเก่ากว่าที่ควร (เดิมต้องอ่านวันที่เองถึงจะรู้)
//   API ทั้งสองตัวอ่านได้เฉพาะ admin / solar_sup / sales_sup — หน้าที่ใช้ต้องกันไม่ให้ role อื่นเห็น

type Stats = { units: number; transfers: number; owners: number; projects: number; last_synced: string | null };
type Log = { id: number; kind: string; scope: string | null; status: string; started_at: string;
  finished_at: string | null; n_fetched: number; n_inserted: number; n_skipped: number; message: string | null };
type Counts = { tier: string; status: string; n: number };

// เกณฑ์ "เก่าเกินไป" — REM ดึงทุก 6 ชม. (เผื่อให้ 1 วัน) · กวาดงานขายทุก 1 ชม. (เผื่อให้ 2 ชม.)
const REM_STALE_MS = 24 * 3600e3;
const SWEEP_STALE_MS = 2 * 3600e3;

const th = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
// บนแถบใช้แบบสั้น: วันนี้ = เวลา · วันอื่น = วันที่
const short = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};
const ageOf = (s: string | null) => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : Date.now() - t;
};
const agoText = (ms: number) =>
  ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} นาทีก่อน`
    : ms < 86400e3 ? `${Math.round(ms / 3600e3)} ชม.ก่อน`
    : `${Math.floor(ms / 86400e3)} วันก่อน`;

export default function SyncBar({ onChanged }: { onChanged?: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [hProjects, setHProjects] = useState(0);
  // ★ เซิร์ฟเวอร์ตั้ง REM_API_KEY แล้วหรือยัง — ไม่ตั้ง = ดึงไม่ได้ทั้งอัตโนมัติและกดเอง
  //   (25 ก.ย. 69: ทะเบียนค้าง 16 วันเพราะเรื่องนี้ แต่หน้าจอบอกแค่วันที่เก่า ไม่บอกสาเหตุ)
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [log, setLog] = useState<Log[]>([]);
  const [counts, setCounts] = useState<Counts[]>([]);
  const [busy, setBusy] = useState<"" | "rem" | "sweep">("");
  const [msg, setMsg] = useState("");
  const [pop, setPop] = useState<"" | "rem" | "sweep">("");
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([apiFetch("/api/om/rem/sync"), apiFetch("/api/om/sweep?status=pending")]);
      setStats(a.stats ?? null); setHProjects(a.h_projects ?? 0);
      setConfigured(typeof a.configured === "boolean" ? a.configured : null);
      setCounts(b.counts ?? []); setLog(b.recent ?? []);
    } catch { /* แถบสถานะพังไม่ควรทำให้ทั้งหน้าพัง */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ปิดกล่องรายละเอียดเมื่อคลิกข้างนอก / กด Esc (แบบเดียวกับ Dropdown)
  useEffect(() => {
    if (!pop) return;
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setPop(""); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(""); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [pop]);

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
  const remAge = ageOf(stats?.last_synced ?? null);
  const noKey = configured === false;
  const remStale = noKey || remAge === null || remAge > REM_STALE_MS;
  const sweepAge = ageOf(lastSweep?.started_at ?? null);
  const sweepStale = sweepAge === null || sweepAge > SWEEP_STALE_MS || lastSweep?.status !== "ok";

  const chip = (on: boolean, stale: boolean) =>
    `h-7 px-2 rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
      on ? "border-gray-200 bg-white" : "border-transparent hover:border-gray-200 hover:bg-white"} ${
      stale ? "text-amber-700 font-bold" : "text-gray-500 font-medium"}`;
  const dot = (stale: boolean) => <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${stale ? "bg-amber-500" : "bg-success"}`} />;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1 flex-wrap text-xxs">
      <button type="button" style={{ minHeight: 0 }} onClick={() => setPop(pop === "rem" ? "" : "rem")} className={chip(pop === "rem", remStale)}>
        {dot(remStale)}<span className="max-md:hidden">ทะเบียน </span>REM {noKey ? "ยังไม่ได้ตั้งค่า"
          : remStale && remAge !== null ? agoText(remAge) : short(stats?.last_synced ?? null)}
      </button>
      <button type="button" style={{ minHeight: 0 }} onClick={() => setPop(pop === "sweep" ? "" : "sweep")} className={chip(pop === "sweep", sweepStale)}>
        {dot(sweepStale)}<span className="max-md:hidden">กวาด</span>งานขาย {sweepStale && sweepAge !== null ? agoText(sweepAge) : short(lastSweep?.started_at ?? null)}
      </button>
      {/* ป้ายรอคนตัดสิน — โผล่เฉพาะตอนมีของค้าง */}
      {pending > 0 && (
        <Link href="/om/match-queue" style={{ minHeight: 0 }}
          className="h-7 px-2.5 rounded-full bg-active text-white font-bold inline-flex items-center whitespace-nowrap">
          รอ<span className="max-md:hidden">คน</span>ตัดสิน {pending.toLocaleString()} →
        </Link>
      )}

      {pop && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-[min(340px,calc(100vw-24px))] rounded-xl border border-gray-200 bg-white shadow-lg p-3 grid gap-1.5 text-xs text-gray-600">
          {pop === "rem" ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-gray-900">ทะเบียน REM</b>
                <span className="text-xxs text-gray-500">
                  {(stats?.units ?? 0).toLocaleString()} unit · {(stats?.transfers ?? 0).toLocaleString()} สัญญาโอน · {(stats?.owners ?? 0).toLocaleString()} เจ้าของ
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xxs text-gray-500">ดึงครบ {done} / {hProjects} โครงการบ้าน ({pct}%) · ล่าสุด {th(stats?.last_synced ?? null)}</div>
              {noKey ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xxs font-semibold text-amber-800">
                  ยังไม่ได้ตั้ง REM_API_KEY บนเซิร์ฟเวอร์นี้ — ดึงทะเบียนไม่ได้ทั้งอัตโนมัติและกดเอง
                  {remAge !== null && <> · ข้อมูลที่มีเป็นของ {agoText(remAge)}</>}
                </div>
              ) : remStale && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xxs font-semibold text-amber-800">
                  {remAge === null ? "ยังไม่เคยดึงทะเบียน" : `ไม่ได้ดึงมา ${agoText(remAge)}`} — ปกติดึงทุก 6 ชม.
                </div>
              )}
              <div>
                <button type="button" style={{ minHeight: 0 }} disabled={busy !== "" || noKey} onClick={() => run("rem")}
                  className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 cursor-pointer disabled:opacity-50">
                  {busy === "rem" ? "กำลังดึง…" : "⟳ ดึงทะเบียนเดี๋ยวนี้"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <b className="text-gray-900">กวาดงานขาย → O&amp;M</b>
                <span className="text-xxs text-gray-500">อัตโนมัติทุก 1 ชั่วโมง</span>
              </div>
              <div className="text-xxs text-gray-500">งานที่ติดตั้งเสร็จแล้ว จะกลายเป็นบ้าน O&amp;M เอง · ไม่มั่นใจ = เข้าคิวรอคนตัดสิน</div>
              <div className="text-xxs text-gray-500">
                รอบล่าสุด {th(lastSweep?.started_at ?? null)}{lastSweep?.message ? ` · ${lastSweep.message}` : ""}
              </div>
              {sweepStale && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xxs font-semibold text-amber-800">
                  {!lastSweep ? "ยังไม่เคยกวาด"
                    : lastSweep.status !== "ok" ? `รอบล่าสุดไม่สำเร็จ (${lastSweep.status})`
                    : `ไม่ได้กวาดมา ${agoText(sweepAge ?? 0)}`} — ปกติกวาดทุก 1 ชม.
                </div>
              )}
              <div>
                <button type="button" style={{ minHeight: 0 }} disabled={busy !== ""} onClick={() => run("sweep")}
                  className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 cursor-pointer disabled:opacity-50">
                  {busy === "sweep" ? "กำลังกวาด…" : "▶ กวาดเดี๋ยวนี้"}
                </button>
              </div>
            </>
          )}
          {msg && <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-xxs font-semibold text-gray-700">{msg}</div>}
        </div>
      )}
    </div>
  );
}
