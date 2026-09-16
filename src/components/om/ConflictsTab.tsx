"use client";

// ค่าที่ขัดกัน — ไฟล์ต้นทางให้ค่าหนึ่ง ระบบมีอีกค่าหนึ่ง ระบบไม่เขียนทับเอง
// ★ ผู้ใช้ตัดสินได้ 2 ทาง: ยึดของเดิม (แค่ปิดงาน) หรือ ยึดค่าจากไฟล์ (เขียนทับ + ลงที่มาใหม่)
//   เลือกทีละแถวหรือเลือกทั้งหน้าก็ได้ — ทำทีเดียวได้สูงสุด 1,000 รายการต่อครั้ง
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

interface Row {
  id: number; house_id: number; house_number: string | null; project_id: string | null; project_name: string | null;
  column_name: string; old_value: string | null; new_value: string | null;
  source_ref: string | null; batch_file: string | null;
  created_at: string | null; resolved_at: string | null; resolved_action: string | null;
}
const FIELD: Record<string, string> = {
  install_date: "วันติดตั้ง", transfer_date: "วันโอน", inverter_kw: "อินเวอร์เตอร์ kW",
  po_number: "เลข PO", warranty_doc_no: "เลขใบรับประกัน", inverter_brand: "ยี่ห้ออินเวอร์เตอร์",
};
// ป้ายที่มา — คำที่ผู้ใช้เคาะ 9 ก.ย. 69 (ห้ามใช้ชื่อไฟล์ดิบหรือชื่อคน)
function srcLabel(batchFile: string | null) {
  return batchFile && /^สรุป บ้านเสนาติดตั้ง solar ส่ง/.test(batchFile)
    ? { text: "ข้อมูลจากบัญชี", cls: "bg-emerald-50 text-emerald-700" }
    : { text: "ข้อมูล O&M_Solar", cls: "bg-gray-200 text-gray-600" };
}
// ระยะห่างของสองวัน — ช่วยให้ตัดสินเร็วขึ้นว่าต่างกันมากแค่ไหน
function gap(a: string | null, b: string | null) {
  if (!a || !b) return "";
  const d = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  if (!Number.isFinite(d) || d < 1) return "";
  return d < 31 ? `${Math.round(d)} วัน` : d < 365 ? `${Math.round(d / 30)} เดือน` : `${(d / 365).toFixed(1)} ปี`;
}

