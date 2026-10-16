"use client";

// ทะเบียนโครงการ — แก้ชื่อ · ดูว่าดึงทะเบียน REM ได้ไหม · จำนวนบ้านที่ให้บริการ
// ★ ผู้ใช้เคาะ 9 ก.ย. 69: ชื่อโครงการยึดตามทะเบียน REM เป็นหลัก
//   เดิม om_houses.project_name บันทึกไม่ตรงกันภายในรหัสเดียว 58 รหัส 2,261 หลัง
//   (LIFIS มี 5 แบบ รวมพิมพ์ผิด "เสนาวิวล์" และชื่อโครงการอื่นหลุดมา) — แก้ทีเดียวจบแล้ว 1,630 หลัง
//   จึงไม่มีปุ่ม "ดันชื่อลงบ้าน" แยกอีก · แก้ชื่อที่นี่ = อัปเดตทั้งทะเบียนและบ้านพร้อมกัน
//   ที่ยังเหลือ 19 รหัสคือโครงการที่ REM ยิงไม่ได้ ไม่มีต้นทางให้ยึด
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

interface Project {
  project_id: string; name_th: string | null; name_en: string | null; brand: string | null;
  houses: number; om_houses: number; names_in_houses: number;
  rem_units: number; rem_transfers: number; rem_synced_at: string | null;
}
type Stats = { total: number; used: number; no_rem: number; name_mismatch: number };

export default function ProjectsTab() {
  const [items, setItems] = useState<Project[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"" | "mismatch" | "norem" | "used">("");
  const [edit, setEdit] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  const load = () =>
    apiFetch("/api/om/projects")
      .then((d) => { setItems(d.projects ?? []); setStats(d.stats ?? null); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  useEffect(() => { load(); }, []);

  const save = async (pid: string, name: string | null, syncNames = true) => {
    setBusy(true); setErr("");
    try {
      const d = await apiFetch("/api/om/projects", {
        method: "PATCH",
        body: JSON.stringify({ project_id: pid, ...(name ? { name_th: name } : {}), sync_house_names: syncNames }),
      });
      setToast(`บันทึกชื่อแล้ว${d.housesRenamed ? ` · แก้ชื่อในบ้าน ${d.housesRenamed} หลัง` : ""}`);
      setTimeout(() => setToast(""), 3000);
      setEdit(null);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!items) return <Loading />;
  const t = q.trim().toLowerCase();
  const list = items.filter((p) => {
    if (t && !`${p.project_id} ${p.name_th ?? ""} ${p.name_en ?? ""}`.toLowerCase().includes(t)) return false;
    if (only === "mismatch") return p.names_in_houses > 1;
    if (only === "norem") return p.rem_units === 0;
    if (only === "used") return p.om_houses > 0;
    return true;
  });

  const CHIP: { k: typeof only; t: string; n?: number }[] = [
    { k: "", t: "ทั้งหมด", n: stats?.total },
    { k: "used", t: "ให้บริการอยู่", n: stats?.used },
    { k: "mismatch", t: "ชื่อไม่ตรงกัน", n: stats?.name_mismatch },
    { k: "norem", t: "REM ยิงไม่ได้", n: stats?.no_rem },
  ];

  return (
    <div className="flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส · ชื่อโครงการ"
            className="h-9 w-full max-w-[320px] rounded-full border border-gray-200 bg-gray-50 px-4 text-sm font-semibold outline-none focus:bg-white focus:border-gray-300" />
          <span className="flex items-center gap-1.5 flex-wrap">
            {CHIP.map((c) => (
              <button key={c.k} type="button" style={{ minHeight: 0 }} onClick={() => setOnly(c.k)}
                className={`h-8 px-3 rounded-full text-xs font-bold cursor-pointer border ${
                  only === c.k ? "bg-active-light border-active text-active" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {c.t}{c.n !== undefined ? ` (${c.n})` : ""}
              </button>
            ))}
          </span>
          <span className="text-xs text-gray-500 md:ml-auto">{list.length.toLocaleString()} โครงการ</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead><tr className="bg-gray-50 text-left">
              {["รหัส", "ชื่อโครงการ", "บ้าน", "ให้บริการ", "ทะเบียน REM", "ดึงล่าสุด", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-xxs font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.project_id}>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap font-bold">{p.project_id}</td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    {edit === p.project_id ? (
                      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                        className="h-8 w-full max-w-[320px] rounded-lg border border-primary px-2.5 text-xs font-semibold outline-none" />
                    ) : (
                      <>
                        <span className="font-semibold">{p.name_th || <span className="text-gray-400">(ยังไม่มีชื่อ)</span>}</span>
                        {p.names_in_houses > 1 && (
                          <span className="ml-2 text-xxs font-bold px-2 rounded-full bg-amber-50 text-amber-700">
                            บ้านใช้ชื่อ {p.names_in_houses} แบบ
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">{p.houses.toLocaleString()}</td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                    <b className={p.om_houses ? "text-primary-dark" : "text-gray-400"}>{p.om_houses.toLocaleString()}</b>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                    {p.rem_units ? <>{p.rem_units.toLocaleString()} หน่วย · {p.rem_transfers.toLocaleString()} สัญญา</>
                      : <span className="text-red-600 font-bold">ยิงไม่ได้</span>}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap text-gray-500">{p.rem_synced_at ?? "—"}</td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap text-right">
                    {edit === p.project_id ? (
                      <span className="flex gap-1 justify-end">
                        <button type="button" style={{ minHeight: 0 }} disabled={busy || !draft.trim()}
                          onClick={() => save(p.project_id, draft.trim(), true)}
                          className="h-8 px-3 rounded-lg bg-primary text-white text-xxs font-bold cursor-pointer disabled:opacity-40">บันทึก</button>
                        <button type="button" style={{ minHeight: 0 }} onClick={() => setEdit(null)}
                          className="h-8 px-3 rounded-lg border border-gray-200 text-xxs font-bold text-gray-600 cursor-pointer">ยกเลิก</button>
                      </span>
                    ) : (
                      <span className="flex gap-1 justify-end">
                        <button type="button" style={{ minHeight: 0 }}
                          onClick={() => { setEdit(p.project_id); setDraft(p.name_th ?? ""); }}
                          className="h-8 px-3 rounded-lg border border-gray-200 text-xxs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">แก้ชื่อ</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">ไม่พบโครงการที่ตรงเงื่อนไข</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 px-1">
        ★ ชื่อโครงการยึดตามทะเบียน REM · แก้ชื่อที่นี่แล้วบ้านทุกหลังในรหัสนั้นเปลี่ยนตามทันที ·
        &quot;บ้านใช้ชื่อหลายแบบ&quot; ที่ยังเหลือคือโครงการที่ REM ยิงไม่ได้ ไม่มีต้นทางให้ยึด
      </p>

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
