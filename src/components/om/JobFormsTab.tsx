"use client";

// ใบตรวจรับงาน — แอดมินจัดการหัวข้อที่ช่างต้องกรอกหน้างาน (mockup 20260916_02)
// ★★ กติกาที่ทั้งหน้าจอและ API บังคับตรงกัน: ใบที่มีใบงานอ้างแล้วห้ามแก้เนื้อใบ
//    คำตอบในใบงานเก็บเป็น JSON ที่อ้าง code ของข้อ — แก้ความหมายทับ = ใบเก่าอ่านผิดเงียบ ๆ
//    ทางเดียวคือ "ออกเวอร์ชันใหม่" แล้วแก้ที่เวอร์ชันใหม่
// ★ ใบกลาง (service_type_id = null) ใช้กับงาน O&M ทุกชนิดที่ยังไม่มีใบเฉพาะของตัวเอง
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

type Form = {
  id: number; service_type_id: number | null; version: number; label_th: string;
  is_active: number; effective_from: string | null;
  service_code: string | null; service_label: string | null;
  items: number; used: number;
};
type Item = {
  id: number; form_id: number; code: string; section: string; label_th: string;
  kind: string; unit: string | null; required: number; sort_order: number; is_active: number;
};
type ServiceType = { id: number; code: string; label_th: string };

const SECTION_TH: Record<string, string> = { quality: "คุณภาพงาน", measure: "การทดสอบระบบ", photo: "รูปถ่าย" };
const KIND_TH: Record<string, string> = { bool: "ผ่าน / ไม่ผ่าน", num: "ตัวเลข", text: "ข้อความ", photo: "รูป" };
// text/photo ยังไม่เปิดใช้ — หน้าช่างยังไม่มีช่องเก็บคำตอบสองชนิดนี้ ให้ช่องกรอกแล้วไม่บันทึก = ข้อมูลหายเงียบ
const KIND_READY = ["bool", "num"];

const BTN = "h-8 px-3 rounded-lg border border-gray-200 text-xxs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-40";
const BTN_MAIN = "h-8 px-3 rounded-lg bg-primary text-white text-xxs font-bold cursor-pointer disabled:opacity-40";