export default function ConflictsTab({ onChanged }: { onChanged?: (left: number) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [pick, setPick] = useState<Record<number, "keep" | "apply">>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const size = 50;

  const load = useCallback(() => {
    setRows(null);
    apiFetch(`/api/om/conflicts?page=${page}&size=${size}&done=${done ? 1 : 0}`)
      .then((d) => { setRows(d.rows ?? []); setTotal(d.total ?? 0); setPick({}); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [page, done]);
  useEffect(() => { load(); }, [load]);

  const setAll = (v: "keep" | "apply") =>
    setPick(Object.fromEntries((rows ?? []).map((r) => [r.id, v])));

  const save = async () => {
    const keep = Object.entries(pick).filter(([, v]) => v === "keep").map(([k]) => Number(k));
    const apply = Object.entries(pick).filter(([, v]) => v === "apply").map(([k]) => Number(k));
    if (!keep.length && !apply.length) return;
    setBusy(true); setErr("");
    try {
      let applied = 0, kept = 0, skipped = 0;
      for (const [ids, action] of [[keep, "keep"], [apply, "apply"]] as const) {
        if (!ids.length) continue;
        const d = await apiFetch("/api/om/conflicts", { method: "POST", body: JSON.stringify({ ids, action }) });
        applied += d.applied ?? 0; kept += d.kept ?? 0; skipped += d.skipped ?? 0;
      }
      setToast(`บันทึกแล้ว · ยึดของเดิม ${kept} · ยึดค่าจากไฟล์ ${applied}${skipped ? ` · ข้าม ${skipped}` : ""}`);
      setTimeout(() => setToast(""), 3500);
      const left = Math.max(0, total - kept - applied);
      onChanged?.(left);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const nPicked = Object.keys(pick).length;
  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100">
          <b className="text-base font-bold">
            {done ? "ตัดสินไปแล้ว" : "ค่าที่ขัดกัน"} {total.toLocaleString()} รายการ
          </b>
          <span className="text-xs text-gray-500">
            {done ? "ดูย้อนหลังว่าเลือกอะไรไป" : "ไฟล์ต้นทางให้ค่าหนึ่ง ระบบมีอีกค่าหนึ่ง — ระบบไม่เขียนทับ เก็บไว้ให้ตัดสิน"}
          </span>
          <span className="md:ml-auto flex items-center gap-2 flex-wrap">
            <button type="button" style={{ minHeight: 0 }} onClick={() => { setDone(!done); setPage(1); }}
              className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
              {done ? "← กลับไปที่ค้าง" : "ดูที่ตัดสินแล้ว"}
            </button>
            {!done && <>
              <button type="button" style={{ minHeight: 0 }} onClick={() => setAll("keep")}
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">ทั้งหน้า: ยึดของเดิม</button>
              <button type="button" style={{ minHeight: 0 }} onClick={() => setAll("apply")}
                className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">ทั้งหน้า: ยึดค่าจากไฟล์</button>
              <button type="button" style={{ minHeight: 0 }} disabled={!nPicked || busy} onClick={save}
                className="h-8 px-4 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer disabled:opacity-40">
                {busy ? "กำลังบันทึก…" : `บันทึกที่เลือก${nPicked ? ` (${nPicked})` : ""}`}
              </button>
            </>}
          </span>
        </div>

        {rows === null ? <Loading /> : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            {done ? "ยังไม่มีรายการที่ตัดสิน" : "ไม่มีค่าที่ขัดกันค้างอยู่"}
          </div>
        ) : (
          <>
            {/* desktop — ตาราง */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-xs">
                <thead><tr className="bg-gray-50 text-left">
                  {["โครงการ", "บ้านเลขที่", "ช่องข้อมูล", "ค่าในระบบ", "ค่าจากไฟล์", "ห่างกัน", done ? "ผลตัดสิน" : "เลือกใช้", "จุดอ้างอิง"].map((h) => (
                    <th key={h} className="px-3 py-2 text-xxs font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const lb = srcLabel(r.batch_file);
                    return (
                      <tr key={r.id} className={pick[r.id] ? "bg-active-light/40" : ""}>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                          <span className="font-semibold">{r.project_id}</span>
                          <div className="text-xxs text-gray-400 truncate max-w-[170px]">{r.project_name}</div>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap font-bold">{r.house_number}</td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">{FIELD[r.column_name] ?? r.column_name}</td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                          <b className="text-gray-800">{r.old_value ?? "—"}</b>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                          {r.new_value ?? "—"} <span className={`ml-1 text-xxs font-bold px-2 rounded-full ${lb.cls}`}>{lb.text}</span>
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap text-gray-500">{gap(r.old_value, r.new_value)}</td>
                        <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                          {done ? (
                            <span className={`text-xxs font-bold px-2 rounded-full ${r.resolved_action === "apply" ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                              {r.resolved_action === "apply" ? "ยึดค่าจากไฟล์" : "ยึดของเดิม"}
                            </span>
                          ) : <Picker v={pick[r.id]} on={(v) => setPick((p) => ({ ...p, [r.id]: v }))} />}
                        </td>
                        <td className="px-3 py-2 border-b border-gray-100 text-gray-500">{r.source_ref}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* mobile — การ์ด (ตารางกว้างเกินจอ) */}
            <div className="md:hidden">
              {rows.map((r) => {
                const lb = srcLabel(r.batch_file);
                return (
                  <div key={r.id} className={`px-4 py-3 border-b border-gray-100 ${pick[r.id] ? "bg-active-light/40" : ""}`}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <b className="text-sm">{r.house_number}</b>
                      <span className="text-xs text-gray-500">{r.project_id}</span>
                      <span className="ml-auto text-xs font-bold">{FIELD[r.column_name] ?? r.column_name}</span>
                    </div>
                    <div className="text-xs text-gray-600 leading-snug">
                      ระบบ <b className="text-gray-800">{r.old_value ?? "—"}</b> · ไฟล์ {r.new_value ?? "—"}{" "}
                      <span className={`text-xxs font-bold px-2 rounded-full ${lb.cls}`}>{lb.text}</span>
                      {gap(r.old_value, r.new_value) && <span className="text-gray-400"> · ห่าง {gap(r.old_value, r.new_value)}</span>}
                    </div>
                    <div className="text-xs text-gray-400 leading-snug">{r.source_ref}</div>
                    <div className="mt-1.5">
                      {done ? (
                        <span className={`text-xxs font-bold px-2 rounded-full ${r.resolved_action === "apply" ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-600"}`}>
                          {r.resolved_action === "apply" ? "ยึดค่าจากไฟล์" : "ยึดของเดิม"}
                        </span>
                      ) : <Picker v={pick[r.id]} on={(v) => setPick((p) => ({ ...p, [r.id]: v }))} />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2 flex-wrap text-xs text-gray-500">
              <span className="font-semibold">
                {((page - 1) * size + 1).toLocaleString()}–{Math.min(page * size, total).toLocaleString()} จาก {total.toLocaleString()}
              </span>
              {pages > 1 && (
                <span className="ml-auto flex gap-1 items-center">
                  <button type="button" style={{ minHeight: 0 }} disabled={page <= 1} onClick={() => setPage(page - 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">‹</button>
                  <span>หน้า <b className="text-gray-700">{page}</b> / {pages}</span>
                  <button type="button" style={{ minHeight: 0 }} disabled={page >= pages} onClick={() => setPage(page + 1)}
                    className="w-9 h-9 rounded-lg border border-gray-200 bg-white cursor-pointer disabled:opacity-40">›</button>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {!done && (
        <p className="text-xs text-gray-400 px-1">
          ★ ค่าจากไฟล์บัญชีคือวันที่ออกใบแจ้งหนี้ ซึ่งมักเร็วกว่าวันติดตั้งจริงหลายเดือน — ยึดของเดิมไว้ก่อนถ้าไม่แน่ใจ
        </p>
      )}

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function Picker({ v, on }: { v?: "keep" | "apply"; on: (v: "keep" | "apply") => void }) {
  return (
    <span className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
      {(["keep", "apply"] as const).map((k, i) => (
        <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => on(k)}
          className={`px-3 py-1 text-xxs font-bold cursor-pointer ${i ? "border-l border-gray-200" : ""} ${
            v === k ? "bg-active text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
          {k === "keep" ? "เดิม" : "ไฟล์"}
        </button>
      ))}
    </span>
  );
}
