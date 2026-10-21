"use client";

// ภาพรวม O&M (เฟส 6 ของแผน 20260922-01)
// ★ ผู้ใช้เคาะ 24 ก.ย. 69: งาน O&M อยู่ในโมดูล O&M ก่อน ยังไม่ขึ้นการ์ดอื่น
//   ⇒ ทำเป็นเมนู "ภาพรวม" ในโมดูลนี้ ไม่ใช่แท็บใน /dashboard ของฝั่งขาย
// ★ เปลือกการ์ด KPI/ชิป ยกจาก /dashboard ทั้งก้อน (กติกา ui-rules) เปลี่ยนแค่เนื้อใน
// ★ 15 ต.ค. 69 (แผน 20261015-02) ผู้ใช้สั่งทำแบบ Dashboard I:
//   - กดตัวเลขแล้วเปิดหน้าต่างรายชื่อ + Excel (เดิมเป็นลิงก์ไปหน้างานบริการ) · ไม่มีลิงก์ "เปิดในลิสต์" ในหน้าต่าง (ผู้ใช้สั่งเอาออก 15 ต.ค. 69)
//   - การ์ดมูลค่างาน O&M แถวบนขวา (role ที่เห็นเงิน = OM_MONEY_ROLES · ชุดรายรับ O&M + sales · ไม่มี solar)
//   - ตัวกรองช่วงวันที่ + PDF — ช่วงวันที่มีผลกับการ์ดมูลค่างาน + กราฟงานล้าง · ที่เหลือเป็นสถานะ ณ วันนี้

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useDialog } from "@/components/ui/Dialog";
import { DownloadIcon } from "@/components/ui/icons";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { getWithTtl, setWithTtl, TWO_HOURS_MS } from "@/lib/storage-ttl";
import { formatTHB } from "@/lib/utils/formatters";
import { BUCKET_LABEL, TABS, TONE_SOFT } from "@/lib/om/service-view";
import OmDashBucketModal, { type BucketSpec } from "@/components/om/OmDashBucketModal";

type Data = {
  range: { from: string; to: string; today: string };
  value: null | { count: number; total: number; received: number; received_count: number; outstanding: number; outstanding_count: number };
  unread: number;
  buckets: Record<string, number>;
  jobs_total: number;
  houses: { total: number; due: number; never_washed: number; not_due: number };
  quota: { granted: number; used: number; left: number };
  projects: { project_id: string | null; project_name: string | null; total: number; follow: number }[];
  months: { ym: string; n: number }[];
};

const n = (v: number) => v.toLocaleString("th-TH");
const fmtBaht = (v: number) => `฿${formatTHB(Math.round(v))}`;
/** DD/MM/พ.ศ. แบบแถบ FILTER ของ Dashboard I */
const fmtThai = (s: string) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${parseInt(y) + 543}`;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** ช่วงเริ่มต้น = 12 เดือนล่าสุด (1 ของเดือนที่ 11 ก่อนหน้า → วันนี้) — กราฟงานล้างหน้าตาเหมือนก่อนมีตัวกรอง (API ใช้สูตรเดียวกัน) */
const defaultRange = () => {
  const t = new Date();
  return { from: ymd(new Date(t.getFullYear(), t.getMonth() - 11, 1)), to: ymd(t) };
};
const STUCK = ["unreachable", "declined", "noquota"];

/** ป้ายใต้แท่ง — ใส่ปีเฉพาะแท่งแรกกับ ม.ค. และไม่ใส่เลยบนมือถือ (12 แท่งใส่ปีทุกแท่งแล้วล้นช่อง) */
function MonthLabel({ ym, withYear }: { ym: string; withYear: boolean }) {
  const [y, m] = ym.split("-").map(Number);
  const mon = new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
  return <>{mon}{withYear && <span className="max-sm:hidden"> {String((y + 543) % 100).padStart(2, "0")}</span>}</>;
}

/** ชิปตัวเลข — เปลือกเดียวกับ Chip ของ /dashboard · กดแล้วเปิดหน้าต่างรายชื่อ (ไม่ใส่ onOpen = ไม่มีรายชื่อให้ดู) */
function Chip({ n: num, l, tone, detail, onOpen }: { n: number | string; l: React.ReactNode; tone: string; detail?: string; onOpen?: () => void }) {
  const body = (
    <>
      <div className="text-xl font-bold font-mono tabular-nums leading-none">{num}</div>
      {/* ป้ายยาวขึ้น 2 บรรทัดได้ (ชิปรวมแท็บ ติดต่อไม่ได้ · ปฏิเสธ · สิทธิ์หมด) */}
      <div className="text-xxs mt-2 leading-tight line-clamp-2 opacity-75">{l}</div>
      {/* รายละเอียดอยู่ใต้ป้าย — ป้ายต้องติดกับเลขที่มันอธิบาย */}
      {detail && <div className="text-xxs font-mono tabular-nums opacity-60 leading-tight truncate">{detail}</div>}
    </>
  );
  // flex-col + justify-start = เนื้อชิดบน — ปุ่ม (button) จัดเนื้อกลางแนวตั้งเอง ชิปที่สูงไม่เท่ากันเลขเลยไม่ตรงแนว
  //   (15 ต.ค. 69 เจอตอนเปลี่ยนชิปจากลิงก์เป็นปุ่ม: 1,692 กับ 136 ในการ์ดเดียวกันเลขห่างกัน 10px)
  const cls = `flex flex-col justify-start w-full rounded-lg px-2 py-3 text-center min-w-0 ${tone}`;
  return onOpen
    ? <button type="button" onClick={onOpen} title="ดูรายชื่อ" className={`${cls} cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

