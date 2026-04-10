"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import ActivityTimeline from "@/components/lead-detail/ActivityTimeline";
import AddActivityModal, { ActivityType } from "@/components/lead-detail/AddActivityModal";
import LostModal from "@/components/lead-detail/LostModal";
import { Activity } from "@/components/lead-detail/ActivityItem";
import { STATUS_CONFIG, PAYMENT_TYPES, FINANCE_STATUSES } from "@/lib/statuses";
// QR generated server-side

interface Lead {
  id: number; full_name: string; phone: string; project_name: string;
  package_name: string; package_price: number; house_number: string;
  customer_type: string; status: string; source: string; note: string;
  contact_date: string; next_follow_up: string | null;
  payment_method: string | null; payment_type: string | null;
  finance_status: string | null; requirement: string | null;
  assigned_staff: string | null; booking_id: number | null;
  booking_number: string | null; booking_price: number | null;
  slip_url: string | null; payment_confirmed: boolean; confirmed: boolean;
  lost_reason: string | null;
  revisit_date: string | null; created_at: string;
}

interface Package { id: number; name: string; kwp: number; phase: number; has_battery: boolean; battery_kwh: number; battery_brand: string; solar_panels: number; panel_watt: number; inverter_kw: number; inverter_brand: string; price: number; monthly_installment: string; monthly_saving: number; warranty_years: number; }

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const STEP_ORDER = ["registered", "booked", "survey", "quoted", "purchased", "installed"];

