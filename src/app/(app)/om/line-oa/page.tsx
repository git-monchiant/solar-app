"use client";
// หน้า LINE OA ของโมดูล O&M — ภาพรวม Channel · LIFF Apps · Rich Menu designer
// ★ แนวที่เคาะ: ไม่ตั้ง default rich menu ของ OA — เมนูนี้ผูกรายคนเฉพาะลูกค้าที่ยืนยันตัวตนแล้ว
// ★ LINE แก้ rich menu ที่สร้างแล้วไม่ได้ → ทุกการแก้ = เวอร์ชันใหม่ + สลับ (blue-green) · ย้อนได้
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";

interface LiffApp {
  id: number; code: string; name: string; liff_id: string | null;
  endpoint_path: string; view_size: string; is_active: boolean; note: string | null;
}
interface RmVersion {
  id: number; version_no: number; name: string; chat_bar_text: string;
  layout: string; status: string; rich_menu_id: string | null;
  has_image: boolean; created_at: string; deployed_at: string | null; created_by_name: string | null;
}
interface Faq {
  id: number; category: string | null; question: string; answer: string;
  sort_order: number; is_active: boolean; view_count: number; updated_at: string;
}
interface FaqCat { id: number; name: string; sort_order: number; is_active: boolean; used_count: number }
interface Status {
  enabled: boolean; mode: string; has_token: boolean; has_secret: boolean; webhook_path: string;
  bot: { displayName?: string; basicId?: string } | null;
  stats: { total: number; following: number; verified: number; reachable: number };
}
type Cell = { label: string; kind: "liff" | "url" | "message" | "tel" | ""; value: string };
interface Tmpl {
  id: string; group: string; name: string;
  size: { width: number; height: number };
  areas: { x: number; y: number; width: number; height: number }[];
}

