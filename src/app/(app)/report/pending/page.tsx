"use client";
import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import Header from "@/components/layout/Header";
import { LeadLink } from "@/components/lead/LeadLink";
import { useOpenLead } from "@/lib/hooks/useOpenLead";
import FallbackImage from "@/components/ui/FallbackImage";
import ImageLightbox, { type LightboxImage } from "@/components/ui/ImageLightbox";
import { formatTHB } from "@/lib/utils/formatters";

interface Installment {
  id: number;
  step_no: number;
  slip_field: string;
  doc_no: string | null;
  amount: number;
  description: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  payment_method: string | null;
  cheque_received_at: string | null;
  cheque_received_by: string | null;
  cheque_bank: string | null;
  cheque_due_date: string | null;
  cheque_deposited_at: string | null;
  cheque_status: string | null;
  cheque_status_note: string | null;
  cheque_status_by: string | null;
  cheque_status_at: string | null;
  cheque_no: string | null;
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
  order_installments: string | null;
  installments: Installment[];
}

interface ReportData {
  rows: ReportRow[];
}

const fmt = (n: number) => formatTHB(Math.round(n));

const stepLabels: Record<number, string> = { 0: "มัดจำ", 1: "ค่าสำรวจ", 3: "งวด 1/2", 4: "งวด 2/2", 99: "Step 5 · เก็บเงิน" };
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
  is_multi_installment: boolean;
}