/** ตัวเลขใหญ่บนการ์ด — กดแล้วเปิดรายชื่อ (แบบ bigNumCls ของ Dashboard I) */
function BigNum({ children, onOpen, className = "text-gray-900" }: { children: React.ReactNode; onOpen: () => void; className?: string }) {
  return (
    <button type="button" onClick={onOpen} title="ดูรายชื่อ"
      className={`self-start text-3xl font-bold font-mono tabular-nums leading-none cursor-pointer hover:underline decoration-2 underline-offset-4 ${className}`}>
      {children}
    </button>
  );
}

export default function OmDashboardPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const dialog = useDialog();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [bucket, setBucket] = useState<BucketSpec | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // ช่วงวันที่ — แบบ Dashboard I: URL (?from&to · ตัวสร้าง PDF ส่งมา) > localStorage (2 ชม.) > ค่าเริ่มต้น
  const def = useMemo(defaultRange, []);
  const urlFilter = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return { from: p.get("from"), to: p.get("to") };
  }, []);
  const [dateFrom, setDateFrom] = useState<string>(() =>
    urlFilter?.from || getWithTtl<string>("om.dashboard.dateFrom", TWO_HOURS_MS) || def.from);
  const [dateTo, setDateTo] = useState<string>(() =>
    urlFilter?.to || getWithTtl<string>("om.dashboard.dateTo", TWO_HOURS_MS) || def.to);
  useEffect(() => { setWithTtl("om.dashboard.dateFrom", dateFrom); }, [dateFrom]);
  useEffect(() => { setWithTtl("om.dashboard.dateTo", dateTo); }, [dateTo]);
  const rangeQs = useMemo(() => {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set("from", dateFrom);
    if (dateTo) qs.set("to", dateTo);
    return qs.toString();
  }, [dateFrom, dateTo]);

  useEffect(() => {
    apiFetch(`/api/om/dashboard?${rangeQs}`)
      .then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [rangeQs]);

  // ช่วงที่ server ใช้จริง (เกิน 24 เดือนถูกตัด) — แถบ FILTER / ป้ายการ์ดอ่านจากตรงนี้ ไม่ใช่จากช่องกรอก
  const from = d?.range.from ?? dateFrom, to = d?.range.to ?? dateTo;
  const periodLabel = `${fmtThai(from)} – ${fmtThai(to)}`;
  const open = (spec: BucketSpec) => () => setBucket(spec);
  const tabSpec = (title: string, keys: string[], group?: string): BucketSpec => ({
    title, kind: "tab", params: { k: keys.join(","), ...(group !== undefined ? { group } : {}) },
  });

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      // ส่งช่วงวันที่ไปด้วย ให้ PDF ตรงกับที่เห็นบนจอ (route เดียวกับ Dashboard I · whitelist path)
      const qs = new URLSearchParams(rangeQs);
      qs.set("path", "/om/dashboard");
      const res = await fetch(`/api/report/dashboard-pdf?${qs.toString()}`, { headers: { ...getUserIdHeader() } });
      if (!res.ok) { dialog.alert({ title: "โหลดไม่สำเร็จ", message: "ดาวน์โหลด PDF ไม่สำเร็จ", variant: "danger" }); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `om_dashboard_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  };

  const peak = Math.max(1, ...(d?.months ?? []).map((m) => m.n));
  const nowYm = (d?.range.today ?? "").slice(0, 7);

  return (
    <div>
      <div className="dashboard-pdf-skip">
        <Header title={activeItem?.label ?? "Dashboard"} subtitle="O&M · บ้านในความดูแล · สิทธิ์ · งานบริการ"
          rightContent={
            <div className="flex items-center gap-2">
              {/* ช่วงวันที่ — ช่องเดียวกับ Dashboard I (ไม่มีโหมด สร้างลีด/กิจกรรม: ตัวเลข O&M ใช้วันที่ของมันเอง) */}
              <div className="hidden md:flex items-center gap-1 text-xs text-gray-500">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300"
                  title="ช่วงวันที่ (จาก)" />
                <span className="text-gray-400">–</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300"
                  title="ช่วงวันที่ (ถึง)" />
                {(dateFrom !== def.from || dateTo !== def.to) && (
                  <button type="button" onClick={() => { setDateFrom(def.from); setDateTo(def.to); }}
                    className="ml-1 h-8 px-2 rounded-lg text-xs text-gray-500 hover:text-gray-700" title="รีเซ็ตเป็น 12 เดือนล่าสุด">
                    รีเซ็ต
                  </button>
                )}
              </div>
              <button type="button" disabled={pdfLoading} onClick={downloadPdf}
                className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60 disabled:cursor-wait transition-colors"
                title="ดาวน์โหลด Dashboard O&M เป็น PDF" aria-label="ดาวน์โหลด Dashboard O&M เป็น PDF">
                {pdfLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    <span>กำลังสร้าง...</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                    <span>PDF</span>
                  </>
                )}
              </button>
            </div>
          } />
      </div>

      <OmDashBucketModal spec={bucket} onClose={() => setBucket(null)} />

      {/* เต็มความกว้างแบบ /dashboard — เดิมจำกัด 1600px ชิดซ้าย จอกว้างเหลือที่ว่างฝั่งขวา
          dashboard-pdf-content = ส่วนที่ตัวสร้าง PDF ถ่ายภาพ (ตัว Header อยู่ใน dashboard-pdf-skip) */}
      <main className="dashboard-pdf-content p-3 md:p-4 space-y-3">
        {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {!d ? <Loading /> : (
          <>
            {/* แถบ FILTER แบบ Dashboard I — บอกด้วยว่าช่วงวันที่มีผลกับอะไร (ตัวเลขส่วนใหญ่ของหน้านี้เป็นสถานะ ณ วันนี้) */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-500 uppercase tracking-wider">Filter</span>
              <span className="font-mono tabular-nums">{periodLabel}</span>
              <span className="text-gray-400">·</span>
              <span>มีผลกับ{d.value ? "มูลค่างาน O&M และ" : ""}กราฟงานล้าง</span>
              <span className="text-gray-400">· ตัวเลขอื่นเป็นสถานะ ณ วันนี้</span>
            </div>

            {/* แจ้งเตือนของ O&M เอง — กระดิ่งกลางบน Header เป็นของฝั่งขาย ไม่ยุ่งกัน (ข้อ 4.1) */}
            {d.unread > 0 && (
              <Link href="/om/notifications"
                className="dashboard-pdf-skip flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 hover:bg-amber-100">
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{d.unread}</span>
                <span className="flex-1 text-sm font-semibold text-amber-900">มีแจ้งเตือนงาน O&M ที่ยังไม่อ่าน</span>
                <span className="text-xs font-semibold text-amber-700">เปิดดู →</span>
              </Link>
            )}

            {/* แถว 1 — การ์ดหลัก: ทะเบียนบ้าน · สิทธิ์ · งานในลิสต์ · (มูลค่างาน — role เห็นเงินเท่านั้น วางขวาสุด) */}
            <div className={`grid grid-cols-1 gap-3 ${d.value ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-bold text-gray-500">บ้านในความดูแล</span>
                  <span className="text-xs font-semibold text-gray-400">มีระบบติดตั้งแล้ว</span>
                </div>
                <BigNum onOpen={open({ title: "บ้านในความดูแล", kind: "house", params: { scope: "all" } })}>
                  {n(d.houses.total)}
                </BigNum>
                {/* ถึงรอบ + ยังไม่ถึงรอบ = ทั้งหมด · "ไม่เคยล้าง" เป็นส่วนหนึ่งของถึงรอบ จึงอยู่ในชิปเดียวกัน
                    ★ 14 ต.ค. 69 เดิมวาง 3 ชิปเรียงกัน อ่านเป็น 3 กอง (1,695 + 756 + 133 ≠ 1,828) */}
                <div className="mt-auto pt-4 grid grid-cols-2 gap-1.5">
                  <Chip n={n(d.houses.due)} l="ถึงรอบล้าง" detail={`ในจำนวนนี้ไม่เคยล้าง ${n(d.houses.never_washed)}`}
                    tone="bg-orange-50 text-orange-700"
                    onOpen={open({ title: "บ้านที่ถึงรอบล้าง", kind: "house", params: { scope: "due" } })} />
                  <Chip n={n(d.houses.not_due)} l="ยังไม่ถึงรอบ" tone="bg-emerald-50 text-emerald-700"
                    onOpen={open({ title: "บ้านที่ยังไม่ถึงรอบล้าง", kind: "house", params: { scope: "not_due" } })} />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-bold text-teal-700">สิทธิ์ล้างคงเหลือ</span>
                  <span className="text-xs font-semibold text-gray-400">ครั้ง</span>
                </div>
                <BigNum onOpen={open({ title: "สิทธิ์ล้างคงเหลือ", kind: "quota", params: { scope: "left" } })}>
                  {n(d.quota.left)}
                </BigNum>
                <div className="mt-auto pt-4 grid grid-cols-2 gap-1.5">
                  <Chip n={n(d.quota.granted)} l="ให้ไว้ทั้งหมด" tone="bg-gray-100 text-gray-700"
                    onOpen={open({ title: "สิทธิ์ล้างที่ให้ไว้", kind: "quota", params: { scope: "granted" } })} />
                  {/* รายละเอียด % ทำให้ชิปสูง 3 บรรทัดเท่าการ์ดข้าง ๆ — ขอบบนชิปแถวนี้ตรงกันทั้งแถว */}
                  <Chip n={n(d.quota.used)} l="ใช้ไปแล้ว" tone="bg-teal-50 text-teal-700"
                    detail={d.quota.granted ? `${Math.round((d.quota.used / d.quota.granted) * 100)}% ของที่ให้ไว้` : undefined}
                    onOpen={open({ title: "สิทธิ์ล้างที่ใช้ไปแล้ว", kind: "quota", params: { scope: "used" } })} />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="flex items-baseline justify-between mb-3">
                  {/* ★ 21 ต.ค. 69 แผน 20261021-01: ไม่ใช้ "งานบริการทั้งหมด" ตามร่าง — เลขนี้ไม่รวมแท็บปิดงาน */}
                  <span className="text-sm font-bold text-violet-700">งานบริการที่ยังไม่ปิด</span>
                  <Link href="/om/services" className="dashboard-pdf-skip text-xs font-semibold text-violet-600 hover:underline">ดูรายการ →</Link>
                </div>
                <BigNum onOpen={open(tabSpec("งานบริการที่ยังไม่ปิด", ["all"]))}>{n(d.jobs_total)}</BigNum>
                <div className="mt-2 text-xxs text-gray-400 leading-relaxed">
                  {/* ห้ามตัด "ปิด / งาน" กลางคำ (จอ 1600 ขึ้นบรรทัดใหม่ตรงนั้นพอดี) */}
                  ตรงกับตัวเลขบนการ์ด O&M หน้าแรก — รวมทุกแท็บในหน้างานบริการ <span className="whitespace-nowrap">ยกเว้นปิดงาน</span>
                </div>
                {/* 3 กองที่รวมกันได้เลขใหญ่ (ผู้ใช้เคาะ 14 ต.ค. 69)
                    ใบงานเปิดอยู่ = แท็บที่เหลือ (ไม่ใช่ติดตาม / ทางออก / ปิดงาน) จึงรวมได้เท่าเลขใหญ่เสมอ */}
                {(() => {
                  const g = (k: string) => d.buckets[k] ?? 0;
                  const stuck = STUCK.reduce((s, k) => s + g(k), 0);
                  const openKeys = TABS.map((t) => t.k as string).filter((k) => k !== "follow" && k !== "closed" && !STUCK.includes(k));
                  // ★ 21 ต.ค. 69 แผน 20261021-01: ป้ายอ่านจากชื่อแท็บ (service-view) — เปลี่ยนชื่อแท็บแล้วชิปตามเอง ไม่ต้องแก้สองที่
                  const stuckLabels = STUCK.map((k) => BUCKET_LABEL[k] ?? k);
                  return (
                    <div className="mt-auto pt-4 grid grid-cols-3 gap-1.5">
                      <Chip n={n(g("follow"))} l="ติดตาม" tone={TONE_SOFT.follow} onOpen={open(tabSpec("แท็บติดตาม", ["follow"]))} />
                      <Chip n={n(d.jobs_total - g("follow") - stuck)} l="ใบงานเปิดอยู่" tone="bg-violet-50 text-violet-700"
                        onOpen={open(tabSpec("ใบงานเปิดอยู่", openKeys))} />
                      {/* ตัดบรรทัดได้แค่ตรง · — ปล่อยให้เบราว์เซอร์ตัดเองได้ "สิทธิ์ / หมด" · "ปฏิ / เสธ" */}
                      <Chip n={n(stuck)} tone="bg-rose-50 text-rose-700"
                        onOpen={open(tabSpec(stuckLabels.join(" · "), STUCK))}
                        l={stuckLabels.map((t, i) => (
                          <span key={t}>{i > 0 && " · "}<span className="whitespace-nowrap">{t}</span></span>
                        ))} />
                    </div>
                  );
                })()}
              </div>

              {/* มูลค่างาน O&M — เปลือกการ์ดเงินสี teal ของ Dashboard I
                  ตัวใหญ่/รับแล้ว = ใบเสนอราคาที่ลูกค้ารับในช่วง · ค้างรับ = ทุกใบ (รวมรอ Account ยืนยัน) แบบ "ยังค้างรับ (ทั้งหมด)"
                  ข้อมูลชุดเดียวกับหน้ารายรับ O&M (dashboard-sql.ts) */}
              {d.value && (
                <div className="rounded-2xl bg-teal-200 border border-teal-400 p-4 flex flex-col">
                  <div className="flex items-baseline justify-between mb-3 gap-2">
                    <span className="text-sm font-bold text-teal-800">มูลค่างาน O&M</span>
                    <span className="text-xs font-semibold text-teal-700">ช่วงที่เลือก</span>
                  </div>
                  <BigNum className="text-teal-900"
                    onOpen={open({ title: `มูลค่างาน O&M ${periodLabel}`, kind: "value", params: { scope: "total", from, to } })}>
                    {fmtBaht(d.value.total)}
                  </BigNum>
                  <div className="text-xxs text-teal-700/90 leading-tight mt-1">ใบเสนอราคาที่ลูกค้ารับแล้ว {n(d.value.count)} ใบ</div>
                  {/* เก็บเงินได้กี่ % ของมูลค่างานในช่วง (รับแล้ว ÷ มูลค่างาน — ใบชุดเดียวกัน) · เติมที่ว่างกลางการ์ดด้วยข้อมูลที่ใช้ได้ */}
                  {d.value.total > 0 && (() => {
                    const pct = Math.min(100, Math.round((d.value.received / d.value.total) * 100));
                    return (
                      <div className="mt-4">
                        <div className="flex items-baseline justify-between text-xxs text-teal-800">
                          <span>เก็บเงินได้แล้ว</span>
                          <span className="font-mono tabular-nums font-bold">{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-white/60 overflow-hidden">
                          <div className="h-full rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  <div className="mt-auto pt-3 grid grid-cols-2 gap-2 border-t border-teal-400/60">
                    <div>
                      <div className="text-xs text-teal-700 leading-tight">รับเงินแล้ว</div>
                      <button type="button" title="ดูรายการที่รวมเป็นยอดนี้"
                        onClick={open({ title: `รับเงินแล้ว ${periodLabel}`, kind: "value", params: { scope: "received", from, to } })}
                        className="text-lg font-bold font-mono tabular-nums text-teal-900 leading-none mt-0.5 cursor-pointer hover:underline">
                        {fmtBaht(d.value.received)} <span className="text-xs font-normal text-teal-700">· {n(d.value.received_count)} ใบ</span>
                      </button>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-teal-700 leading-tight">ยังค้างรับ <span className="text-teal-600/70">(ทั้งหมด)</span></div>
                      <button type="button" title="ดูรายการที่รวมเป็นยอดนี้"
                        onClick={open({ title: "ยังค้างรับ ทั้งหมด (รวมรอฝ่ายบัญชียืนยัน)", kind: "value", params: { scope: "outstanding", from, to } })}
                        className="text-lg font-bold font-mono tabular-nums text-amber-700 leading-none mt-0.5 cursor-pointer hover:underline">
                        {fmtBaht(d.value.outstanding)}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* แถว 2 — งานแยกตามแท็บ ชุดเดียวกับหน้ารายการ กดแล้วเปิดรายชื่อของแท็บนั้น */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4">
              {/* ★ 14 ต.ค. 69 ชื่อเดิม "งานค้างแยกตามขั้น" แต่มีแท็บปิดงานด้วย · 10 แท็บใน 9 คอลัมน์ ช่องสุดท้ายตกไปแถวสองตัวเดียว */}
              <div className="text-sm font-bold text-gray-500 mb-3">งานแยกตามแท็บ</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5">
                {TABS.map((t) => (
                  <Chip key={t.k} n={n(d.buckets[t.k] ?? 0)} l={t.t}
                    tone={TONE_SOFT[t.k] ?? "bg-gray-50 text-gray-600"}
                    onOpen={open(tabSpec(`แท็บ${t.t}`, [t.k]))} />
                ))}
              </div>
            </div>

            {/* แถว 3 — โครงการ + งานล้าง · data-pdf-ready = บอกตัวสร้าง PDF ว่าข้อมูลขึ้นครบแล้ว */}
            <div data-pdf-ready className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border border-gray-200 p-4">
                <div className="text-sm font-bold text-gray-500 mb-3">โครงการที่ต้องติดตาม</div>
                {d.projects.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">ยังไม่มีข้อมูล</div> : (
                  <div className="space-y-1">
                    {d.projects.map((p) => (
                      <button key={p.project_id ?? "-"} type="button"
                        onClick={open(tabSpec(`ติดตาม · ${p.project_name || "(ไม่ระบุโครงการ)"}`, ["follow"], p.project_id ?? ""))}
                        className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50 cursor-pointer text-left">
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-700">{p.project_name || "(ไม่ระบุโครงการ)"}</span>
                        {/* มือถือซ่อนแท่ง ให้ชื่อโครงการมีที่ (ไม่งั้นเหลือแค่ "เสนาวิล...") */}
                        <span className="max-sm:hidden w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
                          <span className="block h-full bg-gray-700 rounded-full"
                            style={{ width: `${Math.round((p.follow / Math.max(1, d.projects[0].follow)) * 100)}%` }} />
                        </span>
                        <span className="w-12 text-right text-sm font-bold font-mono tabular-nums text-gray-900">{n(p.follow)}</span>
                        <span className="w-14 text-right text-xxs font-mono tabular-nums text-gray-400">/ {n(p.total)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xxs text-gray-400">ตัวเลขหนาคืองานในแท็บติดตาม · ตัวเลขจางคืองานทั้งหมดของโครงการ · กดที่แถวเพื่อดูรายชื่อ</div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="text-sm font-bold text-gray-500 mb-3">
                  จำนวนงานล้างแผงรายเดือน <span className="font-normal text-gray-400">· {periodLabel}</span>
                </div>
                {/* ★ 14 ต.ค. 69 แท่งไม่ขึ้นเลย — คอลัมน์สูงตามเนื้อหา height % ของแท่งเลยเป็น 0
                    ⇒ คอลัมน์ยืดเต็มความสูงกราฟ แท่งเป็น absolute ในราง flex-1 (absolute คิด % จากความสูงจริงเสมอ)
                    API เติมเดือนที่ไม่มีงานเป็น 0 ให้ครบ · แท่งเดือนนี้ = ยังไม่จบเดือน จึงสีอ่อน
                    ★ 15 ต.ค. 69 แท่งตามช่วงวันที่ (สูงสุด 24 เดือน) · กดแท่งดูรายชื่องานล้างของเดือนนั้น */}
                {d.months.every((m) => m.n === 0) ? <div className="text-sm text-gray-400 py-6 text-center">ยังไม่มีข้อมูล</div> : (
                  <>
                    <div className="flex-1 min-h-56 flex gap-1.5 pt-6">
                      {d.months.map((m, i) => {
                        const now = m.ym === nowYm;
                        // เดือนนี้ตัดด้วยช่วงวันที่ — แท่งแรก/แท่งท้ายอาจไม่เต็มเดือน
                        const mFrom = `${m.ym}-01` < from ? from : `${m.ym}-01`;
                        const mEnd = ymd(new Date(Number(m.ym.slice(0, 4)), Number(m.ym.slice(5, 7)), 0));
                        const mTo = mEnd > to ? to : mEnd;
                        return (
                          <button key={m.ym} type="button" disabled={!m.n} title={m.n ? "ดูรายชื่องานล้างเดือนนี้" : undefined}
                            onClick={open({ title: `งานล้างที่ทำจริง ${fmtThai(mFrom)} – ${fmtThai(mTo)}`, kind: "washed", params: { from: mFrom, to: mTo } })}
                            className="group flex-1 min-w-0 flex flex-col items-center gap-1 enabled:cursor-pointer">
                            <div className="relative flex-1 w-full">
                              <div className={`absolute inset-x-0 bottom-0 rounded-t group-enabled:group-hover:brightness-90 ${now ? "bg-teal-500/35" : "bg-teal-500/80"}`}
                                style={{ height: m.n ? `${Math.max(2, Math.round((m.n / peak) * 100))}%` : 0 }}>
                                <span className={`absolute inset-x-0 bottom-full mb-0.5 text-center text-xxs font-mono tabular-nums leading-none ${m.n ? "text-gray-600" : "text-gray-300"}`}>{n(m.n)}</span>
                              </div>
                            </div>
                            <span className="text-xxs max-sm:text-[11px] text-gray-400 truncate w-full text-center leading-none">
                              <MonthLabel ym={m.ym} withYear={i === 0 || m.ym.endsWith("-01")} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xxs text-gray-400">แท่งสีอ่อนคือเดือนปัจจุบัน (ยังไม่ครบเดือน) · กดที่แท่งเพื่อดูรายชื่อ</div>
                  </>
                )}
              </div>
            </div>

            {/* แถว 4 (ใครถืองานอยู่) เอาออกทั้งแถวแล้ว
                ★ 1 ต.ค. 69 การ์ด "ทีมช่าง · งานที่ถืออยู่" — เลิกใช้ทีม A/B/C (แผน 20261001-01 เฟส 4)
                ★ 15 ต.ค. 69 การ์ด "เจ้าของเคส · ใบงานที่ยังไม่ปิด" — ผู้ใช้สั่งเอาออก
                  API ยังส่ง owners / teams มา (ลำดับผลลัพธ์อ้างด้วย index) แต่ไม่แสดงแล้ว */}
          </>
        )}
      </main>
    </div>
  );
}