const STATUS_STYLE: Record<string, { t: string; c: string }> = {
  active: { t: "ใช้งานอยู่", c: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  draft: { t: "ร่าง", c: "bg-gray-100 text-gray-500 border-gray-200" },
  publishing: { t: "กำลังเผยแพร่…", c: "bg-amber-50 text-amber-700 border-amber-200" },
  history: { t: "ประวัติ", c: "bg-gray-100 text-gray-500 border-gray-200" },
  failed: { t: "ล้มเหลว", c: "bg-red-50 text-red-700 border-red-200" },
};
const EMPTY_CELLS: Cell[] = [
  { label: "MyHome", kind: "liff", value: "myhome" },
  { label: "สินค้า", kind: "liff", value: "shop" },
  { label: "แจ้งซ่อม / นัดบริการ", kind: "liff", value: "booking" },
  { label: "ติดต่อเจ้าหน้าที่", kind: "message", value: "ติดต่อเจ้าหน้าที่" },
  { label: "FAQ", kind: "liff", value: "faq" },
  { label: "Referral", kind: "liff", value: "referral" },
];

export default function OmLineOaPage() {
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [apps, setApps] = useState<LiffApp[]>([]);
  const [versions, setVersions] = useState<RmVersion[]>([]);
  const [templates, setTemplates] = useState<Tmpl[]>([]);
  const [tmplId, setTmplId] = useState("large-6");
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [newFaq, setNewFaq] = useState({ category: "", question: "", answer: "" });
  // แก้ค้างไว้รายข้อ — มีค่าเมื่อผู้ใช้พิมพ์ แล้วต้องกด "บันทึก" ถึงจะลง DB
  const [faqEdits, setFaqEdits] = useState<Record<number, { category: string; question: string; answer: string }>>({});
  const [cats, setCats] = useState<FaqCat[]>([]);
  const [newCat, setNewCat] = useState("");
  // พรีวิว LIFF — เปิดหน้าจริงในกรอบมือถือ (dev ใช้โหมดจำลอง จึงเปิดนอก LINE ได้)
  const [preview, setPreview] = useState<LiffApp | null>(null);
  const [previewMissing, setPreviewMissing] = useState(false);
  const [selApp, setSelApp] = useState("myhome");
  const [showAppCfg, setShowAppCfg] = useState(false);
  const [faqFilter, setFaqFilter] = useState<string>("__all__");
  const [loading, setLoading] = useState(true);
  const [cells, setCells] = useState<Cell[]>(EMPTY_CELLS);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [s, l, v, t, f, cg] = await Promise.all([
      apiFetch("/api/om/line-oa/status"),
      apiFetch("/api/om/line-oa/liff"),
      apiFetch("/api/om/line-oa/richmenu?audience=verified"),
      apiFetch("/api/om/line-oa/templates"),
      apiFetch("/api/om/faq"),
      apiFetch("/api/om/faq/categories"),
    ]);
    setStatus(s); setApps(l.apps || []); setVersions(v.versions || []); setTemplates(t.templates || []);
    setFaqs(f.faqs || []); setCats(cg.categories || []);
    // เวอร์ชันล่าสุดคือจุดตั้งต้นของการแก้ครั้งถัดไป
    const latest = (v.versions || [])[0];
    if (latest) {
      try {
        const parsed = JSON.parse(latest.layout);
        setCells((parsed.areas as { action: Record<string, string> }[]).map((a) => toCell(a.action)));
        // เดาว่าเวอร์ชันนี้ใช้เทมเพลตไหน จากขนาด+จำนวนช่อง+พิกัด
        const match = (t.templates as Tmpl[]).find((tm) =>
          tm.size.width === parsed.size?.width && tm.size.height === parsed.size?.height &&
          tm.areas.length === parsed.areas.length &&
          tm.areas.every((a, i) => a.x === parsed.areas[i]?.bounds?.x && a.y === parsed.areas[i]?.bounds?.y));
        if (match) setTmplId(match.id);
      } catch { /* ใช้ค่าตั้งต้น */ }
    }
  };

  useEffect(() => { load().catch(console.error).finally(() => setLoading(false)); }, []);

  const liffUri = (code: string) => {
    const app = apps.find((a) => a.code === code);
    return app?.liff_id ? `https://liff.line.me/${app.liff_id}` : `https://liff.line.me/PENDING-${code}`;
  };
  const toAction = (c: Cell) => {
    if (c.kind === "liff") return { type: "uri", label: c.label, uri: liffUri(c.value) };
    if (c.kind === "url") return { type: "uri", label: c.label, uri: c.value };
    if (c.kind === "tel") return { type: "uri", label: c.label, uri: `tel:${c.value}` };
    return { type: "message", label: c.label, text: c.value || c.label };
  };
  const toCell = (a: Record<string, string>): Cell => {
    const label = a.label || "";
    if (a.type === "message") return { label, kind: "message", value: a.text || "" };
    const uri = a.uri || "";
    if (uri.startsWith("tel:")) return { label, kind: "tel", value: uri.slice(4) };
    if (uri.includes("liff.line.me/")) {
      const id = uri.split("liff.line.me/")[1];
      const app = apps.find((x) => x.liff_id === id) || apps.find((x) => id?.endsWith(x.code));
      return { label, kind: "liff", value: app?.code || "myhome" };
    }
    return { label, kind: "url", value: uri };
  };

  const saveDraft = async () => {
    setBusy(true); setMsg("");
    try {
      const tmpl = templates.find((t) => t.id === tmplId) || templates[0];
      const layout = {
        size: tmpl.size,
        areas: tmpl.areas.map((b, i) => ({ bounds: b, action: toAction(cells[i] || { label: "", kind: "message", value: "" }) })),
      };
      const r = await apiFetch("/api/om/line-oa/richmenu", {
        method: "POST",
        body: JSON.stringify({
          audience: "verified",
          name: `เมนูลูกค้า O&M v${(versions[0]?.version_no ?? 0) + 1}`,
          chat_bar_text: "เมนู",
          layout,
        }),
      });
      // อัปรูปพื้นต่อทันทีถ้าเลือกไว้ — ระบบย่อ/บีบให้เองไม่ต้องเตรียมขนาด
      let extra = "";
      if (imgFile) {
        const fd = new FormData();
        fd.append("file", imgFile);
        const up = await apiFetch(`/api/om/line-oa/richmenu/${r.id}/image`, { method: "POST", body: fd });
        extra = up.note ? ` · ${up.note}` : ` · อัปโหลดรูปแล้ว (${up.dimensions})`;
        setImgFile(null);
      }
      setMsg(`บันทึกเป็นร่าง v${r.version_no} แล้ว — กด "เผยแพร่" เพื่อใช้งาน${extra}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const deploy = async (id: number) => {
    setBusy(true); setMsg("");
    try {
      const r = await apiFetch(`/api/om/line-oa/richmenu/${id}/deploy`, { method: "POST" });
      setMsg(r.message);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "เผยแพร่ไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const patchFaq = async (id: number, patch: Partial<Faq>) => {
    await apiFetch("/api/om/faq", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
    await load();
  };
  const addFaq = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) { setMsg("ต้องกรอกทั้งคำถามและคำตอบ"); return; }
    setBusy(true);
    try {
      await apiFetch("/api/om/faq", { method: "POST", body: JSON.stringify(newFaq) });
      setNewFaq({ category: "", question: "", answer: "" });
      setMsg("เพิ่มคำถามแล้ว");
      await load();
    } finally { setBusy(false); }
  };
  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return;
    setBusy(true);
    try {
      await apiFetch("/api/om/faq/categories", { method: "POST", body: JSON.stringify({ name }) });
      setNewCat(""); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "เพิ่มหมวดไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const patchCat = async (id: number, patch: Partial<FaqCat>) => {
    try {
      await apiFetch("/api/om/faq/categories", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "แก้หมวดไม่สำเร็จ"); }
  };
  const delCat = async (c: FaqCat) => {
    if (!confirm(`ลบหมวด "${c.name}"?`)) return;
    try {
      await apiFetch(`/api/om/faq/categories?id=${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "ลบหมวดไม่สำเร็จ"); }
  };

  const moveFaq = async (id: number, direction: "up" | "down") => {
    await apiFetch("/api/om/faq/reorder", { method: "POST", body: JSON.stringify({ id, direction }) });
    await load();
  };

  const editFaq = (q: Faq, patch: Partial<{ category: string; question: string; answer: string }>) =>
    setFaqEdits((prev) => ({
      ...prev,
      [q.id]: { ...{ category: q.category ?? "", question: q.question, answer: q.answer }, ...prev[q.id], ...patch },
    }));
  const isDirty = (q: Faq) => {
    const e = faqEdits[q.id];
    return !!e && (e.question !== q.question || e.answer !== q.answer || e.category !== (q.category ?? ""));
  };
  const saveFaq = async (q: Faq) => {
    const e = faqEdits[q.id];
    if (!e) return;
    if (!e.question.trim() || !e.answer.trim()) { setMsg("คำถามและคำตอบห้ามว่าง"); return; }
    setBusy(true);
    try {
      await patchFaq(q.id, { category: e.category.trim(), question: e.question.trim(), answer: e.answer.trim() });
      setFaqEdits((prev) => { const n = { ...prev }; delete n[q.id]; return n; });
      setMsg("บันทึกแล้ว");
    } finally { setBusy(false); }
  };
  const cancelFaq = (id: number) =>
    setFaqEdits((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const delFaq = async (id: number) => {
    if (!confirm("ลบคำถามนี้?")) return;
    await apiFetch(`/api/om/faq?id=${id}`, { method: "DELETE" });
    await load();
  };

  const openPreview = async (a: LiffApp) => {
    setPreview(a);
    setPreviewMissing(false);
    // เช็คก่อนว่าหน้านั้นสร้างแล้วหรือยัง (บางแอปยังไม่ได้เขียน)
    try {
      const r = await fetch(a.endpoint_path, { method: "GET", cache: "no-store" });
      setPreviewMissing(!r.ok);
    } catch { setPreviewMissing(true); }
  };

  const patchApp = async (id: number, patch: Partial<LiffApp>) => {
    await apiFetch("/api/om/line-oa/liff", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
    await load();
  };

  if (loading) return <div><Header title="LINE OA" subtitle="LIFF · Rich Menu · Channel" /><Loading /></div>;

  function FaqSettings() {
    return (
          <div className="grid gap-4 xl:grid-cols-[2fr_3fr] items-start">

            {/* เพิ่มคำถามใหม่ + จัดการหมวด */}
            <div>
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <div className="font-bold text-base text-gray-900">เพิ่มคำถาม</div>
                <div className="text-xs text-gray-400">ลูกค้าเห็นทันทีในเมนู FAQ</div>
              </div>
              <div className="p-5 space-y-3">
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-gray-500">หมวด (ไม่บังคับ)</span>
                  <select value={newFaq.category} onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
                    className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary">
                    <option value="">— ไม่จัดหมวด —</option>
                    {cats.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-gray-500">คำถาม</span>
                  <input value={newFaq.question} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
                    placeholder="เช่น สิทธิ์ล้างแผงเหลือกี่ครั้ง"
                    className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-bold text-gray-500">คำตอบ</span>
                  <textarea value={newFaq.answer} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
                    rows={4} placeholder="ตอบให้จบในตัว ลูกค้าจะได้ไม่ต้องถามซ้ำ"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium outline-none focus:border-primary resize-y" />
                </label>
                <button type="button" onClick={addFaq} disabled={busy} style={{ minHeight: 0 }}
                  className="w-full h-9 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">
                  เพิ่มคำถาม
                </button>
              </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden mt-4">
                <div className="px-5 py-3 border-b border-gray-100">
                  <div className="font-bold text-base text-gray-900">หมวดคำถาม</div>
                  <div className="text-xs text-gray-400">ลำดับนี้คือลำดับชิปกรองที่ลูกค้าเห็น</div>
                </div>
                <div className="p-5">
                  <div className="flex gap-2">
                    <input value={newCat} onChange={(e) => setNewCat(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCat()} placeholder="ชื่อหมวดใหม่"
                      className="h-9 flex-1 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
                    <button type="button" onClick={addCat} disabled={busy || !newCat.trim()} style={{ minHeight: 0 }}
                      className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">เพิ่ม</button>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {cats.length === 0 && <div className="text-xs text-gray-400 py-2">ยังไม่มีหมวด</div>}
                    {cats.map((c, i) => (
                      <div key={c.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                        c.is_active ? "border-gray-200" : "border-gray-200 bg-gray-50"}`}>
                        <input defaultValue={c.name}
                          onBlur={(ev) => ev.target.value.trim() && ev.target.value !== c.name && patchCat(c.id, { name: ev.target.value.trim() })}
                          className="flex-1 min-w-0 bg-transparent text-sm font-semibold outline-none" />
                        <span className="text-xs text-gray-400 shrink-0">{c.used_count} ข้อ</span>
                        <button type="button" title="เลื่อนขึ้น" disabled={i === 0} style={{ minHeight: 0 }}
                          onClick={() => patchCat(c.id, { sort_order: (cats[i - 1]?.sort_order ?? 0) - 1 })}
                          className="px-1.5 rounded border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 cursor-pointer">↑</button>
                        <button type="button" title="เลื่อนลง" disabled={i === cats.length - 1} style={{ minHeight: 0 }}
                          onClick={() => patchCat(c.id, { sort_order: (cats[i + 1]?.sort_order ?? 0) + 1 })}
                          className="px-1.5 rounded border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 cursor-pointer">↓</button>
                        <button type="button" onClick={() => patchCat(c.id, { is_active: !c.is_active })} style={{ minHeight: 0 }}
                          className="px-2 rounded border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                          {c.is_active ? "ซ่อน" : "แสดง"}
                        </button>
                        <button type="button" onClick={() => delCat(c)} disabled={c.used_count > 0} style={{ minHeight: 0 }}
                          title={c.used_count > 0 ? "ยังมีคำถามใช้หมวดนี้อยู่" : "ลบหมวด"}
                          className="px-2 rounded border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-30 cursor-pointer">ลบ</button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-xs text-gray-400 leading-relaxed">
                    แก้ชื่อหมวดแล้วคลิกที่อื่น = เปลี่ยนให้ทุกคำถามในหมวดนั้นด้วย · ลบได้เฉพาะหมวดที่ไม่มีคำถามใช้อยู่
                  </p>
                </div>
              </div>
            </div>

            {/* รายการคำถาม */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="font-bold text-base text-gray-900">คำถามที่พบบ่อย</div>
                  <span className="text-xs text-gray-400">
                    {faqs.filter((x) => x.is_active).length} เผยแพร่ · {faqs.length} ทั้งหมด
                  </span>
                </div>
                {/* กรองตามหมวด — เลือกหมวดแล้วปุ่ม ↑↓ จะเรียงเฉพาะในหมวดนั้น */}
                <div className="flex gap-1.5 flex-wrap mt-2.5">
                  {[
                    { key: "__all__", label: "ทั้งหมด", n: faqs.length },
                    ...cats.map((c) => ({ key: c.name, label: c.name, n: faqs.filter((x) => x.category === c.name).length })),
                    { key: "__none__", label: "ไม่จัดหมวด", n: faqs.filter((x) => !x.category).length },
                  ].filter((t) => t.key === "__all__" || t.n > 0).map((t) => (
                    <button key={t.key} type="button" onClick={() => setFaqFilter(t.key)} style={{ minHeight: 0 }}
                      className={`px-2.5 py-1 rounded-full border text-xs font-bold transition-colors cursor-pointer ${
                        faqFilter === t.key ? "bg-blue-900 text-white border-blue-900" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}>
                      {t.label} <span className={faqFilter === t.key ? "opacity-70" : "text-gray-400"}>{t.n}</span>
                    </button>
                  ))}
                </div>
              </div>
              {shownFaqs.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-400">
                  {faqs.length === 0 ? "ยังไม่มีคำถาม" : "ไม่มีคำถามในหมวดนี้"}
                </div>
              ) : shownFaqs.map((q, i) => {
                const e = faqEdits[q.id];
                const dirty = isDirty(q);
                // ขึ้นหัวข้อหมวดเมื่อเปลี่ยนหมวด (ดูรวมทั้งหมดจึงจะเห็นการแบ่งกลุ่ม)
                const showCatHead = faqFilter === "__all__" &&
                  (i === 0 || (shownFaqs[i - 1].category ?? "") !== (q.category ?? ""));
                return (
                  <div key={q.id}>
                  {showCatHead && (
                    <div className="border-t border-gray-200 bg-gray-50 px-5 py-1.5 text-xs font-bold text-gray-500">
                      {q.category || "ไม่จัดหมวด"}
                      <span className="ml-2 font-medium text-gray-400">{sameCat(q).length} ข้อ</span>
                    </div>
                  )}
                  <div className={`border-t border-gray-100 px-5 py-3 ${
                    dirty ? "bg-amber-50/50" : q.is_active ? "" : "bg-gray-50"}`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <select value={e?.category ?? (q.category ?? "")}
                        onChange={(ev) => editFaq(q, { category: ev.target.value })}
                        className="w-32 h-7 rounded-md border border-gray-200 px-1.5 text-xs font-bold text-gray-600 outline-none focus:border-primary">
                        <option value="">ไม่จัดหมวด</option>
                        {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                      {!q.is_active && <Pill c="bg-amber-50 text-amber-700 border-amber-200">ซ่อนอยู่</Pill>}
                      {dirty && <Pill c="bg-amber-100 text-amber-800 border-amber-300">ยังไม่บันทึก</Pill>}
                      {q.view_count > 0 && <span className="text-xs text-gray-400">เปิดดู {q.view_count} ครั้ง</span>}
                      <div className="ml-auto flex items-center gap-1">
                        {dirty ? (
                          <>
                            <button type="button" onClick={() => saveFaq(q)} disabled={busy} style={{ minHeight: 0 }}
                              className="px-3 py-1 rounded-md bg-primary text-white text-xs font-bold disabled:opacity-40 cursor-pointer">บันทึก</button>
                            <button type="button" onClick={() => cancelFaq(q.id)} style={{ minHeight: 0 }}
                              className="px-2.5 py-1 rounded-md border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 cursor-pointer">ยกเลิก</button>
                          </>
                        ) : (
                          <>
                            <button type="button" title="เลื่อนขึ้นในหมวด" disabled={catIndex(q) === 0} style={{ minHeight: 0 }}
                              onClick={() => moveFaq(q.id, "up")}
                              className="px-2 py-0.5 rounded-md border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 cursor-pointer">↑</button>
                            <button type="button" title="เลื่อนลงในหมวด" disabled={catIndex(q) === sameCat(q).length - 1} style={{ minHeight: 0 }}
                              onClick={() => moveFaq(q.id, "down")}
                              className="px-2 py-0.5 rounded-md border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 disabled:opacity-30 cursor-pointer">↓</button>
                            <button type="button" onClick={() => patchFaq(q.id, { is_active: !q.is_active })} style={{ minHeight: 0 }}
                              className="px-2.5 py-0.5 rounded-md border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                              {q.is_active ? "ซ่อน" : "แสดง"}
                            </button>
                            <button type="button" onClick={() => delFaq(q.id)} style={{ minHeight: 0 }}
                              className="px-2.5 py-0.5 rounded-md border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 cursor-pointer">ลบ</button>
                          </>
                        )}
                      </div>
                    </div>
                    <input value={e?.question ?? q.question}
                      onChange={(ev) => editFaq(q, { question: ev.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-bold outline-none focus:border-primary" />
                    <textarea value={e?.answer ?? q.answer} rows={2}
                      onChange={(ev) => editFaq(q, { answer: ev.target.value })}
                      className="w-full mt-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-600 outline-none focus:border-primary resize-y" />
                  </div>
                  </div>
                );
              })}
              <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
                แก้แล้วต้องกด "บันทึก" ถึงจะมีผล · เรียงตามลำดับหมวดก่อน แล้วค่อยลำดับในหมวด (↑↓ เลื่อนได้ในหมวดตัวเอง) · อยากย้ายหมวดให้เปลี่ยนที่ dropdown
              </div>
            </div>
          </div>
    );
  }

  const shownFaqs = faqs.filter((q) =>
    faqFilter === "__all__" ? true : faqFilter === "__none__" ? !q.category : q.category === faqFilter);
  // เลื่อนลำดับได้เฉพาะภายในหมวดเดียวกัน (ย้ายหมวด = เปลี่ยน dropdown ไม่ใช่กดลูกศร)
  const sameCat = (q: Faq) => shownFaqs.filter((x) => (x.category ?? "") === (q.category ?? ""));
  const catIndex = (q: Faq) => sameCat(q).findIndex((x) => x.id === q.id);
  const activeVersion = versions.find((v) => v.status === "active") || null;
  const tmpl = templates.find((t) => t.id === tmplId) || templates[0] ||
    { id: "large-6", group: "large", name: "ใหญ่ 6 ช่อง", size: { width: 2500, height: 1686 }, areas: [] };
  const TABS = ["ภาพรวม Channel", "LIFF Apps", "Rich Menu"];
  return (
    <div>
      <Header title="LINE OA" subtitle="LIFF · Rich Menu · Channel" />

      <div className="bg-white border-b border-gray-200 px-4 md:px-6 flex gap-1.5 overflow-x-auto">
        {TABS.map((t, i) => (
          <button key={t} type="button" onClick={() => setTab(i)} style={{ minHeight: 0 }}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === i ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mx-4 md:mx-6 mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
          {msg}
        </div>
      )}

      <div className="p-4 md:p-6">
        {/* ─── ภาพรวม Channel ─── */}
        {tab === 0 && status && (
          <div className="space-y-4">
            {/* สถิติขึ้นก่อน — ตอบคำถามแรกของแอดมิน: เผยแพร่แล้วถึงใครบ้าง */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat n={status.stats.total} t="LINE user ทั้งหมด" />
              <Stat n={status.stats.following} t="ยังเป็นเพื่อน" />
              <Stat n={status.stats.verified} t="ยืนยันตัวตนแล้ว" />
              <Stat n={status.stats.reachable} t="จะได้รับเมนู O&M" hi />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 font-bold text-gray-900">การเชื่อมต่อ</div>
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                  <Row k="สถานะ" v={status.enabled
                    ? <Pill c="bg-emerald-50 text-emerald-700 border-emerald-200">เชื่อมต่อแล้ว</Pill>
                    : <Pill c="bg-amber-50 text-amber-700 border-amber-200">ยังไม่ได้ต่อ channel (โหมดจำลอง)</Pill>} />
                  <Row k="OA" v={status.bot?.displayName
                    ? <span className="font-semibold">{status.bot.displayName} <span className="font-mono text-xs text-gray-500">{status.bot.basicId}</span></span>
                    : <span className="text-gray-400">—</span>} />
                  <Row k="โหมด" v={<span className="font-mono text-xs">{status.mode}</span>} />
                  <Row k="Channel secret / token" v={<span>{status.has_secret ? "✓" : "✕"} secret · {status.has_token ? "✓" : "✕"} token</span>} />
                  <Row k="Webhook" v={<span className="font-mono text-xs break-all">{status.webhook_path}</span>} />
                  <Row k="เมนูที่ใช้อยู่" v={activeVersion
                    ? <span className="font-semibold">v{activeVersion.version_no} <span className="text-gray-400 font-normal">· {activeVersion.name}</span></span>
                    : <span className="text-gray-400">ยังไม่ได้เผยแพร่</span>} />
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 leading-relaxed">
                โมดูลนี้<b>ไม่ตั้ง default rich menu ของ OA</b> — เมนู O&M ผูกรายคนเฉพาะลูกค้าที่ยืนยันตัวตนแล้ว
                ผู้ใช้อื่นยังเห็นเมนูเดิมที่ทีมขายตั้งไว้ ไม่กระทบกัน
              </div>
            </div>
          </div>
        )}

        {/* ─── LIFF Apps ─── */}
        {tab === 1 && (
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)] items-start">

            {/* ── รายชื่อแอป ── */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="font-bold text-base text-gray-900">หน้า LIFF</div>
                <div className="text-xs text-gray-400">เลือกเพื่อตั้งค่าของหน้านั้น</div>
              </div>
              {apps.map((a) => (
                <button key={a.id} type="button" onClick={() => { setSelApp(a.code); setPreview(null); setShowAppCfg(false); }}
                  style={{ minHeight: 0 }}
                  className={`w-full text-left px-4 py-3 border-t border-gray-100 transition-colors cursor-pointer ${
                    selApp === a.code ? "bg-teal-50" : "hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-gray-900">{a.name}</span>
                    {!a.is_active && <Pill c="bg-gray-100 text-gray-500 border-gray-200">ปิด</Pill>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400 font-mono">{a.code}</span>
                    {a.liff_id
                      ? <Pill c="bg-emerald-50 text-emerald-700 border-emerald-200">พร้อมใช้</Pill>
                      : <Pill c="bg-amber-50 text-amber-700 border-amber-200">รอ LIFF ID</Pill>}
                  </div>
                </button>
              ))}
            </div>

            {/* ── ตั้งค่าของแอปที่เลือก ── */}
            {(() => {
              const a = apps.find((x) => x.code === selApp);
              if (!a) return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">เลือกหน้า LIFF จากรายการ</div>;
              return (
                <div className="space-y-4 min-w-0">
                  <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-bold text-base text-gray-900 truncate">{a.name}</div>
                        <div className="text-xs text-gray-400 font-mono truncate">{a.endpoint_path}</div>
                      </div>
                      <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => openPreview(a)} style={{ minHeight: 0 }}
                          className="h-8 px-4 rounded-lg bg-primary text-white text-sm font-semibold cursor-pointer">
                          แสดงผล
                        </button>
                        <button type="button" onClick={() => setShowAppCfg((v) => !v)} style={{ minHeight: 0 }}
                          title={showAppCfg ? "ซ่อนการตั้งค่า" : "ตั้งค่า LIFF ID / ขนาดหน้าจอ"}
                          className="h-8 px-3 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer whitespace-nowrap">
                          ตั้งค่า {showAppCfg ? "▴" : "▾"}
                        </button>
                      </div>
                    </div>
                    {showAppCfg && (
                    <div className="p-5 grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-gray-500">LIFF ID</span>
                        <input defaultValue={a.liff_id || ""} placeholder="ยังไม่ได้ขอจากทีม"
                          onBlur={(e) => e.target.value !== (a.liff_id || "") && patchApp(a.id, { liff_id: e.target.value })}
                          className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-mono outline-none focus:border-primary" />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-gray-500">ชื่อที่แสดง</span>
                        <input defaultValue={a.name}
                          onBlur={(e) => e.target.value.trim() && e.target.value !== a.name && patchApp(a.id, { name: e.target.value.trim() })}
                          className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs font-bold text-gray-500">ขนาดหน้าจอ</span>
                        <select defaultValue={a.view_size} onChange={(e) => patchApp(a.id, { view_size: e.target.value })}
                          className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary">
                          <option value="full">full — เต็มจอ</option>
                          <option value="tall">tall — สูง 75%</option>
                          <option value="compact">compact — เตี้ย</option>
                        </select>
                      </label>
                      <label className="flex items-end gap-2 pb-1.5">
                        <input type="checkbox" checked={a.is_active} onChange={() => patchApp(a.id, { is_active: !a.is_active })}
                          className="w-4 h-4 accent-teal-500" />
                        <span className="text-sm font-semibold text-gray-700">เปิดใช้งาน</span>
                      </label>
                      {a.note && <p className="md:col-span-2 text-xs text-gray-400">{a.note}</p>}
                      <div className="md:col-span-2 border-t border-gray-100 pt-3">
                        <a href={a.endpoint_path} target="_blank" rel="noreferrer"
                          className="text-xs font-bold text-gray-500 hover:text-gray-700 underline">
                          เปิดหน้านี้ในแท็บใหม่
                        </a>
                      </div>
                    </div>
                    )}
                  </div>

                  {/* ตั้งค่าเฉพาะของหน้านั้น */}
                  {selApp === "faq" ? FaqSettings() : (
                    <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
                      <div className="text-sm font-bold text-gray-700">ยังไม่มีตั้งค่าเฉพาะของหน้านี้</div>
                      <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                        จะเพิ่มเมื่อสร้างหน้านั้นจริง — เช่น จองบริการ (ช่วงเวลาที่จองได้) · ยืนยันตัวตน (อายุ OTP) · ร้านค้า (โซนที่เปิดขาย)
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {tab === 2 && (
          <>
            {/* แถบสั่งงานหลัก */}
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <div className="font-bold text-base text-gray-900">เมนูลูกค้า O&M</div>
              <span className="text-xs text-gray-400">v{(versions[0]?.version_no ?? 0) + 1} (ร่างถัดไป)</span>
              <button type="button" onClick={saveDraft} disabled={busy} style={{ minHeight: 0 }}
                className="ml-auto h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-40 cursor-pointer">
                บันทึกเป็นเวอร์ชันใหม่
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[2fr_3fr] items-start">

              {/* ═══ ซ้าย: เทมเพลต → พรีวิว → รูปพื้น ═══ */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                  <div className="font-bold text-base text-gray-900">ผังเมนู</div>
                  <span className="text-xs text-gray-400 ml-auto">{tmpl.size.width}×{tmpl.size.height} · {tmpl.areas.length} ช่อง</span>
                </div>
                <div className="p-5 space-y-4">
                  {/* เทมเพลต — อยู่เหนือพรีวิว เลือกแล้วเห็นผลทันที */}
                  <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                    {templates.map((t) => (
                      <button key={t.id} type="button" onClick={() => { setTmplId(t.id); setSel(null); }}
                        style={{ minHeight: 0 }} title={`${t.size.width}×${t.size.height}`}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border bg-white px-2 py-2 transition-colors cursor-pointer ${
                          tmplId === t.id ? "border-primary bg-teal-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <span className="flex h-6 items-center"><MiniTemplate t={t} on={tmplId === t.id} /></span>
                        <span className="text-xs text-gray-600 whitespace-nowrap">{t.name}</span>
                      </button>
                    ))}
                  </div>

                  {/* พรีวิว */}
                  <div className="relative w-full max-w-[400px] mx-auto border border-gray-300 rounded-lg overflow-hidden bg-gray-100"
                       style={{ aspectRatio: `${tmpl.size.width} / ${tmpl.size.height}` }}>
                    {tmpl.areas.map((b, i) => {
                      const c = cells[i] || { label: "", kind: "", value: "" };
                      return (
                        <button key={i} type="button" onClick={() => setSel(i)} style={{
                          minHeight: 0, position: "absolute",
                          left: `${(b.x / tmpl.size.width) * 100}%`, top: `${(b.y / tmpl.size.height) * 100}%`,
                          width: `${(b.width / tmpl.size.width) * 100}%`, height: `${(b.height / tmpl.size.height) * 100}%`,
                        }}
                          className={`border flex flex-col items-center justify-center px-1 text-center overflow-hidden transition-colors cursor-pointer ${
                            sel === i ? "border-primary bg-teal-50 z-10" : "border-gray-300 bg-white hover:bg-gray-50"}`}>
                          <span className="text-xxs font-bold text-gray-300 leading-none">{String.fromCharCode(65 + i)}</span>
                          <span className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{c.label || "—"}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* รูปพื้นเมนู */}
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">รูปพื้นเมนู</h3>
                    <input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files?.[0] || null)}
                      className="text-xs file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border file:border-gray-200 file:bg-white file:text-xs file:font-bold file:text-gray-600 file:cursor-pointer" />
                    <p className="mt-1.5 text-xs text-gray-400">
                      {imgFile ? `เลือกแล้ว: ${imgFile.name}` : "ไม่เลือก = ใช้รูปเดิมจากเวอร์ชันล่าสุด"} ·
                      อัปขนาดไหนก็ได้ ระบบย่อเป็น {tmpl.size.width}×{tmpl.size.height} และบีบ ≤1MB ให้เอง
                    </p>
                  </div>
                </div>
              </div>

              {/* ═══ ขวา: ปุ่มในเมนู → ประวัติ ═══ */}
              <div className="space-y-4 min-w-0">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
                    <div className="font-bold text-base text-gray-900">ปุ่มในเมนู</div>
                    <span className="text-xs text-gray-400">{tmpl.areas.length} ช่อง</span>
                  </div>
                  {/* หัวคอลัมน์ครั้งเดียว — แต่ละช่องจึงเป็นบรรทัดเดียว */}
                  <div className="grid gap-2 items-center px-5 py-2 bg-gray-50 border-t border-gray-100
                                  grid-cols-[64px_1fr_128px_1.6fr] text-xs font-bold text-gray-500">
                    <span>ช่อง</span><span>ป้ายกำกับ</span><span>การทำงาน</span><span>ปลายทาง</span>
                  </div>
                  {tmpl.areas.map((b, i) => {
                    const c = cells[i] || { label: "", kind: "message" as Cell["kind"], value: "" };
                    const upd = (patch: Partial<Cell>) =>
                      setCells(Array.from({ length: tmpl.areas.length }, (_, k) =>
                        k === i ? { ...c, ...patch } : (cells[k] || { label: "", kind: "message", value: "" })));
                    return (
                      <div key={i} onFocus={() => setSel(i)} onMouseEnter={() => setSel(i)}
                        className={`grid gap-2 items-center border-t border-gray-100 px-5 py-2
                                    grid-cols-[64px_1fr_128px_1.6fr] ${sel === i ? "bg-teal-50/40" : ""}`}>
                        <span className="text-sm font-bold text-gray-900"
                          title={`${Math.round((b.width / tmpl.size.width) * 100)}% × ${Math.round((b.height / tmpl.size.height) * 100)}%`}>
                          {String.fromCharCode(65 + i)}
                        </span>
                        <input value={c.label} onChange={(e) => upd({ label: e.target.value })} placeholder="ป้ายกำกับ"
                          className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
                        <select value={c.kind} onChange={(e) => upd({ kind: e.target.value as Cell["kind"], value: "" })}
                          className="h-9 w-full rounded-lg border border-gray-200 px-2 text-sm font-semibold outline-none focus:border-primary">
                          <option value="liff">LIFF</option>
                          <option value="message">ข้อความ</option>
                          <option value="tel">โทร</option>
                          <option value="url">ลิงก์</option>
                        </select>
                        {c.kind === "liff" ? (
                          <select value={c.value} onChange={(e) => upd({ value: e.target.value })}
                            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary">
                            {apps.map((a) => <option key={a.code} value={a.code}>{a.name}{a.liff_id ? "" : " (รอ LIFF ID)"}</option>)}
                          </select>
                        ) : (
                          <input value={c.value} onChange={(e) => upd({ value: e.target.value })}
                            placeholder={c.kind === "tel" ? "02-xxx-xxxx" : c.kind === "url" ? "https://…" : "ข้อความที่ส่ง"}
                            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary" />
                        )}
                      </div>
                    );
                  })}
                  <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
                    LINE แก้เมนูที่สร้างแล้วไม่ได้ — ทุกการแก้จึงเป็นเวอร์ชันใหม่ · ย้อนกลับได้ (โควตา 1,000 เมนู/OA)
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100 font-bold text-base text-gray-900">ประวัติเวอร์ชัน</div>
                  {versions.length === 0 ? (
                    <div className="p-5 text-center text-xs text-gray-400">ยังไม่มีเวอร์ชัน</div>
                  ) : (
                    <div className="max-h-[280px] overflow-y-auto">
                      {versions.map((v) => (
                        <div key={v.id} className="px-5 py-2.5 border-b border-gray-50 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm">v{v.version_no}</span>
                            <Pill c={STATUS_STYLE[v.status]?.c || ""}>{STATUS_STYLE[v.status]?.t || v.status}</Pill>
                            <span className="text-xs text-gray-400 truncate">{v.name}</span>
                            {(v.status === "history" || v.status === "draft") && (
                              <button type="button" onClick={() => deploy(v.id)} disabled={busy} style={{ minHeight: 0 }}
                                className="ml-auto shrink-0 px-2.5 py-0.5 rounded-md border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 cursor-pointer">
                                {v.status === "draft" ? "เผยแพร่" : "ย้อนกลับ"}
                              </button>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {new Date(v.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                            {v.created_by_name ? ` · ${v.created_by_name}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── FAQ ─── */}
      {/* ── พรีวิว LIFF ── */}
      {preview && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setPreview(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto bg-white rounded-2xl shadow-xl w-full max-w-[440px] max-h-[92vh] flex flex-col">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-base text-gray-900 truncate">{preview.name}</div>
                  <div className="text-xs text-gray-400 font-mono truncate">{preview.endpoint_path}</div>
                </div>
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <a href={preview.endpoint_path} target="_blank" rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50">
                    เปิดแท็บใหม่
                  </a>
                  <button type="button" onClick={() => setPreview(null)} style={{ minHeight: 0 }}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                    ปิด
                  </button>
                </div>
              </div>

              {previewMissing ? (
                <div className="p-10 text-center">
                  <div className="text-4xl">🚧</div>
                  <div className="mt-3 font-bold text-gray-900">ยังไม่ได้สร้างหน้านี้</div>
                  <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">
                    ทะเบียนชี้ไปที่ <span className="font-mono">{preview.endpoint_path}</span> แต่ยังไม่มีหน้าในระบบ<br />
                    ปุ่มในเมนูที่ชี้มาที่นี่จะยังกดใช้ไม่ได้
                  </p>
                </div>
              ) : (
                <div className="p-4 overflow-y-auto bg-gray-100 rounded-b-2xl">
                  {/* กรอบมือถือ — ให้เห็นสัดส่วนเดียวกับที่ลูกค้าเปิดใน LINE */}
                  <div className="mx-auto w-[360px] max-w-full rounded-[28px] border-[6px] border-gray-800 overflow-hidden bg-white">
                    <iframe src={preview.endpoint_path} title={preview.name}
                      className="w-full h-[600px] border-0" />
                  </div>
                  <p className="mt-2.5 text-center text-xs text-gray-400 leading-relaxed">
                    พรีวิวนี้เปิดหน้าจริงในโหมดจำลอง (นอก LINE) — ข้อมูลที่เห็นคือของบัญชีทดสอบที่ตั้งใน .env.local
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      </div>
    </div>
  );
}

/** ผังย่อบนปุ่มเลือกเทมเพลต */
function MiniTemplate({ t, on, h = 22 }: { t: Tmpl; on: boolean; h?: number }) {
  const w = Math.round((t.size.width / t.size.height) * h);
  return (
    <span className={`relative block shrink-0 border ${on ? "border-primary" : "border-gray-300"}`}
      style={{ width: w, height: h }}>
      {t.areas.map((b, i) => (
        <span key={i} className={`absolute ${on ? "bg-primary/40" : "bg-gray-300"}`} style={{
          left: `${(b.x / t.size.width) * 100}%`, top: `${(b.y / t.size.height) * 100}%`,
          width: `calc(${(b.width / t.size.width) * 100}% - 1px)`,
          height: `calc(${(b.height / t.size.height) * 100}% - 1px)`,
        }} />
      ))}
    </span>
  );
}

const KIND_TH: Record<string, string> = { liff: "เปิด LIFF", message: "ส่งข้อความ", tel: "โทรออก", url: "เปิดลิงก์" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center gap-3"><span className="w-44 shrink-0 text-gray-500 font-semibold">{k}</span><span>{v}</span></div>;
}
function Pill({ c, children }: { c: string; children: React.ReactNode }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xxs font-bold border ${c}`}>{children}</span>;
}
function Stat({ n, t, hi }: { n: number; t: string; hi?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${hi ? "border-teal-200 bg-teal-50" : "border-gray-200 bg-white"}`}>
      <div className="text-2xl font-bold">{n ?? 0}</div>
      <div className="text-xs text-gray-500 font-semibold mt-0.5">{t}</div>
    </div>
  );
}