export default function PendingApprovalReport() {
  const openLead = useOpenLead();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const [chequeReceivingId, setChequeReceivingId] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/report/payments").then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center py-12 text-gray-400 text-sm">โหลดไม่สำเร็จ</div>;

  // Flatten: one row per pending installment (only ones with slip awaiting verification)
  const installmentIndex = (slipField: string): number | null => {
    const m = /^order_installment_(\d+)$/.exec(slipField || "");
    return m ? parseInt(m[1], 10) : null;
  };
  const plannedInstallmentCount = (row: ReportRow): number => {
    try {
      const arr = row.order_installments ? JSON.parse(row.order_installments) : [];
      if (Array.isArray(arr) && arr.length > 0) return arr.length;
    } catch { /* ignore malformed installment JSON */ }
    const indexes = row.installments
      .map(inst => installmentIndex(inst.slip_field))
      .filter((idx): idx is number => idx !== null);
    return indexes.length > 0 ? Math.max(...indexes) + 1 : 0;
  };
  const items: PendingItem[] = [];
  for (const r of data.rows) {
    const installmentCount = plannedInstallmentCount(r);
    for (const inst of r.installments) {
      if (!inst.confirmed_at && (inst.has_slip || inst.cheque_received_at || inst.payment_method === "cheque")) {
        const idx = installmentIndex(inst.slip_field);
        items.push({
          lead_id: r.lead_id,
          pre_doc_no: r.pre_doc_no,
          full_name: r.full_name,
          project_name: r.project_name,
          installment: inst,
          is_multi_installment: installmentCount > 1 && idx !== null,
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

  const isChequeWaitingReceive = (inst: Installment) => inst.payment_method === "cheque" && !inst.cheque_received_at;
  const isChequeWaitingMoney = (inst: Installment) => !!inst.cheque_received_at && !inst.confirmed_at;
  const isChequeOverdue = (inst: Installment) => !!inst.cheque_due_date
    && String(inst.cheque_due_date).slice(0, 10) < new Date().toISOString().slice(0, 10)
    && !inst.confirmed_at;
  const formatChequeDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const setOrderPaymentFocus = (leadId: number, slipField: string, opts?: { chequeConfirmPaymentId?: number; subStep?: number; openPaymentRow?: boolean; forceActiveStep?: number }) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`leadFocusStep_${leadId}`, "3");
    if (opts?.forceActiveStep !== undefined) {
      localStorage.setItem(`leadForceActiveStep_${leadId}`, String(opts.forceActiveStep));
    }
    localStorage.setItem(`orderSubStep_${leadId}`, String(opts?.subStep ?? 1));
    const m = /^order_installment_(\d+)$/.exec(slipField || "");
    if ((opts?.openPaymentRow ?? true) && m) localStorage.setItem(`orderPaymentRow_${leadId}`, m[1]);
    if (opts?.chequeConfirmPaymentId) {
      localStorage.setItem(`orderChequeConfirm_${leadId}`, String(opts.chequeConfirmPaymentId));
    }
  };

  const isInstallCollectPayment = (inst: Installment) => inst.slip_field === "order_after_slip" || inst.step_no === 99;

  const setInstallPaymentFocus = (leadId: number, paymentId: number) => {
    if (typeof window === "undefined") return;
    localStorage.setItem(`leadFocusStep_${leadId}`, "4");
    localStorage.setItem(`leadForceActiveStep_${leadId}`, "4");
    localStorage.setItem(`installSubStep_${leadId}`, "3");
    localStorage.setItem(`installChequeConfirm_${leadId}`, String(paymentId));
  };

  const openChequePaymentContext = (item: PendingItem, finalConfirmation: boolean) => {
    const inst = item.installment;
    if (isInstallCollectPayment(inst)) {
      setInstallPaymentFocus(item.lead_id, inst.id);
    } else if (finalConfirmation) {
      if (item.is_multi_installment) {
        setOrderPaymentFocus(item.lead_id, inst.slip_field, { subStep: 1, openPaymentRow: false, forceActiveStep: 3 });
      } else {
        setOrderPaymentFocus(item.lead_id, inst.slip_field, { chequeConfirmPaymentId: inst.id, subStep: 3, openPaymentRow: false });
      }
    } else {
      setOrderPaymentFocus(item.lead_id, inst.slip_field);
    }
    openLead(item.lead_id);
  };

  const markChequeReceived = async (item: PendingItem) => {
    const paymentId = item.installment.id;
    if (chequeReceivingId) return;
    setChequeReceivingId(paymentId);
    try {
      await apiFetch(`/api/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cheque_received: true }),
      });
      const stamp = new Date().toISOString();
      setData(prev => {
        if (!prev) return prev;
        let patched = false;
        const rows = prev.rows.map(row => ({
          ...row,
          installments: row.installments.map(inst => {
            if (inst.id !== paymentId) return inst;
            patched = true;
            return { ...inst, payment_method: "cheque", cheque_received_at: inst.cheque_received_at || stamp };
          }),
        }));
        if (patched) return { ...prev, rows };
        return {
          ...prev,
          rows: prev.rows.map(row => row.lead_id === item.lead_id
            ? {
                ...row,
                installments: [
                  ...row.installments,
                  { ...item.installment, payment_method: "cheque", cheque_received_at: item.installment.cheque_received_at || stamp },
                ],
              }
            : row),
        };
      });
      window.setTimeout(() => openChequePaymentContext(item, false), 150);
    } catch (e) {
      alert(e instanceof Error ? e.message : "ยืนยันรับเช็คไม่สำเร็จ");
    } finally {
      setChequeReceivingId(null);
    }
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
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เลขเอกสาร, โครงการ..." className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-300 p-12 text-center">
            <div className="text-sm text-gray-400">ไม่มีรายการรอยืนยัน</div>
          </div>
        ) : (
          <div className="space-y-2 md:space-y-0 md:bg-white md:rounded-xl md:border md:border-gray-300 md:divide-y md:divide-gray-100">
            {filtered.map(it => {
              const i = it.installment;
              const label = labelForInstallment(i.step_no, i.slip_field);
              const gallery = i.slip_urls.map((u, k) => ({ url: u, label: i.slip_urls.length > 1 ? `${label} · สลิป ${k + 1} / ${i.slip_urls.length}` : label }));
              const chequeWaitingReceive = isChequeWaitingReceive(i);
              const chequeWaitingMoney = isChequeWaitingMoney(i);
              const chequeButtonBusy = chequeReceivingId === i.id;
              const chequeFailed = i.cheque_status === "bounced" || i.cheque_status === "cancelled";
              const chequeOverdue = isChequeOverdue(i);
              const statusBadge = i.cheque_status === "bounced" ? (
                <span className="ml-1.5 inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">เช็คเด้ง</span>
              ) : i.cheque_status === "cancelled" ? (
                <span className="ml-1.5 inline-flex items-center rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">ยกเลิกเช็ค</span>
              ) : chequeOverdue ? (
                <span className="ml-1.5 inline-flex items-center rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">เลยวันที่หน้าเช็ค</span>
              ) : i.cheque_status === "deposited" ? (
                <span className="ml-1.5 inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">นำฝากแล้ว · รอเงินเข้า</span>
              ) : chequeWaitingReceive ? (
                <span className="ml-1.5 inline-flex items-center rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">รอรับเช็ค</span>
              ) : chequeWaitingMoney ? (
                <span className="ml-1.5 inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">รับเช็คแล้ว · รอรับเงิน</span>
              ) : null;
              const renderActionButton = (className = "") => chequeWaitingReceive ? (
                <button
                  type="button"
                  disabled={chequeButtonBusy}
                  onClick={() => markChequeReceived(it)}
                  className={`h-8 px-3 rounded-lg text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-300 hover:bg-orange-100 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center shrink-0 ${className}`}
                >
                  {chequeButtonBusy ? "กำลังรับเช็ค..." : "ยืนยันรับเช็ค"}
                </button>
              ) : chequeWaitingMoney ? (
                <button
                  type="button"
                  onClick={() => openChequePaymentContext(it, true)}
                  className={`h-8 px-3 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:brightness-110 inline-flex items-center justify-center shrink-0 ${className}`}
                >
                  ยืนยันรับเงิน
                </button>
              ) : (
                <LeadLink
                  id={it.lead_id}
                  className={`h-8 px-3 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:brightness-110 inline-flex items-center justify-center shrink-0 ${className}`}
                >
                  ยืนยันรับเงิน
                </LeadLink>
              );
              const chequeDetails = i.payment_method === "cheque" && (i.cheque_no || i.cheque_bank || i.cheque_due_date || i.cheque_status_note) ? (
                <div className={`text-[11px] mt-1 ${chequeFailed || chequeOverdue ? "text-red-600" : "text-gray-500"}`}>
                  {[i.cheque_no ? `เลขเช็ค ${i.cheque_no}` : null, i.cheque_bank, i.cheque_due_date ? `วันที่หน้าเช็ค ${formatChequeDate(i.cheque_due_date)}` : null].filter(Boolean).join(" · ")}
                  {i.cheque_status_note && <span> · {i.cheque_status_note}</span>}
                </div>
              ) : null;
              return (
                <div key={`${it.lead_id}-${i.id}`}>
                  {/* Mobile card */}
                  <div className="md:hidden bg-white rounded-xl border border-gray-300 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <LeadLink id={it.lead_id} className="block font-semibold text-gray-900 truncate">{it.full_name}</LeadLink>
                        <div className="text-[11px] text-gray-400 font-mono truncate">{it.pre_doc_no || `#${it.lead_id}`}{it.project_name ? ` · ${it.project_name}` : ""}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-bold font-mono tabular-nums text-amber-600 leading-none">{fmt(i.amount)}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">บาท</div>
                      </div>
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-gray-800">{label}</span>
                      {i.description && <span className="text-gray-500"> · {i.description}</span>}
                      {statusBadge}
                      {chequeDetails}
                    </div>
                    {i.slip_urls.length > 0 && (
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                        {i.slip_urls.slice(0, 4).map((url, idx) => (
                          <FallbackImage
                            key={url}
                            src={url}
                            alt=""
                            className="w-14 h-14 object-cover rounded border border-gray-200 shrink-0"
                            gallery={gallery}
                            galleryIndex={idx}
                          />
                        ))}
                        {i.slip_urls.length > 4 && (
                          <button type="button" onClick={() => openSlips(i)} className="w-14 h-14 rounded border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600 shrink-0">+{i.slip_urls.length - 4}</button>
                        )}
                      </div>
                    )}
                    {(i.ref1 || i.ref2) && (
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                        {i.ref1 && <div className="truncate"><span className="text-gray-400">Ref1: </span><span className="text-gray-800">{i.ref1}</span></div>}
                        {i.ref2 && <div className="truncate"><span className="text-gray-400">Ref2: </span><span className="text-gray-800">{i.ref2}</span></div>}
                      </div>
                    )}
                    <div className="grid">
                      {renderActionButton("w-full")}
                    </div>
                  </div>

                  {/* Desktop row */}
                  <div className="hidden md:flex items-center gap-4 p-4">
                    <div className="flex items-center gap-1 shrink-0">
                      {i.slip_urls.slice(0, 3).map((url, idx) => (
                        <FallbackImage
                          key={url}
                          src={url}
                          alt=""
                          className="w-12 h-12 object-cover rounded border border-gray-200"
                          gallery={gallery}
                          galleryIndex={idx}
                        />
                      ))}
                      {i.slip_urls.length > 3 && (
                        <button type="button" onClick={() => openSlips(i)} className="w-12 h-12 rounded border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">+{i.slip_urls.length - 3}</button>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <LeadLink id={it.lead_id} className="font-semibold text-gray-900 hover:text-primary">{it.full_name}</LeadLink>
                        <span className="text-xs font-mono text-gray-400">{it.pre_doc_no || `#${it.lead_id}`}</span>
                        {it.project_name && <span className="text-xs text-gray-500">· {it.project_name}</span>}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        <span className="font-semibold text-gray-700">{label}</span>
                        {i.description && <span> · {i.description}</span>}
                        {statusBadge}
                        {chequeDetails}
                      </div>
                    </div>
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
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold font-mono tabular-nums text-amber-600">{fmt(i.amount)}</div>
                      <div className="text-xs text-gray-400">บาท</div>
                    </div>
                    {renderActionButton()}
                  </div>
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