function stepIndex(status: string) {
  if (status === "visited") return 0; // visited = same as registered
  const idx = STEP_ORDER.indexOf(status);
  return idx >= 0 ? idx : 0;
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingAct, setLoadingAct] = useState(true);
  const [modalType, setModalType] = useState<ActivityType | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);
  const [tab, setTab] = useState<"info" | "log">("info");

  // Booking form state
  const [bookingPkg, setBookingPkg] = useState("");
  const [bookingPayment, setBookingPayment] = useState("");
  const [bookingSaving, setBookingSaving] = useState(false);
  const [bookingSaved, setBookingSaved] = useState(false);
  const [confirmingSaved, setConfirmingSaved] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrAmount, setQrAmount] = useState(0);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);
  const [confirmingSaving, setConfirmingSaving] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<"idle" | "verifying" | "verified" | "failed">("idle");

  const fetchLead = useCallback(() => {
    apiFetch(`/api/leads/${id}`).then(setLead).catch(console.error).finally(() => setLoadingLead(false));
  }, [id]);
  const fetchActivities = useCallback(() => {
    setLoadingAct(true);
    apiFetch(`/api/leads/${id}/activities`).then(setActivities).catch(console.error).finally(() => setLoadingAct(false));
  }, [id]);

  useEffect(() => {
    fetchLead();
    fetchActivities();
    apiFetch("/api/packages").then(setPackages).catch(console.error);
  }, [fetchLead, fetchActivities]);

  // Generate QR when transfer + package selected
  useEffect(() => {
    if (bookingPayment === "transfer" && bookingPkg) {
      const pkg = packages.find(p => p.id === parseInt(bookingPkg));
      if (pkg) {
        setQrAmount(pkg.price);
        apiFetch(`/api/qr?amount=${pkg.price}`).then((data: { qrDataUrl: string }) => {
          setQrDataUrl(data.qrDataUrl);
        }).catch(console.error);
      }
    } else {
      setQrDataUrl(null);
    }
  }, [bookingPayment, bookingPkg, packages]);

  const refresh = () => { fetchLead(); fetchActivities(); };

  const changeStatus = async (s: string) => {
    await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: s }) });
    refresh();
  };

  const saveBooking = async () => {
    if (!bookingPkg) return;
    setBookingSaving(true);
    try {
      const pkg = packages.find(p => p.id === parseInt(bookingPkg));
      // Update payment type on lead
      if (bookingPayment) {
        await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_type: bookingPayment }) });
      }
      // Create booking
      await apiFetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: parseInt(id), package_id: parseInt(bookingPkg), total_price: pkg?.price || 0 }),
      });
      // Move to booked then survey
      await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "survey" }) });
      refresh();
    } catch (err) { console.error(err); }
    finally { setBookingSaving(false); }
  };

  const markSurveyDone = async () => {
    await changeStatus("quoted");
  };

  const markQuoteSent = async () => {
    await changeStatus("purchased");
  };

  const markPaid = async () => {
    await changeStatus("installed");
  };

  const [uploadedSlipUrl, setUploadedSlipUrl] = useState<string | null>(null);

  const handleSlipCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bookingPkg) return;
    setSlipFile(file);
    setVerifyStatus("verifying");

    // Delete previous upload if exists
    if (uploadedSlipUrl) {
      fetch(`/api/upload?file=${encodeURIComponent(uploadedSlipUrl)}`, { method: "DELETE", headers: { "ngrok-skip-browser-warning": "true" } }).catch(() => {});
      setUploadedSlipUrl(null);
    }

    const reader = new FileReader();
    reader.onload = (ev) => setSlipPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // Upload slip
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "ngrok-skip-browser-warning": "true" }, body: formData });
      const { url } = await uploadRes.json();
      setUploadedSlipUrl(url);

      // TODO: Replace with SlipOK / OpenSlipVerify API for real verification
      // Mock verify — 1.5s delay
      await new Promise(r => setTimeout(r, 1500));

      setVerifyStatus("verified");
    } catch (err) {
      console.error(err);
      setVerifyStatus("failed");
    }
  };

  // Save booking as draft (not confirmed yet)
  const saveBookingDraft = async () => {
    if (!bookingPkg) return;
    setBookingSaving(true);
    try {
      const pkg = packages.find(p => p.id === parseInt(bookingPkg));
      if (bookingPayment) {
        await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_type: bookingPayment }) });
      }
      await apiFetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: parseInt(id), package_id: parseInt(bookingPkg), total_price: pkg?.price || 0 }),
      });
      // Status stays at booked (not confirmed yet)
      await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "booked" }) });
      setBookingSaved(true);
      refresh();
    } catch (err) { console.error(err); }
    finally { setBookingSaving(false); }
  };

  // Confirm booking (transfer: after slip verified, others: after save)
  const confirmBookingFinal = async () => {
    if (!lead?.booking_id) return;
    setConfirmingSaved(true);
    try {
      await apiFetch(`/api/bookings/${lead.booking_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, slip_url: uploadedSlipUrl, payment_confirmed: !!uploadedSlipUrl, status: uploadedSlipUrl ? "ชำระแล้ว" : "รอชำระ" }),
      });
      await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "survey" }) });
      refresh();
    } catch (err) { console.error(err); }
    finally { setConfirmingSaved(false); }
  };

  // Transfer: slip verified → save + confirm in one go
  const confirmBookingWithSlip = async () => {
    if (!bookingPkg || !uploadedSlipUrl) return;
    setBookingSaving(true);
    try {
      const pkg = packages.find(p => p.id === parseInt(bookingPkg));
      if (bookingPayment) {
        await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_type: bookingPayment }) });
      }
      const bookingRes = await apiFetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: parseInt(id), package_id: parseInt(bookingPkg), total_price: pkg?.price || 0 }),
      });
      await apiFetch(`/api/bookings/${bookingRes.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slip_url: uploadedSlipUrl, payment_confirmed: true, confirmed: true, status: "ชำระแล้ว" }),
      });
      await apiFetch(`/api/leads/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "survey" }) });
      refresh();
    } catch (err) { console.error(err); }
    finally { setBookingSaving(false); }
  };

  const confirmPayment = async () => {
    if (!lead?.booking_id || !slipFile) return;
    setConfirmingSaving(true);
    try {
      // Upload slip
      const formData = new FormData();
      formData.append("file", slipFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "ngrok-skip-browser-warning": "true" }, body: formData });
      const { url } = await uploadRes.json();

      // Confirm payment
      await apiFetch(`/api/bookings/${lead.booking_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slip_url: url, payment_confirmed: true, status: "ชำระแล้ว" }),
      });
      refresh();
    } catch (err) { console.error(err); }
    finally { setConfirmingSaving(false); }
  };

  if (loadingLead) return <div className="flex items-center justify-center h-full py-20"><div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" /></div>;
  if (!lead) return <div className="text-center py-12 text-gray">Not found</div>;

  const isLost = lead.status === "lost";
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  const hasBooking = !!lead.booking_number;
  const paymentLabel = PAYMENT_TYPES.find(p => p.value === lead.payment_type)?.label;
  const financeConfig = FINANCE_STATUSES.find(f => f.value === lead.finance_status);
  const currentStep = stepIndex(lead.status);

  const cardState = (stepIdx: number) => {
    if (isLost) return stepIdx === 0 ? "done" : "locked";
    // Customer card always done once lead exists
    if (stepIdx === 0) return "done";
    // Booking card active from the start (step 0 or 1)
    if (stepIdx === 1 && currentStep <= 1) return hasBooking ? "done" : "active";
    if (stepIdx < currentStep) return "done";
    if (stepIdx === currentStep) return "active";
    return "locked";
  };

  const CardWrapper = ({ stepIdx, title, icon, children }: { stepIdx: number; title: string; icon: string; children: React.ReactNode }) => {
    const state = cardState(stepIdx);
    const cfg = STATUS_CONFIG[STEP_ORDER[stepIdx]] || STATUS_CONFIG.registered;
    return (
      <div className={`rounded-2xl border overflow-hidden transition-all ${
        state === "active" ? `${cfg.bg} border-2` : state === "done" ? "bg-white border-gray-200" : "bg-gray-50/50 border-gray-100 opacity-40 pointer-events-none"
      }`} style={state === "active" ? { borderColor: "var(--primary)" } : {}}>
        <div className="px-4 py-3 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${state === "done" ? "bg-green-500" : state === "active" ? cfg.color : "bg-gray-300"}`}>
            {state === "done" ? (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
            )}
          </div>
          <div className="flex-1">
            <div className={`text-sm font-bold ${state === "active" ? cfg.text : state === "done" ? "text-green-700" : "text-gray"}`}>{title}</div>
          </div>
          {state === "active" && <span className={`text-[10px] font-bold text-white px-2 py-0.5 rounded-full ${cfg.color}`}>Current</span>}
        </div>
        {state !== "locked" && <div className="px-4 pb-4 border-t border-gray-100 pt-3">{children}</div>}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 safe-top">
        <div className="px-4 py-3 flex items-center gap-3">
          <Link href="/today" className="p-1 text-gray">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{lead.full_name}</div>
            <div className="text-xs text-gray flex items-center gap-2">
              {lead.phone}
              <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px] font-medium">{lead.source === "event" ? "Event" : "Walk-in"}</span>
              {isUpgrade && <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded text-[10px] font-medium">Upgrade</span>}
            </div>
          </div>
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
            </a>
          )}
        </div>
        <div className="flex">
          <button onClick={() => setTab("info")} className={`flex-1 py-2.5 text-sm font-semibold border-b-2 ${tab === "info" ? "text-primary border-primary" : "text-gray border-transparent"}`}>Info</button>
          <button onClick={() => setTab("log")} className={`flex-1 py-2.5 text-sm font-semibold border-b-2 ${tab === "log" ? "text-primary border-primary" : "text-gray border-transparent"}`}>Activity Log ({activities.length})</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {tab === "info" ? (
          <div className="p-4 space-y-3">

            {/* Step 1: Customer (register/visited) */}
            <CardWrapper stepIdx={0} title="Customer" icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z">
              <div className="space-y-1.5 text-sm">
                {lead.project_name && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Project</span><span>{lead.project_name}</span></div>}
                {lead.house_number && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">House</span><span>{lead.house_number}</span></div>}
                <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Type</span><span>{isUpgrade ? "Upgrade" : "New Customer"}</span></div>
                {lead.requirement && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Need</span><span>{lead.requirement}</span></div>}
                {lead.note && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Note</span><span className="text-gray/70 italic">{lead.note}</span></div>}
                {lead.contact_date && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Contact</span><span>{formatDate(lead.contact_date)}</span></div>}
              </div>
            </CardWrapper>

            {/* Step 2: Booking */}
            <CardWrapper stepIdx={1} title="Booking" icon="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z">
              {hasBooking ? (
                <div className="space-y-3">
                  {/* Booking details */}
                  <div className="space-y-1.5 text-sm">
                    <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Booking</span><span className="font-bold">{lead.booking_number}</span></div>
                    <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Customer</span><span>{lead.full_name}</span></div>
                    {lead.phone && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Phone</span><span>{lead.phone}</span></div>}
                    {lead.project_name && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Project</span><span>{lead.project_name}</span></div>}
                    {lead.house_number && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">House</span><span>{lead.house_number}</span></div>}
                    <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Package</span><span className="font-semibold text-primary">{lead.package_name}</span></div>
                    <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Amount</span><span className="font-bold">{formatPrice(lead.booking_price || 0)} THB</span></div>
                    {paymentLabel && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Payment</span><span>{paymentLabel}</span></div>}
                    {financeConfig && <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Finance</span><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${financeConfig.color}`}>{financeConfig.label}</span></div>}
                    <div className="flex gap-2"><span className="text-gray text-xs w-16 shrink-0">Status</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${lead.confirmed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {lead.confirmed ? "Confirmed" : "Pending"}
                      </span>
                    </div>
                  </div>

                  {/* Slip preview */}
                  {lead.slip_url && (
                    <div>
                      <div className="text-xs text-gray mb-1">Payment Slip</div>
                      <img src={lead.slip_url} alt="Payment slip" className="w-full max-w-[200px] rounded-lg border border-gray-200" />
                    </div>
                  )}

                  {/* Download receipt */}
                  {lead.confirmed && (
                    <a href={`/api/receipt?booking_id=${lead.booking_id}`} target="_blank"
                      className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-primary text-white active:bg-primary-dark">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download Receipt (PDF)
                    </a>
                  )}

                  {/* Confirm button if not confirmed yet */}
                  {!lead.confirmed && (
                    <button onClick={confirmBookingFinal} disabled={confirmingSaved}
                      className="w-full py-3 rounded-xl text-sm font-bold text-white bg-green-500 active:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {confirmingSaved ? "Confirming..." : "Confirm Booking"}
                    </button>
                  )}
                </div>
              ) : cardState(1) === "active" ? (
                <div className="space-y-3">
                  <label className="text-xs font-semibold text-gray block">Select Package *</label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {packages.map(p => {
                      const selected = bookingPkg === String(p.id);
                      return (
                        <button key={p.id} onClick={() => setBookingPkg(String(p.id))}
                          className={`text-left rounded-xl p-3 border-2 transition-all ${selected ? "border-primary bg-primary/5" : "border-gray-100 bg-white"}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className={`text-sm font-bold ${selected ? "text-primary" : ""}`}>{p.name}</div>
                              <div className="text-xs text-gray mt-0.5 flex flex-wrap gap-x-3">
                                {p.solar_panels && <span>{p.solar_panels} panels</span>}
                                {p.inverter_brand && <span>{p.inverter_brand} {p.inverter_kw}kW</span>}
                                {p.has_battery && <span>Battery {p.battery_kwh}kWh</span>}
                                <span>{p.warranty_years}yr warranty</span>
                              </div>
                              {p.monthly_saving > 0 && <div className="text-xs text-green-600 mt-0.5">Save ~{formatPrice(p.monthly_saving)}/mo</div>}
                            </div>
                            <div className="text-right shrink-0 ml-3">
                              <div className={`text-lg font-bold ${selected ? "text-primary" : ""}`}>{formatPrice(p.price)}</div>
                              <div className="text-[10px] text-gray">THB</div>
                              {p.monthly_installment && <div className="text-[10px] text-gray">{p.monthly_installment}/mo</div>}
                            </div>
                          </div>
                          {selected && (
                            <div className="mt-2 pt-2 border-t border-primary/10 flex items-center gap-1">
                              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              <span className="text-xs text-primary font-semibold">Selected</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {bookingPkg && (<>
                  <div>
                    <label className="text-xs font-semibold text-gray mb-2 block">Payment Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "transfer", label: "Transfer", icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z", desc: "Bank transfer / PromptPay" },
                        { value: "credit_card", label: "Credit Card", icon: "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z", desc: "Visa / Mastercard" },
                        { value: "green_loan", label: "Green Loan", icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418", desc: "Green finance program" },
                        { value: "home_equity", label: "Home Equity", icon: "M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25", desc: "Home equity loan" },
                      ].map(p => (
                        <button key={p.value} onClick={() => setBookingPayment(p.value)}
                          className={`text-left rounded-xl p-3 border-2 transition-all ${bookingPayment === p.value ? "border-primary bg-primary/5" : "border-gray-100 bg-white"}`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bookingPayment === p.value ? "bg-primary" : "bg-gray-100"}`}>
                              <svg className={`w-4 h-4 ${bookingPayment === p.value ? "text-white" : "text-gray"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={p.icon} />
                              </svg>
                            </div>
                            <div>
                              <div className={`text-xs font-bold ${bookingPayment === p.value ? "text-primary" : ""}`}>{p.label}</div>
                              <div className="text-[10px] text-gray">{p.desc}</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Thai QR Payment */}
                  {qrDataUrl && bookingPayment === "transfer" && (
                    <div className="max-w-[280px] mx-auto">
                      <div className="relative">
                        {/* Template background */}
                        <img src="/templates/thaiqr.png" alt="Thai QR Payment" className="w-full" />
                        {/* QR code overlay — positioned over the blank area */}
                        <img src={qrDataUrl} alt="PromptPay QR"
                          className="absolute"
                          style={{ top: "115px", left: "30px", width: "calc(100% - 60px)" }} />
                      </div>
                      {/* Amount below */}
                      <div className="bg-white rounded-b-xl border border-t-0 border-gray-200 px-4 py-3 text-center">
                        <div className="text-xs text-gray">Amount</div>
                        <div className="text-2xl font-bold">{formatPrice(qrAmount)} <span className="text-sm text-gray">THB</span></div>
                        <div className="text-[10px] text-gray mt-1">PromptPay: 085-909-9890</div>
                      </div>
                    </div>
                  )}
                  </>)}

                  {/* Confirm Payment */}
                  <input type="file" accept="image/*" onChange={handleSlipCapture} className="hidden" id="booking-slip" />

                  {slipPreview && (
                    <div className="relative rounded-xl overflow-hidden border border-gray-200 max-w-[280px] mx-auto">
                      <img src={slipPreview} alt="Slip" className="w-full" />
                      <button onClick={() => { setSlipPreview(null); setSlipFile(null); }}
                        className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm">✕</button>
                    </div>
                  )}

                  {/* Transfer flow: Verify Slip → Confirm Booking */}
                  {bookingPayment === "transfer" && (
                    <>
                      {verifyStatus === "idle" && bookingPkg && (
                        <label htmlFor="booking-slip"
                          className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer bg-indigo-500 text-white active:bg-indigo-600">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                          </svg>
                          Verify Slip
                        </label>
                      )}
                      {verifyStatus === "verifying" && (
                        <div className="w-full py-3 rounded-xl text-sm font-bold text-white bg-amber-500 flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Verifying Slip...
                        </div>
                      )}
                      {verifyStatus === "verified" && (
                        <div className="space-y-2">
                          <div className="w-full py-2 rounded-xl text-xs font-bold text-green-700 bg-green-100 flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Slip Verified
                          </div>
                          <button onClick={confirmBookingWithSlip} disabled={bookingSaving}
                            className="w-full py-3 rounded-xl text-sm font-bold text-white bg-green-500 active:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {bookingSaving ? "Saving..." : "Confirm Booking"}
                          </button>
                        </div>
                      )}
                      {verifyStatus === "failed" && (
                        <div className="space-y-2">
                          <div className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 flex items-center justify-center gap-2">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Verification Failed
                          </div>
                          <button onClick={() => { setVerifyStatus("idle"); setSlipPreview(null); setSlipFile(null); }}
                            className="w-full py-2 rounded-xl text-xs text-gray border border-gray-200">Try Again</button>
                        </div>
                      )}
                    </>
                  )}

                  {/* Non-transfer flow: Save Booking (draft) → Confirm Booking */}
                  {bookingPayment && bookingPayment !== "transfer" && bookingPkg && (
                    !bookingSaved ? (
                      <button onClick={saveBookingDraft} disabled={bookingSaving}
                        className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-indigo-500 text-white active:bg-indigo-600 disabled:opacity-50">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                        </svg>
                        {bookingSaving ? "Saving..." : "Save Booking"}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <div className="w-full py-2 rounded-xl text-xs font-bold text-blue-700 bg-blue-100 flex items-center justify-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                          </svg>
                          Booking Saved
                        </div>
                        <button onClick={confirmBookingFinal} disabled={confirmingSaved}
                          className="w-full py-3 rounded-xl text-sm font-bold text-white bg-green-500 active:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {confirmingSaved ? "Confirming..." : "Confirm Booking"}
                        </button>
                      </div>
                    )
                  )}
                </div>
              ) : null}
            </CardWrapper>

            {/* Step 3: Survey */}
            <CardWrapper stepIdx={2} title="Survey" icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z">
              {cardState(2) === "done" ? (
                <div className="text-sm text-green-700">Site survey completed</div>
              ) : cardState(2) === "active" ? (
                <div className="space-y-3">
                  <div className="text-sm text-gray">Schedule and complete site survey</div>
                  {lead.next_follow_up && <div className="text-sm"><span className="text-gray text-xs">Scheduled:</span> <span className="font-semibold text-amber-600">{formatDate(lead.next_follow_up)}</span></div>}
                  <div className="flex gap-2">
                    <button onClick={() => setModalType("follow_up")} className="flex-1 py-2.5 rounded-lg text-xs font-semibold bg-violet-50 text-violet-700">Schedule Date</button>
                    <button onClick={markSurveyDone} className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white bg-violet-500">Survey Done</button>
                  </div>
                </div>
              ) : null}
            </CardWrapper>

            {/* Step 4: Quotation */}
            <CardWrapper stepIdx={3} title="Quotation" icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
              {cardState(3) === "done" ? (
                <div className="text-sm">
                  <span className="text-green-700">Quotation sent</span>
                  {lead.package_name && <span className="text-gray"> — {lead.package_name} ({formatPrice(lead.package_price)} THB)</span>}
                </div>
              ) : cardState(3) === "active" ? (
                <div className="space-y-3">
                  <div className="text-sm text-gray">Send quotation and wait for customer decision</div>
                  <div className="flex gap-2">
                    <Link href="/packages" className="flex-1 py-2.5 rounded-lg text-xs font-semibold border border-gray-200 text-center">Show Packages</Link>
                    <button onClick={markQuoteSent} className="flex-1 py-2.5 rounded-lg text-xs font-bold text-white bg-orange-500">Customer Accepted</button>
                  </div>
                </div>
              ) : null}
            </CardWrapper>

            {/* Step 5: Purchased */}
            <CardWrapper stepIdx={4} title="Purchased" icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z">
              {cardState(4) === "done" ? (
                <div className="space-y-2">
                  <div className="text-sm text-green-700 font-semibold">Payment confirmed</div>
                  {paymentLabel && <div className="text-xs text-gray">Method: {paymentLabel}</div>}
                  {lead.slip_url && <img src={lead.slip_url} alt="Payment slip" className="w-full max-w-xs rounded-lg border border-gray-200" />}
                </div>
              ) : cardState(4) === "active" ? (
                <div className="space-y-3">
                  <div className="text-sm text-gray">Upload payment slip to confirm</div>
                  {paymentLabel && <div className="text-sm"><span className="text-gray text-xs">Method:</span> <span className="font-semibold">{paymentLabel}</span></div>}

                  {/* Camera capture for slip */}
                  <input type="file" accept="image/*" capture="environment" onChange={handleSlipCapture} className="hidden" id="slip-camera" />

                  {!slipPreview ? (
                    <label htmlFor="slip-camera"
                      className="flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 cursor-pointer active:bg-gray-100">
                      <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                        </svg>
                      </div>
                      <span className="text-sm font-medium text-green-700">Take photo of payment slip</span>
                      <span className="text-xs text-gray">Tap to open camera</span>
                    </label>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative rounded-xl overflow-hidden border border-gray-200">
                        <img src={slipPreview} alt="Slip preview" className="w-full" />
                        <button onClick={() => { setSlipPreview(null); setSlipFile(null); }}
                          className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full text-white flex items-center justify-center text-sm">✕</button>
                      </div>
                      <button onClick={confirmPayment} disabled={confirmingSaving}
                        className="w-full py-3 rounded-xl text-sm font-bold text-white bg-green-500 disabled:opacity-50">
                        {confirmingSaving ? "Verifying..." : "Confirm Payment"}
                      </button>
                      <label htmlFor="slip-camera" className="block w-full py-2 rounded-xl text-xs text-center text-gray border border-gray-200 cursor-pointer">
                        Retake photo
                      </label>
                    </div>
                  )}
                </div>
              ) : null}
            </CardWrapper>

            {/* Step 6: Installed */}
            <CardWrapper stepIdx={5} title="Installed" icon="M11.42 15.17l-5.658-5.66a2.122 2.122 0 010-3l1.532-1.532a2.122 2.122 0 013 0L15.953 10.637a2.122 2.122 0 010 3l-1.532 1.532a2.122 2.122 0 01-3 0z">
              {cardState(5) === "done" ? (
                <div className="text-sm text-green-700 font-semibold">Installation completed!</div>
              ) : cardState(5) === "active" ? (
                <div className="text-sm text-emerald-700 font-semibold">Installation completed!</div>
              ) : null}
            </CardWrapper>

            {/* Lost */}
            {isLost && (
              <div className="rounded-2xl border-2 border-red-200 bg-red-50 overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-400">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-red-700">Lost</div>
                    {lead.lost_reason && <div className="text-xs text-red-600">{lead.lost_reason}</div>}
                  </div>
                </div>
                <div className="px-4 pb-4 border-t border-red-100 pt-3">
                  {lead.revisit_date && <div className="text-sm mb-2">Revisit: <span className="font-semibold text-blue-600">{formatDate(lead.revisit_date)}</span></div>}
                  <button onClick={() => setModalType("follow_up")} className="w-full py-2.5 rounded-lg text-xs font-bold text-white bg-blue-500">Set Revisit Date</button>
                </div>
              </div>
            )}

            {!isLost && lead.status !== "installed" && (
              <button onClick={() => setShowLostModal(true)} className="w-full py-3 rounded-xl text-sm text-red-400 border border-red-200 bg-white">Mark as Lost</button>
            )}
          </div>
        ) : (
          <ActivityTimeline activities={activities} loading={loadingAct} />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-100 z-40 px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setModalType("note")} className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-gray-light text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" /></svg>
            Note
          </button>
          <button onClick={() => setModalType("call")} className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
            Call
          </button>
          <button onClick={() => setModalType("visit")} className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-violet-50 text-violet-700 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
            Visit
          </button>
          <button onClick={() => setModalType("follow_up")} className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Follow
          </button>
        </div>
      </div>

      {modalType && <AddActivityModal activityType={modalType} leadId={lead.id} onClose={() => setModalType(null)} onSaved={refresh} />}
      {showLostModal && <LostModal leadId={lead.id} onClose={() => setShowLostModal(false)} onSaved={refresh} />}
    </div>
  );
}
