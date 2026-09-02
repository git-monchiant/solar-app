"use client";

// คิวรอจับคู่ — งานขายที่ติดตั้งเสร็จแล้วแต่ระบบไม่มั่นใจว่าเป็นบ้านหลังไหน (mockup 20260902_01)
// ★ วัดกับข้อมูลจริง 2 ก.ย.: ราว 9% ของงานที่ขายจบจะตกมาที่นี่
// ★ ทั้ง 3 ปุ่มจบด้วยการมีบ้าน+ลูกค้า+ระบบติดตั้งเสมอ — ลูกค้าที่ติดตั้งไปแล้วต้องได้รับบริการ
//   "ไม่ใช่บ้านในโครงการ" ไม่ได้แปลว่าทิ้ง แต่ไปอยู่กลุ่ม "ลูกค้าทั่วไป"

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

type Cand = { contract_id: string | null; project_id: string; project_name: string | null;
  unit_id: string | null; house_number: string | null; owner_names: string; via: string; transferred: boolean };
type QRow = {
  id: number; lead_id: number; tier: "confident" | "likely" | "unknown"; status: string; reason: string;
  cand_contract: string | null; cand_project: string | null; cand_house: string | null; candidates: string | null;
  house_id: number | null; created_at: string; full_name: string; phone: string | null;
  lead_house: string | null; sales_project_id: number | null; sales_project_name: string | null;
  cand_project_name: string | null; install_completed_at: string | null;
};
type House = { id: number; house_number: string | null; project_name: string | null; customer_name: string | null };

const TIER: Record<string, { t: string; c: string }> = {
  confident: { t: "มั่นใจ", c: "bg-green-100 text-green-800" },
  likely: { t: "น่าจะใช่", c: "bg-amber-100 text-amber-800" },
  unknown: { t: "ไม่รู้", c: "bg-red-100 text-red-800" },
};
const STATUS: Record<string, string> = { pending: "รอตัดสิน", accepted: "รับแล้ว", rejected: "ตีกลับ", auto: "อัตโนมัติ" };
const VIA: Record<string, string> = { project_house: "โครงการ+บ้านเลขที่", citizen_id: "เลขบัตร", phone: "เบอร์" };
const thDate = (s: string | null) => s ? new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—";