export default function JobFormsTab() {
  const [forms, setForms] = useState<Form[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [types, setTypes] = useState<ServiceType[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ code: "", section: "quality", kind: "bool", label_th: "", unit: "", required: true });

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const load = () =>
    apiFetch("/api/om/job-forms")
      .then((d) => {
        setForms(d.forms ?? []); setItems(d.items ?? []); setTypes(d.serviceTypes ?? []);
        setSel((s) => s ?? (d.forms ?? [])[0]?.id ?? null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  useEffect(() => { load(); }, []);

  const call = async (url: string, init: RequestInit, ok: string) => {
    setBusy(true); setErr("");
    try { await apiFetch(url, init); say(ok); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (!forms) return <Loading />;
  const form = forms.find((f) => f.id === sel) ?? null;
  const mine = items.filter((i) => i.form_id === sel).sort((a, b) => a.sort_order - b.sort_order);
  const locked = !!form && form.used > 0;

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...mine];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    call("/api/om/job-forms/items", {
      method: "PATCH", body: JSON.stringify({ form_id: sel, order: next.map((i) => i.id) }),
    }, "เรียงลำดับใหม่แล้ว");
  };

  return (
    <div className="flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 p-3 rounded-xl text-sm font-semibold text-red-700">{err}</div>}

      {/* ── รายการใบ ── */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100">
          <b className="text-base font-bold">ใบตรวจรับงาน {forms.length} ใบ</b>
          <span className="text-xs text-gray-500">ช่างกรอกใบนี้ตอนปิดงานหน้างาน</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-xs">
            <thead><tr className="bg-gray-50 text-left">
              {["ชื่อใบ", "ใช้กับงาน", "เวอร์ชัน", "ข้อ", "ใบงานที่อ้าง", "สถานะ", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-xxs font-bold text-gray-500 border-b border-gray-200 whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f.id} className={f.id === sel ? "bg-teal-50/40" : ""}>
                  <td className="px-3 py-2 border-b border-gray-100 font-semibold">{f.label_th}</td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                    {f.service_type_id === null
                      ? <span className="text-xxs font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">ใบกลาง · ทุกชนิดงาน</span>
                      : f.service_label}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap tabular-nums">v{f.version}</td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap tabular-nums">{f.items}</td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                    {f.used > 0
                      ? <span className="font-bold text-amber-700">{f.used} ใบ · ล็อกแล้ว</span>
                      : <span className="text-gray-400">ยังไม่มี · แก้ได้</span>}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap">
                    <span className={`text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${f.is_active ? "bg-emerald-600" : "bg-gray-400"}`}>
                      {f.is_active ? "ใช้อยู่" : "ปิดอยู่"}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 whitespace-nowrap text-right">
                    <span className="flex gap-1 justify-end">
                      <button type="button" style={{ minHeight: 0 }} className={BTN} onClick={() => setSel(f.id)}>เปิดดู</button>
                      <button type="button" style={{ minHeight: 0 }} className={BTN} disabled={busy}
                        onClick={() => call("/api/om/job-forms", { method: "POST", body: JSON.stringify({ from_form_id: f.id, activate: true }) }, "ออกเวอร์ชันใหม่แล้ว")}>
                        ออกเวอร์ชันใหม่
                      </button>
                      {!f.is_active && (
                        <button type="button" style={{ minHeight: 0 }} className={BTN} disabled={busy}
                          onClick={() => call("/api/om/job-forms", { method: "PATCH", body: JSON.stringify({ form_id: f.id, is_active: true }) }, "เริ่มใช้ใบนี้แล้ว")}>
                          เริ่มใช้
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ลำดับการเลือกใบ — อธิบายกติกาให้คนอ่านเข้าใจ ── */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-2.5 text-xs text-sky-900">
        <b>ระบบเลือกใบให้ช่างตามลำดับนี้</b> — ① ใบที่ใบงานนั้นเคยผูกไว้แล้ว → ② ใบที่ใช้อยู่ของชนิดงานนั้น → ③ ใบกลาง
        {forms.every((f) => f.service_type_id === null) && " · ตอนนี้ยังไม่มีใบเฉพาะชนิดงาน ทุกงานจึงตกมาที่ใบกลาง"}
      </div>

      {/* ── ข้อในใบที่เลือก ── */}
      {form && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100">
            <b className="text-base font-bold">{form.label_th} <span className="text-gray-400 font-normal">v{form.version}</span></b>
            <span className="text-xs text-gray-500">{mine.filter((i) => i.is_active).length} ข้อที่เปิดใช้</span>
            {!locked && (
              <button type="button" style={{ minHeight: 0 }} className={`${BTN_MAIN} ml-auto`} onClick={() => setAdding((v) => !v)}>
                {adding ? "ปิดช่องเพิ่มข้อ" : "+ เพิ่มข้อ"}
              </button>
            )}
          </div>

          {locked && (
            <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              <b>ใบนี้ล็อกแล้ว</b> — มีใบงานอ้างอยู่ {form.used} ใบ แก้หัวข้อไม่ได้
              เพราะคำตอบของใบงานเก่าผูกกับรหัสข้อ ถ้าแก้ความหมายทับ ใบเก่าจะอ่านผิดโดยไม่มีใครรู้ ·
              ต้องการแก้ให้กด <b>ออกเวอร์ชันใหม่</b> แล้วแก้ที่เวอร์ชันใหม่
            </div>
          )}

          {adding && !locked && (
            <div className="mx-4 mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 flex flex-wrap gap-2 items-end">
              <label className="flex flex-col gap-1">
                <span className="text-xxs font-bold text-gray-500">รหัสข้อ (แก้ทีหลังไม่ได้)</span>
                <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="เช่น panel"
                  className="h-9 w-40 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xxs font-bold text-gray-500">หมวด</span>
                <select value={draft.section} onChange={(e) => setDraft({ ...draft, section: e.target.value })}
                  className="h-9 rounded-lg border border-gray-200 px-2 text-sm outline-none cursor-pointer">
                  {Object.entries(SECTION_TH).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xxs font-bold text-gray-500">ชนิดคำตอบ</span>
                <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
                  className="h-9 rounded-lg border border-gray-200 px-2 text-sm outline-none cursor-pointer">
                  {Object.entries(KIND_TH).map(([k, t]) => (
                    <option key={k} value={k} disabled={!KIND_READY.includes(k)}>
                      {t}{KIND_READY.includes(k) ? "" : " — ยังไม่เปิดใช้"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
                <span className="text-xxs font-bold text-gray-500">ชื่อข้อ</span>
                <input value={draft.label_th} onChange={(e) => setDraft({ ...draft, label_th: e.target.value })}
                  placeholder="เช่น แผงโซลาร์เซลล์"
                  className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xxs font-bold text-gray-500">หน่วย</span>
                <input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="V · kW"
                  className="h-9 w-20 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-primary" />
              </label>
              <button type="button" style={{ minHeight: 0 }} className={BTN_MAIN} disabled={busy || !draft.code.trim() || !draft.label_th.trim()}
                onClick={() => call("/api/om/job-forms/items", { method: "POST", body: JSON.stringify({ form_id: sel, ...draft }) }, "เพิ่มข้อแล้ว")}>
                เพิ่ม
              </button>
            </div>
          )}

          <div className="p-3">
            {["quality", "measure", "photo"].map((sec) => {
              const list = mine.filter((i) => i.section === sec);
              if (!list.length) return null;
              return (
                <div key={sec} className="mb-3 last:mb-0">
                  <div className="px-1 py-1 text-xxs font-bold uppercase tracking-wide text-gray-500">{SECTION_TH[sec] ?? sec}</div>
                  {list.map((it) => {
                    const idx = mine.findIndex((m) => m.id === it.id);
                    return (
                      <div key={it.id} className={`flex items-center gap-2 py-2 border-b border-gray-100 last:border-0 ${it.is_active ? "" : "opacity-50"}`}>
                        <code className="text-xxs text-gray-400 w-24 shrink-0">{it.code}</code>
                        <span className={`flex-1 text-sm ${it.is_active ? "" : "line-through"}`}>
                          {it.label_th}
                          {it.unit && <span className="ml-1.5 text-xs text-gray-400">({it.unit})</span>}
                          {!it.required && <span className="ml-1.5 text-xxs text-gray-400">ไม่บังคับ</span>}
                        </span>
                        <span className="text-xxs text-gray-400 w-24 shrink-0">{KIND_TH[it.kind] ?? it.kind}</span>
                        {!locked && (
                          <span className="flex gap-1 shrink-0">
                            <button type="button" style={{ minHeight: 0 }} className={BTN} disabled={busy || idx === 0}
                              onClick={() => move(idx, -1)}>▲</button>
                            <button type="button" style={{ minHeight: 0 }} className={BTN} disabled={busy || idx === mine.length - 1}
                              onClick={() => move(idx, 1)}>▼</button>
                            <button type="button" style={{ minHeight: 0 }} className={BTN} disabled={busy}
                              onClick={() => call("/api/om/job-forms/items", {
                                method: "PATCH",
                                body: JSON.stringify({ form_id: sel, item_id: it.id, required: !it.required }),
                              }, it.required ? "เปลี่ยนเป็นไม่บังคับแล้ว" : "เปลี่ยนเป็นบังคับแล้ว")}>
                              {it.required ? "ทำเป็นไม่บังคับ" : "ทำเป็นบังคับ"}
                            </button>
                            <button type="button" style={{ minHeight: 0 }} className={BTN} disabled={busy}
                              onClick={() => call("/api/om/job-forms/items", {
                                method: "PATCH",
                                body: JSON.stringify({ form_id: sel, item_id: it.id, is_active: !it.is_active }),
                              }, it.is_active ? "ปิดข้อแล้ว" : "เปิดข้อคืนแล้ว")}>
                              {it.is_active ? "ปิดข้อ" : "คืนข้อ"}
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {!mine.length && <div className="px-4 py-8 text-center text-sm text-gray-400">ใบนี้ยังไม่มีข้อตรวจ</div>}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 px-1">
        ★ ปิดข้อแทนการลบ เพื่อให้ใบงานเก่าที่กรอกข้อนั้นไว้ยังอ่านความหมายออก ·
        รหัสข้อคือคีย์ที่ใช้เก็บคำตอบ <b>ตัวพิมพ์เล็ก-ใหญ่ถือเป็นคนละรหัส</b> (v_dc ≠ V_DC) ·
        ชนิด &quot;ข้อความ&quot; และ &quot;รูป&quot; ยังไม่เปิดใช้ เพราะหน้าช่างยังไม่มีที่เก็บคำตอบสองชนิดนี้
        {types.length > 0 && ` · ชนิดงานที่เปิดใช้: ${types.map((t) => t.label_th).join(" · ")}`}
      </p>

      {toast && (
        <div className="fixed left-1/2 bottom-7 -translate-x-1/2 z-[60] bg-gray-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
