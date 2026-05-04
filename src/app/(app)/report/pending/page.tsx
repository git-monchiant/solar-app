"use client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/Header";
import FallbackImage from "@/components/ui/FallbackImage";
import ImageLightbox, { type LightboxImage } from "@/components/ui/ImageLightbox";
import { formatTHB, formatThaiDate as fmtDate } from "@/lib/utils/formatters";

interface Installment {
  id: number;
  step_no: number;
  slip_field: string;
  doc_no: string | null;
  amount: number;
  description: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  has_slip: boolean;
  slip_urls: string[];
  ref1: string | null;
  ref2: string | null;
}

interface ReportRow {
  lead_id: number;
  pre_doc_no: string;
  full_name: string;
  phone: string;
  project_name: string | null;
  package_name: string | null;
  kwp: number | null;
  pre_booked_at: string;
  pending_amount: number;
  installments: Installment[];
}

interface ReportData {
  rows: ReportRow[];
}

const fmt = (n: number) => formatTHB(Math.round(n));

const stepLabels: Record<number, string> = { 0: "มัดจำ", 1: "ค่าสำรวจ", 3: "งวด 1/2", 4: "งวด 2/2" };
function labelForInstallment(step_no: number, slip_field: string): string {
  if (stepLabels[step_no]) return stepLabels[step_no];
  const m = /^order_installment_(\d+)$/.exec(slip_field || "");
  if (m) return `งวดที่ ${parseInt(m[1]) + 1}`;
  return `step ${step_no}`;
}

interface PendingItem {
  lead_id: number;
  pre_doc_no: string;
  full_name: string;
  project_name: string | null;
  installment: Installment;
}

export default function PendingApprovalReport() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  useEffect(() => {
    apiFetch("/api/report/payments").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">โหลดไม่สำเร็จ</div>;

  // Flatten: one row per pending installment (only ones with slip awaiting verification)
  const items: PendingItem[] = [];
  for (const r of data.rows) {
    for (const inst of r.installments) {
      if (!inst.confirmed_at && inst.has_slip) {
        items.push({
          lead_id: r.lead_id,
          pre_doc_no: r.pre_doc_no,
          full_name: r.full_name,
          project_name: r.project_name,
          installment: inst,
        });
      }
    }
  }
  // Oldest first by payment id (proxy for upload time — payments are inserted sequentially).
  items.sort((a, b) => a.installment.id - b.installment.id);

  const filtered = items.filter(it => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return it.full_name?.toLowerCase().includes(q)
      || it.pre_doc_no?.toLowerCase().includes(q)
      || it.project_name?.toLowerCase().includes(q);
  });

  const totalAmount = filtered.reduce((s, it) => s + it.installment.amount, 0);

  const openSlips = (i: Installment) => {
    if (i.slip_urls.length === 0) return;
    const label = labelForInstallment(i.step_no, i.slip_field);
    const imgs: LightboxImage[] = i.slip_urls.map((url, idx) => ({
      url, label: i.slip_urls.length > 1 ? `${label} · สลิป ${idx + 1} / ${i.slip_urls.length}` : label,
    }));
    setLightbox({ images: imgs, index: 0 });
  };

  return (
    <div>
      <Header title="รอยืนยันรับเงิน" subtitle="คิวสำหรับทีมบัญชี" />

      <div className="p-3 md:p-6 space-y-3">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white border border-gray-300 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">รายการรอยืนยัน</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-gray-900 mt-1">{filtered.length}</div>
          </div>
          <div className="rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-white/70">ยอดรวมรอยืนยัน</div>
            <div className="text-xl md:text-2xl font-bold font-mono tabular-nums mt-1">{fmt(totalAmount)}</div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl border border-gray-300 p-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เลขเอกสาร, โครงการ..." className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-300 p-12 text-center">
            <div className="text-sm text-gray-400">ไม่มีรายการรอยืนยัน</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-300 divide-y divide-gray-100">
            {filtered.map(it => {
              const i = it.installment;
              return (
                <div key={`${it.lead_id}-${i.id}`} className="p-3 md:p-4 flex items-center gap-3 md:gap-4 flex-wrap md:flex-nowrap">
                  {/* Slip thumbnails */}
                  <div className="flex items-center gap-1 shrink-0">
                    {i.slip_urls.slice(0, 3).map((url, idx) => (
                      <FallbackImage
                        key={url}
                        src={url}
                        alt=""
                        className="w-12 h-12 object-cover rounded border border-gray-200"
                        gallery={i.slip_urls.map((u, k) => ({ url: u, label: i.slip_urls.length > 1 ? `${labelForInstallment(i.step_no, i.slip_field)} · สลิป ${k + 1} / ${i.slip_urls.length}` : labelForInstallment(i.step_no, i.slip_field) }))}
                        galleryIndex={idx}
                      />
                    ))}
                    {i.slip_urls.length > 3 && (
                      <button type="button" onClick={() => openSlips(i)} className="w-12 h-12 rounded border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">+{i.slip_urls.length - 3}</button>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/leads/${it.lead_id}`} className="font-semibold text-gray-900 hover:text-primary">{it.full_name}</Link>
                      <span className="text-xs font-mono text-gray-400">{it.pre_doc_no || `#${it.lead_id}`}</span>
                      {it.project_name && <span className="text-xs text-gray-500">· {it.project_name}</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      <span className="font-semibold text-gray-700">{labelForInstallment(i.step_no, i.slip_field)}</span>
                      {i.description && <span> · {i.description}</span>}
                    </div>
                  </div>

                  {/* Refs — own column. Label/value aligned left in 2 columns. */}
                  {(i.ref1 || i.ref2) && (
                    <div className="shrink-0 font-mono tabular-nums leading-tight text-sm">
                      {i.ref1 && (
                        <div className="flex gap-2"><span className="text-gray-400 w-10">Ref1:</span><span className="text-gray-800">{i.ref1}</span></div>
                      )}
                      {i.ref2 && (
                        <div className="flex gap-2"><span className="text-gray-400 w-10">Ref2:</span><span className="text-gray-800">{i.ref2}</span></div>
                      )}
                    </div>
                  )}

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold font-mono tabular-nums text-amber-600">{fmt(i.amount)}</div>
                    <div className="text-xs text-gray-400">บาท</div>
                  </div>

                  {/* Action */}
                  <Link href={`/leads/${it.lead_id}`} className="h-9 px-3 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:brightness-110 inline-flex items-center shrink-0">
                    ยืนยันรับเงิน
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="text-xs text-gray-400 text-center mt-2">
            แสดง {filtered.length} รายการ · เรียงเก่าสุดก่อน
          </div>
        )}
      </div>

      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(n) => setLightbox(prev => prev ? { ...prev, index: n } : null)}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
