"use client";

import Header from "@/components/layout/Header";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatTHB, formatThaiDate } from "@/lib/utils/formatters";
import { useDialog } from "@/components/ui/Dialog";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = {
  id: number;
  doc_no: string;
  option_no: number;
  status: string;
  package_name_snapshot: string;
  package_price_snapshot: number | null;
  /** ราคาปัจจุบันของแพ็กเกจ — ต่างจาก snapshot = ใบนี้ออกด้วยราคาคนละเดือน */
  current_package_price: number | null;
  contract_total_incl_vat: number;
  outstanding_amount: number;
  submitted_at: string;
  lead_id: number;
  customer_name: string;
  submitted_by_name: string | null;
  solar_approved_at: string | null;
  solar_approved_by_name: string | null;
};

type LeadGroup = {
  leadId: number;
  customerName: string;
  quotes: Row[];
};

export default function QuotationApprovalsPage() {
  const { activeRoles } = useActiveRoles();
  const dialog = useDialog();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [rejectQuote, setRejectQuote] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const approvalStage = hasRole(activeRoles, "admin")
    ? "all"
    : hasRole(activeRoles, "solar_sup")
      ? "solar_sup"
      : "sales_sup";
  const stageLabel =
    approvalStage === "solar_sup"
      ? "Solar Manager"
      : approvalStage === "sales_sup"
        ? "Sale Manager"
        : "ทุกขั้น";

  const load = useCallback(async () => {
    if (activeRoles.length === 0) return;
    try {
      setError("");
      const query = approvalStage === "all" ? "" : `?stage=${approvalStage}`;
      setRows(await apiFetch(`/api/quotation-approvals${query}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดรายการรออนุมัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [activeRoles.length, approvalStage]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      row.customer_name?.toLowerCase().includes(query) ||
      row.doc_no?.toLowerCase().includes(query) ||
      row.package_name_snapshot?.toLowerCase().includes(query) ||
      row.submitted_by_name?.toLowerCase().includes(query) ||
      row.solar_approved_by_name?.toLowerCase().includes(query) ||
      String(row.lead_id).includes(query),
    );
  }, [rows, search]);

  const groups = useMemo(() => {
    const grouped = new Map<number, LeadGroup>();
    for (const row of filteredRows) {
      const current = grouped.get(row.lead_id);
      if (current) {
        current.quotes.push(row);
      } else {
        grouped.set(row.lead_id, {
          leadId: row.lead_id,
          customerName: row.customer_name,
          quotes: [row],
        });
      }
    }
    return Array.from(grouped.values());
  }, [filteredRows]);

  const action = async (
    quote: Row,
    kind: "changes_required" | "approve",
    note = "",
  ) => {
    if (kind === "approve") {
      const ok = await dialog.confirm({
        title: "ยืนยันการอนุมัติ",
        variant: "success",
        confirmText: "อนุมัติ",
        message:
          quote.status === "pending_solar_sup"
            ? "ยืนยันว่า Solar Manager ตรวจเอกสารแล้ว และส่งต่อให้ Sale Manager อนุมัติขั้นสุดท้าย"
            : "ยืนยันว่าได้ตรวจและรับรองข้อมูล Survey, Package, ราคา เงื่อนไขชำระเงิน และเอกสารทั้ง 17 หน้าแล้ว",
      });
      if (!ok) return;
    }

    setBusy(quote.id);
    setError("");
    try {
      await apiFetch(`/api/quotations/${quote.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: kind,
          note,
          certify: kind === "approve",
        }),
      });
      if (kind === "changes_required") {
        setRejectQuote(null);
        setRejectReason("");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };

  const openRejectModal = (quote: Row) => {
    setError("");
    setRejectReason("");
    setRejectQuote(quote);
  };

  const closeRejectModal = () => {
    if (rejectQuote && busy === rejectQuote.id) return;
    setRejectQuote(null);
    setRejectReason("");
  };

  const confirmReject = () => {
    const reason = rejectReason.trim();
    if (!rejectQuote || !reason) return;
    void action(rejectQuote, "changes_required", reason);
  };

  // Direct navigation (not a blob) so the server's Content-Disposition —
  // "SSR-QT-26-0003_ชื่อลูกค้า.pdf" — survives into the viewer's Download
  // button. Opening in the click tick also dodges the popup blocker.
  const openPdf = (id: number) => {
    const uid =
      typeof window !== "undefined" ? window.localStorage.getItem("userId") : null;
    const url = `/api/quotation-pdf/${id}${uid ? `?user_id=${uid}` : ""}`;
    const tab = window.open(url, "_blank");
    if (tab) tab.opener = null;
    else window.location.href = url;
  };

  return (
    <div>
      <Header
        title="รออนุมัติใบเสนอราคา"
        subtitle={`คิวตรวจสอบสำหรับ ${stageLabel}`}
      />

      <main className="space-y-3 p-3 md:p-6">
        <div>
          <section className="rounded-xl border border-gray-300 bg-white p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Lead รอ {stageLabel} อนุมัติ
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold tabular-nums text-gray-900">
                {groups.length}
              </span>
              <span className="text-xs text-gray-400">
                {filteredRows.length} ใบเสนอราคา
              </span>
            </div>
          </section>
        </div>

        <div className="rounded-xl border border-gray-300 bg-white p-3">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ค้นหาชื่อลูกค้า, เลขที่ใบเสนอราคา, Package, ผู้ส่ง..."
            className="h-8 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none placeholder:text-gray-300 focus:border-primary"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-gray-200 border-t-primary" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-gray-300 bg-white p-12 text-center text-sm text-gray-400">
            {search.trim()
              ? "ไม่พบรายการที่ตรงกับคำค้นหา"
              : "ไม่มีใบเสนอราคาที่รออนุมัติ"}
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <article
                key={group.leadId}
                className="overflow-hidden rounded-xl border border-gray-300 bg-white"
              >
                <header className="border-b border-gray-200 bg-slate-50/80 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* focus=1 — เปิดหน้า lead ในโหมดโฟกัสขั้นตอนปัจจุบัน
                          (ผู้อนุมัติเข้ามาดูใบเสนอราคาโดยตรง ไม่ต้องเลื่อนหา) */}
                      <Link
                        href={`/leads/${group.leadId}?focus=1`}
                        className="font-semibold text-gray-900 hover:text-primary"
                      >
                        {group.customerName}
                      </Link>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xxs font-semibold text-primary">
                        Lead #{group.leadId}
                      </span>
                      <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xxs font-semibold text-violet-700">
                        {group.quotes.length} ฉบับ
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      ส่งโดย {Array.from(new Set(group.quotes.map((quote) => quote.submitted_by_name || "-"))).join(", ")}
                    </div>
                  </div>
                </header>

                <div className="divide-y divide-gray-100">
                  {group.quotes.map((quote) => {
                    const isBusy = busy === quote.id;
                    return (
                      <div
                        key={quote.id}
                        className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-gray-900">
                              {quote.doc_no}
                            </span>
                            <span className="rounded bg-gray-100 px-2 py-1 text-xxs font-semibold text-gray-600">
                              ชุด {quote.option_no}
                            </span>
                            <span className="rounded bg-cyan-50 px-2 py-1 text-xxs font-semibold text-cyan-700">
                              17 หน้า
                            </span>
                            <span className={`rounded px-2 py-1 text-xxs font-semibold ${quote.status === "pending_solar_sup" ? "bg-amber-50 text-amber-700" : "bg-violet-50 text-violet-700"}`}>
                              รอ {quote.status === "pending_solar_sup" ? "Solar Manager" : "Sale Manager"}
                            </span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-800">
                            {quote.package_name_snapshot}
                          </div>
                          <div className="mt-0.5 text-xxs text-gray-400">
                            ส่งขออนุมัติ {formatThaiDate(quote.submitted_at, { time: true, buddhist: true })}
                            {quote.status === "pending_sales_sup" && quote.solar_approved_by_name && (
                              <span className="ml-2 text-emerald-600">
                                · Solar Manager อนุมัติแล้วโดย {quote.solar_approved_by_name}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="min-w-32 sm:text-right">
                            {/* ยอดสุทธิหลังหักมัดจำ — ตรงกับ "รวมยอดที่ต้องชำระสุทธิ" ในใบเสนอราคา */}
                            <div className="font-mono text-lg font-bold tabular-nums text-gray-900">
                              {formatTHB(quote.outstanding_amount)} บาท
                            </div>
                            {Number(quote.contract_total_incl_vat) !== Number(quote.outstanding_amount) && (
                              <div className="text-xxs text-gray-400 mt-0.5">
                                ราคาเต็ม {formatTHB(quote.contract_total_incl_vat)} · หักมัดจำ {formatTHB(Number(quote.contract_total_incl_vat) - Number(quote.outstanding_amount))}
                              </div>
                            )}
                            {quote.package_price_snapshot != null && quote.current_package_price != null
                              && Number(quote.package_price_snapshot) !== Number(quote.current_package_price) && (
                              <div className="mt-0.5 text-xxs font-semibold text-red-600">
                                * ใบเสนอราคานี้ไม่ตรงกับราคาเดือนปัจจุบัน
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openPdf(quote.id)}
                              className="h-9 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              ดูใบเสนอราคา
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openRejectModal(quote)}
                              className="h-9 whitespace-nowrap rounded-lg bg-red-50 px-3 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              ส่งกลับ
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => action(quote, "approve")}
                              className="h-9 whitespace-nowrap rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {isBusy
                                ? "กำลังทำรายการ..."
                                : "อนุมัติ"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && groups.length > 0 && (
          <div className="text-center text-xs text-gray-400">
            แสดง {groups.length} Lead · {filteredRows.length} ใบเสนอราคา · เรียงเก่าสุดก่อน
          </div>
        )}
      </main>

      {rejectQuote && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
          onClick={closeRejectModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quotation-reject-title"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-xl"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="quotation-reject-title"
              className="text-base font-bold text-gray-900"
            >
              ส่งกลับใบเสนอราคา
            </h3>
            <p className="mt-1 text-xs text-gray-600">
              ใบเสนอราคา {rejectQuote.doc_no} จะถูกส่งกลับให้ Sale แก้ไขและส่งอนุมัติใหม่ กรุณาระบุเหตุผลให้ครบถ้วน
            </p>
            <label
              htmlFor="quotation-reject-reason"
              className="mt-4 mb-1 block text-xs font-semibold text-gray-700"
            >
              เหตุผล <span className="text-red-500">*</span>
            </label>
            <textarea
              id="quotation-reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
              placeholder="เช่น ราคาไม่ถูกต้อง / รายละเอียด Package ไม่ครบ / เงื่อนไขการชำระเงินไม่ชัดเจน"
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRejectModal}
                disabled={busy === rejectQuote.id}
                className="h-8 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={!rejectReason.trim() || busy === rejectQuote.id}
                className="h-8 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === rejectQuote.id ? "กำลังส่ง…" : "ยืนยันส่งกลับ"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