export default function MatchQueuePage() {
  const [rows, setRows] = useState<QRow[] | null>(null);
  const [counts, setCounts] = useState<{ tier: string; status: string; n: number }[]>([]);
  const [tab, setTab] = useState("pending");
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [pick, setPick] = useState<number | null>(null);   // lead_id ที่กำลังค้นบ้านเอง
  const [hq, setHq] = useState("");
  const [hits, setHits] = useState<House[]>([]);
  const [chosen, setChosen] = useState<Record<number, string>>({});  // lead_id → contract_id ที่เลือก

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const load = useCallback(() => {
    apiFetch(`/api/om/sweep?status=${tab}`)
      .then((d) => { setRows(d.queue ?? []); setCounts(d.counts ?? []); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!pick || hq.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      apiFetch(`/api/om/houses?q=${encodeURIComponent(hq)}&size=8`)
        .then((d) => setHits(d.houses ?? [])).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [hq, pick]);

  const decide = async (leadId: number, action: "accept" | "link" | "reject", extra: Record<string, unknown> = {}) => {
    setBusy(leadId); setErr("");
    try {
      const r = await apiFetch("/api/om/sweep/queue", {
        method: "POST", body: JSON.stringify({ lead_id: leadId, action, ...extra }),
      });
      say(r.already ? "รายการนี้เข้าระบบไปแล้ว" : `บันทึกแล้ว · บ้าน #${r.house_id}`);
      setPick(null); setHq(""); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(0); }
  };

  const nOf = (st: string) => counts.filter((c) => c.status === st).reduce((s, c) => s + c.n, 0);
  const TABS = [
    { k: "pending", t: "รอตัดสิน" }, { k: "accepted", t: "รับแล้ว" },
    { k: "rejected", t: "ตีกลับ" }, { k: "auto", t: "อัตโนมัติ" }, { k: "all", t: "ทั้งหมด" },
  ];

  return (
    <div className="p-3 md:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">คิวรอจับคู่</h1>
          <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">
            O&amp;M · งานขายที่ติดตั้งเสร็จแต่ยังไม่รู้ว่าเป็นบ้านหลังไหน
          </div>
        </div>
        <span className="flex-1" />
        <Link href="/om/houses" style={{ minHeight: 0 }}
          className="h-9 px-4 rounded-full border border-gray-200 bg-white text-sm font-bold text-gray-700 inline-flex items-center">
          ← กลับหน้าบ้าน
        </Link>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        ระบบจะ<b>ไม่เดาให้</b> และจะ<b>ไม่ทิ้งเงียบ ๆ</b> — ของที่ไม่มั่นใจมากองตรงนี้
        · <b>กดรับ</b> = สร้างบ้าน+ลูกค้า+สิทธิ์ให้ทันที เหมือนที่ระบบทำอัตโนมัติ
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center px-4 border-b border-gray-200 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.k} type="button" style={{ minHeight: 0 }} onClick={() => setTab(t.k)}
              className={`px-2.5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px whitespace-nowrap shrink-0 cursor-pointer ${
                tab === t.k ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {t.t}{t.k !== "all" && <span className={`ml-1 font-medium normal-case ${tab === t.k ? "text-active" : "text-gray-400"}`}>({nOf(t.k)})</span>}
            </button>
          ))}
        </div>

        {rows === null ? <Loading /> : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">ไม่มีรายการในหมวดนี้</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rows.map((r) => {
              const cands: Cand[] = (() => { try { return JSON.parse(r.candidates ?? "[]"); } catch { return []; } })();
              const uniq = [...new Map(cands.filter((c) => c.contract_id).map((c) => [c.contract_id, c])).values()];
              const selCt = chosen[r.lead_id] ?? r.cand_contract ?? "";
              const done = r.status !== "pending";
              return (
                <div key={r.id} className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] gap-4">
                  {/* งานขาย */}
                  <div>
                    <div className="font-bold text-gray-900">{r.full_name}</div>
                    <div className="text-xxs text-gray-500 font-mono">lead #{r.lead_id} · {r.phone ?? "ไม่มีเบอร์"}</div>
                    <div className="text-xxs text-gray-500">ติดตั้งเสร็จ {thDate(r.install_completed_at)}</div>
                    <div className="text-xxs text-gray-500">
                      โครงการฝั่งขาย: {r.sales_project_name ?? <i className="text-gray-400">ไม่ได้ระบุ</i>}
                    </div>
                    <div className="text-xxs text-gray-500">บ้านเลขที่ที่กรอก: <b className="text-gray-700">{r.lead_house || "—"}</b></div>
                    <a href={`/leads/${r.lead_id}`} target="_blank" rel="noreferrer"
                      className="text-xxs font-bold text-active hover:underline">เปิดงานขาย ↗</a>
                  </div>

                  {/* ทำไมไม่มั่นใจ */}
                  <div>
                    <span className={`inline-flex items-center h-6 px-2.5 rounded-full text-xxs font-bold ${TIER[r.tier]?.c ?? "bg-gray-100 text-gray-600"}`}>
                      {TIER[r.tier]?.t ?? r.tier}
                    </span>
                    {done && <span className="ml-1.5 inline-flex items-center h-6 px-2.5 rounded-full text-xxs font-bold bg-gray-100 text-gray-600">
                      {STATUS[r.status] ?? r.status}</span>}
                    <div className="text-xs text-gray-700 mt-1.5">{r.reason}</div>
                  </div>

                  {/* ผู้สมัคร */}
                  <div>
                    {uniq.length === 0 ? (
                      <div className="text-xxs text-gray-500">ไม่มีผู้สมัครเลย — ต้องหาบ้านเอง</div>
                    ) : uniq.map((c) => (
                      <button key={c.contract_id} type="button" style={{ minHeight: 0 }} disabled={done}
                        onClick={() => setChosen((s) => ({ ...s, [r.lead_id]: c.contract_id! }))}
                        className={`w-full text-left rounded-lg border px-2.5 py-2 mb-1.5 cursor-pointer ${
                          selCt === c.contract_id ? "border-active bg-active-light" : "border-gray-200 bg-gray-50"}`}>
                        <div className="text-sm font-bold text-gray-900">
                          {c.project_name ?? c.project_id} <span className="font-normal text-gray-600">บ้าน {c.house_number}</span>
                        </div>
                        <div className="text-xxs font-mono text-gray-500">{c.contract_id}</div>
                        {c.owner_names && <div className="text-xxs text-gray-500">เจ้าของ: {c.owner_names}</div>}
                        <div className="text-xxs text-gray-400">เจอจาก {VIA[c.via] ?? c.via}</div>
                      </button>
                    ))}
                    {!done && (
                      <button type="button" style={{ minHeight: 0 }}
                        onClick={() => { setPick(pick === r.lead_id ? null : r.lead_id); setHq(""); }}
                        className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 cursor-pointer">
                        🔍 ค้นบ้านเอง
                      </button>
                    )}
                    {pick === r.lead_id && (
                      <div className="mt-2">
                        <input value={hq} onChange={(e) => setHq(e.target.value)} autoFocus
                          placeholder="บ้านเลขที่ · ชื่อลูกค้า · เบอร์"
                          className="h-8 w-full rounded-full border border-gray-200 bg-gray-50 px-3 text-xs font-semibold outline-none focus:bg-white" />
                        {hits.map((h) => (
                          <button key={h.id} type="button" style={{ minHeight: 0 }} disabled={busy === r.lead_id}
                            onClick={() => decide(r.lead_id, "link", { house_id: h.id })}
                            className="w-full text-left rounded-lg border border-gray-200 px-2.5 py-1.5 mt-1 hover:border-active cursor-pointer">
                            <div className="text-xs font-bold text-gray-900">{h.house_number || "(ไม่มีบ้านเลขที่)"} · {h.project_name ?? "นอกโครงการ"}</div>
                            <div className="text-xxs text-gray-500">{h.customer_name ?? "ยังไม่ผูกลูกค้า"} · #{h.id}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ตัดสิน */}
                  <div className="lg:w-[210px]">
                    {done ? (
                      r.house_id ? (
                        <Link href={`/om/houses?q=${r.house_id}`} style={{ minHeight: 0 }}
                          className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 inline-flex items-center">
                          เปิดบ้าน #{r.house_id}
                        </Link>
                      ) : <span className="text-xxs text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <button type="button" style={{ minHeight: 0 }} disabled={busy === r.lead_id || !selCt}
                          onClick={() => decide(r.lead_id, "accept", { contract_id: selCt })}
                          className="h-8 px-3 rounded-full bg-active text-white text-xs font-bold cursor-pointer disabled:opacity-40">
                          ✓ รับ · สร้างบ้าน
                        </button>
                        <button type="button" style={{ minHeight: 0 }} disabled={busy === r.lead_id}
                          onClick={() => { setPick(r.lead_id); setHq(""); }}
                          className="h-8 px-3 rounded-full border border-gray-200 bg-white text-xs font-bold text-gray-700 cursor-pointer">
                          ผูกกับบ้านที่มีอยู่
                        </button>
                        <button type="button" style={{ minHeight: 0 }} disabled={busy === r.lead_id}
                          onClick={() => decide(r.lead_id, "reject")}
                          className="h-8 px-3 rounded-full border border-red-200 bg-white text-xs font-bold text-danger cursor-pointer">
                          ✕ ไม่ใช่บ้านในโครงการ
                        </button>
                        <div className="text-xxs text-gray-500">“ไม่ใช่” = ไปกลุ่ม <b>ลูกค้าทั่วไป</b></div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-4 flex-wrap px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-xxs text-gray-500">
          <span><b className="text-green-800">มั่นใจ</b> โครงการ+บ้านเลขที่ ตรงกับเลขบัตร/เบอร์ → ทำอัตโนมัติ ไม่เข้าคิว</span>
          <span><b className="text-amber-800">น่าจะใช่</b> ยืนยันได้ทางเดียว → เข้าคิวให้กดรับ</span>
          <span><b className="text-red-800">ไม่รู้</b> หาไม่เจอ หรือสองทางชี้คนละที่ → ต้องหาเอง</span>
        </div>
      </div>

      <SyncHistory />

      {err && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-danger text-white text-sm font-bold px-4 py-2 rounded-full">{err}</div>}
      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm font-bold px-4 py-2 rounded-full">{toast}</div>}
    </div>
  );
}

const KIND: Record<string, string> = {
  sales_sweep: "กวาดงานขาย", rem_sync: "ดึงทะเบียน REM", rem_bulk_load: "โหลดทะเบียนครั้งแรก",
};

function SyncHistory() {
  const [log, setLog] = useState<{ id: number; kind: string; scope: string | null; status: string;
    started_at: string; n_fetched: number; n_inserted: number; n_skipped: number; message: string | null }[]>([]);
  useEffect(() => { apiFetch("/api/om/sweep?status=pending").then((d) => setLog(d.recent ?? [])).catch(() => {}); }, []);
  if (!log.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 text-md font-bold text-gray-900">ประวัติ sync</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-gray-50">
            {["เมื่อ", "งาน", "ขอบเขต", "ผล", "ข้อความ"].map((h) => (
              <th key={h} className="text-left px-3 py-2 text-xxs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2 text-xxs font-mono text-gray-600 whitespace-nowrap">
                  {new Date(l.started_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2 text-sm">{KIND[l.kind] ?? l.kind}</td>
                <td className="px-3 py-2 text-xxs font-mono text-gray-500 max-w-[220px] truncate">{l.scope}</td>
                <td className="px-3 py-2 text-xxs whitespace-nowrap">
                  <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${l.status === "ok" ? "bg-success" : l.status === "error" ? "bg-danger" : "bg-warning"}`} />
                  {l.status}
                </td>
                <td className="px-3 py-2 text-xxs text-gray-500">{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
