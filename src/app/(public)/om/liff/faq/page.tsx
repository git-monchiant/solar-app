"use client";
// หน้า FAQ ฝั่งลูกค้า — เนื้อหาแก้จากหลังบ้าน (แท็บ FAQ ในหน้า LINE OA)
// CI ฝั่ง LIFF: โลโก้จริง + teal #009793 + ส้มทอง #DE8F00
import { useEffect, useState } from "react";

const TEAL = "#009793";

interface Faq { id: number; category: string | null; question: string; answer: string }

export default function OmLiffFaq() {
  const [faqs, setFaqs] = useState<Faq[] | null>(null);
  const [catOrder, setCatOrder] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [cat, setCat] = useState<string>("ทั้งหมด");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/om/liff/faq", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setFaqs(d.faqs || []); setCatOrder(d.categories || []); })
      .catch(() => setError("โหลดคำถามไม่สำเร็จ"));
  }, []);

  const toggle = (id: number) => {
    const next = open === id ? null : id;
    setOpen(next);
    // นับยอดเปิดอ่าน เพื่อรู้ว่าลูกค้าสงสัยเรื่องไหนมากที่สุด
    if (next) fetch("/api/om/liff/faq", { method: "POST", body: JSON.stringify({ id }) }).catch(() => {});
  };

  // แสดงเฉพาะหมวดที่มีคำถามจริง เรียงตามลำดับที่แอดมินตั้ง
  const used = new Set((faqs || []).map((f) => f.category).filter(Boolean) as string[]);
  const cats = ["ทั้งหมด", ...catOrder.filter((c) => used.has(c))];
  const shown = (faqs || []).filter((f) => cat === "ทั้งหมด" || f.category === cat);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white text-zinc-900">
      <header className="px-5 pt-6 pb-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/om/sena-solar-logo.svg" alt="SENA Solar Energy" className="h-9 w-auto" />
        <h1 className="mt-5 text-[2rem] font-bold leading-[1.05] tracking-tight">คำถามที่พบบ่อย</h1>
      </header>

      {cats.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-1">
          {cats.map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)}
              style={cat === c ? { minHeight: 0, background: TEAL, borderColor: TEAL } : { minHeight: 0 }}
              className={`whitespace-nowrap border px-3.5 py-1.5 text-sm font-bold transition-colors ${
                cat === c ? "text-white" : "border-zinc-200 bg-white text-zinc-500"}`}>
              {c}
            </button>
          ))}
        </div>
      )}

      {error && <div className="mx-5 mt-4 border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>}
      {!faqs && !error && <div className="px-5 py-16 text-center text-sm font-medium text-zinc-400">กำลังโหลด…</div>}

      {faqs && shown.length === 0 && (
        <div className="px-5 py-16 text-center text-sm font-medium text-zinc-400">ยังไม่มีคำถามในหมวดนี้</div>
      )}

      <section className="mt-4 px-5 pb-8">
        <div className="border-t border-zinc-200">
          {shown.map((f, i) => (
            <div key={f.id} className="border-b border-zinc-200">
              {/* หัวข้อหมวดคั่น — เฉพาะตอนดูรวมทั้งหมด */}
              {cat === "ทั้งหมด" && (i === 0 || shown[i - 1].category !== f.category) && f.category && (
                <div className="pt-5 pb-1 text-xxs font-medium uppercase tracking-[0.22em]" style={{ color: TEAL }}>
                  {f.category}
                </div>
              )}
              <button type="button" onClick={() => toggle(f.id)} style={{ minHeight: 0 }}
                className="flex w-full items-start gap-3 py-4 text-left">
                <span className="flex-1 text-base font-bold leading-snug">{f.question}</span>
                <span className="mt-0.5 shrink-0 text-lg text-zinc-400">{open === f.id ? "−" : "+"}</span>
              </button>
              {open === f.id && (
                <p className="pb-4 text-sm font-medium leading-relaxed text-zinc-600 whitespace-pre-wrap">{f.answer}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="mt-auto px-5 pb-10">
        <div className="border border-zinc-200 p-5 text-center">
          <div className="text-base font-bold">ไม่เจอคำตอบที่ต้องการ?</div>
          <p className="mt-1.5 text-sm font-medium text-zinc-500">ทักแชตหาเจ้าหน้าที่ได้เลย ตอบในเวลาทำการ</p>
          <button type="button" onClick={() => window.close()} style={{ minHeight: 0, background: TEAL }}
            className="mt-3 w-full py-3 text-base font-bold text-white">
            กลับไปแชต
          </button>
        </div>
      </div>
    </main>
  );
}
