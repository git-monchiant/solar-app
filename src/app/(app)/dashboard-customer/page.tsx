"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import Header from "@/components/layout/Header";
import { LeadLink } from "@/components/lead/LeadLink";
import { DownloadIcon } from "@/components/ui/icons";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { STATUS_CONFIG } from "@/lib/constants/statuses";
import { getWithTtl, setWithTtl, TWO_HOURS_MS } from "@/lib/storage-ttl";
import { useDialog } from "@/components/ui/Dialog";
import type {
  CountItem, CountSeries, CustomerDashboardData, CustomerDrilldownRow,
} from "@/lib/customer-dashboard-types";

const fmt = (value: number | null | undefined) => Number(value || 0).toLocaleString("th-TH");
const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
const topItems = (series: CountSeries, limit = 8) => series.items.filter(item => item.count > 0).sort((a, b) => b.count - a.count).slice(0, limit);

type DrillState = { title: string; loading: boolean; rows: CustomerDrilldownRow[]; error?: string } | null;

export default function CustomerDashboardPage() {
  const dialog = useDialog();
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const urlFilters = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return { from: p.get("from"), to: p.get("to") };
  }, []);
  const [dateFrom, setDateFrom] = useState(() => urlFilters?.from || getWithTtl<string>("dashboardCustomer.dateFrom", TWO_HOURS_MS) || "2026-01-01");
  const [dateTo, setDateTo] = useState(() => urlFilters?.to || getWithTtl<string>("dashboardCustomer.dateTo", TWO_HOURS_MS) || today);
  const [data, setData] = useState<CustomerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState<DrillState>(null);
  const [excelLoading, setExcelLoading] = useState(false);

  useEffect(() => { setWithTtl("dashboardCustomer.dateFrom", dateFrom); }, [dateFrom]);
  useEffect(() => { setWithTtl("dashboardCustomer.dateTo", dateTo); }, [dateTo]);

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("from", dateFrom);
    if (dateTo) p.set("to", dateTo);
    return p;
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    apiFetch(`/api/dashboard-customer?${filterParams.toString()}`)
      .then((result: CustomerDashboardData) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterParams]);

  const openDrill = async (title: string, dimension: string, value = "", score?: number) => {
    setDrill({ title, loading: true, rows: [] });
    const p = new URLSearchParams(filterParams);
    p.set("dimension", dimension);
    if (value) p.set("value", value);
    if (score) p.set("score", String(score));
    try {
      const rows = await apiFetch(`/api/dashboard-customer/drilldown?${p.toString()}`) as CustomerDrilldownRow[];
      setDrill({ title, loading: false, rows });
    } catch (err) {
      setDrill({ title, loading: false, rows: [], error: err instanceof Error ? err.message : "โหลดรายละเอียดไม่สำเร็จ" });
    }
  };

  const reset = () => { setDateFrom("2026-01-01"); setDateTo(today); };
  const filtersChanged = dateFrom !== "2026-01-01" || dateTo !== today;

  const downloadExcel = async () => {
    setExcelLoading(true);
    try {
      const response = await fetch(`/api/dashboard-customer/export?${filterParams.toString()}`, { headers: { ...getUserIdHeader() } });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "สร้างไฟล์ Excel ไม่สำเร็จ");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customer-info_${dateFrom || "all"}_${dateTo || "all"}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { dialog.alert({ message: err instanceof Error ? err.message : "สร้างไฟล์ Excel ไม่สำเร็จ", variant: "danger" }); }
    finally { setExcelLoading(false); }
  };

  return (
    <div className="dashboard-print-root">
      <div className="dashboard-pdf-skip">
        <Header title="Dashboard III" subtitle="CUSTOMER QUESTIONNAIRE · SENA SOLAR ENERGY" rightContent={
          <div className="flex items-center gap-2">
            <CustomerFilters
              className="hidden xl:flex"
              dateFrom={dateFrom} setDateFrom={setDateFrom}
              dateTo={dateTo} setDateTo={setDateTo}
              filtersChanged={filtersChanged} reset={reset} loading={loading}
            />
            <button type="button" onClick={downloadExcel} disabled={excelLoading}
              className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-emerald-200 text-xs font-semibold text-emerald-700 hover:border-emerald-300 disabled:opacity-60">
              {excelLoading ? <span className="w-3.5 h-3.5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />}
              <span>{excelLoading ? "กำลังสร้าง..." : "Excel"}</span>
            </button>
          </div>
        } />
      </div>

      {drill && <DrilldownModal state={drill} onClose={() => setDrill(null)} />}

      <div className="dashboard-pdf-content w-full p-3 md:p-4 space-y-4">
        <div className="dashboard-pdf-skip xl:hidden rounded-xl border border-gray-200 bg-gray-50 p-3">
          <CustomerFilters
            className="flex flex-wrap"
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            filtersChanged={filtersChanged} reset={reset} loading={loading}
          />
        </div>

        <FilterBanner from={dateFrom} to={dateTo} />
        {error && !data && <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{error}</div>}
        {!data && !error && <div className="h-64 grid place-items-center"><span className="w-9 h-9 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>}

        {data && <>
          <ReportGroup title="Customer & Energy" subtitle="ลูกค้าเป็นใคร และใช้พลังงานอย่างไรในปัจจุบัน">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
            <SectionCard id="insight-1" number={1} title="Customer Profile" subtitle="ข้อมูลบ้านและผู้อยู่อาศัย" answered={sectionMax(data.sections.customerProfile.residenceType, data.sections.customerProfile.houseAge, data.sections.customerProfile.roofShape)} className="">
              <VerticalBars series={data.sections.customerProfile.residenceType} color="bg-orange-500" onClick={(item) => openDrill(item.label, "residence_type", item.value)} />
              <div className="space-y-3">
              <SeriesChips title="อายุบ้าน" series={data.sections.customerProfile.houseAge} onClick={(item) => openDrill(`อายุบ้าน · ${item.label}`, "house_age", item.value)} />
              <SeriesChips title="ประเภทหลังคา" series={data.sections.customerProfile.roofShape} onClick={(item) => openDrill(`ประเภทหลังคา · ${item.label}`, "roof_shape", item.value)} />
              <div className="grid grid-cols-2 gap-2">
                <MiniStat label="ผู้อยู่อาศัยเฉลี่ย" value={data.sections.customerProfile.averageOccupants ? `${data.sections.customerProfile.averageOccupants} คน` : "—"} />
                <MiniStat label="มีผู้สูงอายุ" value={`${fmt(data.sections.customerProfile.withElderly)} Lead`} onClick={() => openDrill("มีผู้สูงอายุ", "occupant_elderly", "positive")} />
                <MiniStat label="มีเด็ก" value={`${fmt(data.sections.customerProfile.withKids)} Lead`} onClick={() => openDrill("มีเด็ก", "occupant_kids", "positive")} />
                <MiniStat label="มีสัตว์เลี้ยง" value={`${fmt(data.sections.customerProfile.withPets)} Lead`} onClick={() => openDrill("มีสัตว์เลี้ยง", "occupant_pets", "positive")} />
              </div>
              </div>
            </SectionCard>

            <SectionCard id="insight-2" number={2} title="Energy Profile" subtitle="การใช้พลังงานปัจจุบัน" answered={data.sections.energyProfile.monthlyBill.answered} className="">
              <HorizontalBars series={data.sections.energyProfile.monthlyBill} color="bg-emerald-500" onClick={(item) => openDrill(`ค่าไฟ · ${item.label}`, "monthly_bill", item.value)} />
              <div className="grid grid-cols-2 gap-2"><MiniStat label="ค่าไฟเฉลี่ย" value={data.sections.energyProfile.monthlyBill.average ? `฿${fmt(data.sections.energyProfile.monthlyBill.average)}` : "—"} /><MiniStat label="ค่าไฟสูงสุดเฉลี่ย" value={data.sections.energyProfile.monthlyBillMaxAverage ? `฿${fmt(data.sections.energyProfile.monthlyBillMaxAverage)}` : "—"} /></div>
              <div className="space-y-3">
              <SeriesChips title="ช่วงเวลาที่ใช้ไฟสูงสุด" series={data.sections.energyProfile.peakUsage} onClick={(item) => openDrill(`ช่วงใช้ไฟ · ${item.label}`, "peak_usage", item.value)} />
              <SeriesChips title="ระบบไฟปัจจุบัน" series={data.sections.energyProfile.electricalPhase} onClick={(item) => openDrill(`ระบบไฟ · ${item.label}`, "electrical_phase", item.value)} />
              <SeriesChips title="ขนาดมิเตอร์" series={data.sections.energyProfile.meterSize} onClick={(item) => openDrill(`ขนาดมิเตอร์ · ${item.label}`, "meter_size", item.value)} />
              </div>
            </SectionCard>

            <SectionCard id="insight-3" number={3} title="Lifestyle Assessment" subtitle="รูปแบบการใช้ชีวิต" answered={Math.max(data.sections.lifestyle.homeAtDaytime.answered, data.sections.lifestyle.workAtHome.answered, data.sections.lifestyle.acAnswered)} className="">
              <div className="grid grid-cols-2 gap-2">
                <YesStat label="อยู่บ้านช่วงกลางวัน" series={data.sections.lifestyle.homeAtDaytime} onClick={() => openDrill("อยู่บ้านช่วงกลางวัน", "home_at_daytime", "yes")} />
                <YesStat label="ทำงาน/เปิดธุรกิจที่บ้าน" series={data.sections.lifestyle.workAtHome} onClick={() => openDrill("ทำงาน/เปิดธุรกิจที่บ้าน", "work_at_home", "yes")} />
                <MiniStat label="แอร์ช่วงกลางวัน" value={`${fmt(data.sections.lifestyle.acDayTotal)} เครื่อง`} onClick={() => openDrill("ใช้แอร์ช่วงกลางวัน", "ac_period", "day")} />
                <MiniStat label="แอร์ช่วงกลางคืน" value={`${fmt(data.sections.lifestyle.acNightTotal)} เครื่อง`} onClick={() => openDrill("ใช้แอร์ช่วงกลางคืน", "ac_period", "night")} />
              </div>
              <div className="space-y-3">
              <SeriesChips title="ผู้ที่อยู่บ้านช่วงกลางวัน (หลายคำตอบ)" series={data.sections.lifestyle.daytimeOccupants} onClick={(item) => openDrill(`ผู้ที่อยู่บ้าน · ${item.label}`, "daytime_occupants", item.value)} />
              <SeriesChips title="ประเภทธุรกิจ / ทำงานที่บ้าน" series={data.sections.lifestyle.businessType} onClick={(item) => openDrill(`ธุรกิจที่บ้าน · ${item.label}`, "business_type", item.value)} />
              <SeriesChips title="จำนวนวันทำงานที่บ้าน" series={data.sections.lifestyle.workDaysPerWeek} onClick={(item) => openDrill(`วันทำงานที่บ้าน · ${item.label}`, "work_days_per_week", item.value)} />
              <SeriesChips title="ที่ชาร์จรถ EV" series={data.sections.lifestyle.evCharger} onClick={(item) => openDrill(`ที่ชาร์จรถ EV · ${item.label}`, "ev_charger", item.value)} />
              <SeriesChips title="ช่วงเวลาชาร์จ EV" series={data.sections.lifestyle.evChargePeriod} onClick={(item) => openDrill(`ชาร์จ EV · ${item.label}`, "ev_charge_period", item.value)} />
              </div>
            </SectionCard>
          </div>
          </ReportGroup>

          <ReportGroup title="Future & Risk" subtitle="แผนในอนาคต ความมั่นคงด้านพลังงาน และความเสี่ยงของบ้าน">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
            <SectionCard id="insight-4" number={4} title="Future Home Assessment" subtitle="แผนบ้านใน 5 ปี" answered={Math.max(...data.sections.futureHome.fields.map(f => f.series.answered), 0)} className="">
              <div className="space-y-2">{data.sections.futureHome.fields.map(field => <StackedSeries key={field.key} label={field.label} series={field.series} onClick={(item) => openDrill(`${field.label} · ${item.label}`, field.key, item.value)} />)}</div>
              <StackLegend />
            </SectionCard>

            <SectionCard id="insight-5" number={5} title="Energy Security Assessment" subtitle="ความมั่นคงด้านพลังงาน" answered={Math.max(data.sections.energySecurity.outagePriorities.answered, data.sections.energySecurity.billRiseAction.answered)} className="">
              <HorizontalBars series={data.sections.energySecurity.outagePriorities} color="bg-amber-400" multi onClick={(item) => openDrill(`ไฟดับ 6 ชั่วโมง · ${item.label}`, "outage_priorities", item.value)} />
              <div>
              <SeriesChips title="หากค่าไฟเพิ่มขึ้นอีก 30%" series={data.sections.energySecurity.billRiseAction} onClick={(item) => openDrill(`ค่าไฟเพิ่ม 30% · ${item.label}`, "bill_rise_action", item.value)} />
              </div>
            </SectionCard>

            <SectionCard id="insight-6" number={6} title="Home Health Check" subtitle="สุขภาพบ้าน" answered={Math.max(...data.sections.homeHealth.fields.map(f => f.series.answered), 0)} className="">
              <div className="grid grid-cols-2 gap-2">{data.sections.homeHealth.fields.map(field => {
                const yes = field.series.items.find(i => i.value === "yes")?.count || 0;
                return <MiniStat key={field.key} label={field.label} value={field.series.answered < 30 ? `${fmt(yes)} / ${fmt(field.series.answered)}` : `${pct(yes, field.series.answered)}%`} detail={field.series.answered < 30 ? `${pct(yes, field.series.answered)}% · ข้อมูลยังน้อย` : `${fmt(yes)} / ${fmt(field.series.answered)} คน`} danger={yes > 0} onClick={() => openDrill(field.label, field.key, "yes")} />;
              })}</div>
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center"><div className="text-xs text-rose-600">มีความเสี่ยงอย่างน้อย 1 ข้อ</div><button type="button" className="cursor-pointer text-xl font-bold text-rose-700 hover:underline" onClick={() => openDrill("มีความเสี่ยงบ้านอย่างน้อย 1 ข้อ", "home_health_risk", "yes")}>{fmt(data.sections.homeHealth.anyRisk)} Lead</button></div>
            </SectionCard>
          </div>
          </ReportGroup>

          <ReportGroup title="Readiness & Decision" subtitle="ความพร้อมของบ้านและปัจจัยที่มีผลต่อการตัดสินใจ">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
            <SectionCard id="insight-7" number={7} title="Beyond Question" subtitle="ความพร้อมด้านพลังงานในอนาคต" answered={Math.max(...data.sections.beyond.fields.map(f => f.series.answered), 0)} className="">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{data.sections.beyond.fields.map(field => <div key={field.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3"><div className="text-xs font-semibold text-gray-600 mb-2">{field.label}</div><SeriesDistribution series={field.series} onClick={(item) => openDrill(`${field.label} · ${item.label}`, field.key, item.value)} /></div>)}</div>
            </SectionCard>

            <SectionCard id="insight-8" number={8} title="Decision Making Factor" subtitle="การตัดสินใจติดตั้ง" answered={Math.max(data.sections.decision.timeline.answered, ...data.sections.decision.factors.map(f => f.answered), 0)} className="">
              <SeriesChips title="ระยะเวลาในการตัดสินใจติดตั้ง" series={data.sections.decision.timeline} onClick={(item) => openDrill(`ระยะเวลาตัดสินใจ · ${item.label}`, "decision_timeline", item.value)} />
              <div>
              <DecisionMatrix factors={data.sections.decision.factors} onClick={(key, label, score) => openDrill(`${label}${score ? ` · ${score}/5` : ""}`, "decision_factor", key, score)} />
              </div>
            </SectionCard>
          </div>
          </ReportGroup>
          <div className="text-xxs text-gray-400">อัปเดต Customer Info ล่าสุด {data.meta.latestUpdatedAt ? new Date(data.meta.latestUpdatedAt).toLocaleString("th-TH") : "—"} · NULL ถือว่ายังไม่ตอบและไม่นับเป็น “ไม่”</div>
        </>}
      </div>
    </div>
  );
}

function CustomerFilters({
  className, dateFrom, setDateFrom, dateTo, setDateTo, filtersChanged, reset, loading,
}: {
  className: string;
  dateFrom: string; setDateFrom: (value: string) => void;
  dateTo: string; setDateTo: (value: string) => void;
  filtersChanged: boolean; reset: () => void; loading: boolean;
}) {
  const controlClass = "h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300";
  return <div className={`${className} items-center gap-1 text-xs text-gray-500`}>
    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={`${controlClass} w-[126px]`} title="ช่วงวันที่ (จาก)" />
    <span className="text-gray-400">–</span>
    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={`${controlClass} w-[126px]`} title="ช่วงวันที่ (ถึง)" />
    {filtersChanged && <button type="button" onClick={reset} className="h-8 px-2 rounded-lg text-xs text-gray-500 hover:text-gray-700" title="รีเซ็ตตัวกรอง">รีเซ็ต</button>}
    {loading && <span className="ml-1 w-4 h-4 border-2 border-gray-200 border-t-primary rounded-full animate-spin shrink-0" />}
  </div>;
}

function ReportGroup({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="space-y-3">
    <div className="flex items-end justify-between gap-3 border-b border-gray-200 pb-2">
      <div><h2 className="text-sm font-bold text-gray-800 tracking-tight">{title}</h2><p className="text-xs text-gray-400 mt-0.5">{subtitle}</p></div>
    </div>
    {children}
  </section>;
}

function FilterBanner({ from, to }: { from: string; to: string }) {
  const thai = (value: string) => { if (!value) return "—"; const [y, m, d] = value.split("-"); return `${d}/${m}/${Number(y) + 543}`; };
  return <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 flex items-center gap-2 flex-wrap"><span className="font-semibold text-gray-500 uppercase tracking-wider">Filter</span><span className="font-mono">{thai(from)} – {thai(to)}</span></div>;
}

const SECTION_TONES: Record<number, string> = { 1: "bg-orange-50 text-orange-600", 2: "bg-emerald-50 text-emerald-600", 3: "bg-sky-50 text-sky-600", 4: "bg-violet-50 text-violet-600", 5: "bg-amber-50 text-amber-600", 6: "bg-rose-50 text-rose-600", 7: "bg-teal-50 text-teal-600", 8: "bg-indigo-50 text-indigo-600" };
function SectionCard({ id, number, title, subtitle, answered, className, children }: { id: string; number: number; title: string; subtitle: string; answered: number; className: string; children: React.ReactNode }) {
  return <section id={id} className={`scroll-mt-24 rounded-2xl bg-white border border-gray-200 p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow ${className}`}><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><span className={`w-8 h-8 rounded-xl grid place-items-center text-sm font-bold font-mono shrink-0 ${SECTION_TONES[number]}`}>{number}</span><div><div className="text-sm font-bold text-gray-800 tracking-tight">{title}</div><div className="text-xs text-gray-400 mt-0.5">{subtitle}</div></div></div><div className="flex flex-col items-end gap-1 shrink-0"><span className="text-xxs text-gray-400">ตอบ {fmt(answered)} คน</span>{answered > 0 && answered < 30 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xxs font-semibold text-amber-600">ข้อมูลยังน้อย</span>}</div></div>{children}</section>;
}

function Empty() { return <div className="text-xs text-gray-400 text-center py-8">ยังไม่มีข้อมูลคำตอบ</div>; }

function VerticalBars({ series, color, onClick }: { series: CountSeries; color: string; onClick: (item: CountItem) => void }) {
  const items = topItems(series, 7); if (!items.length) return <Empty />; const max = Math.max(...items.map(i => i.count), 1);
  return <div><div className="flex items-end gap-1.5 h-40 border-b border-gray-200">{items.map(item => <button type="button" key={item.value} onClick={() => onClick(item)} className="cursor-pointer flex-1 min-w-0 h-full flex flex-col justify-end hover:bg-gray-50 rounded-t"><span className="text-xxs font-bold font-mono text-gray-700 mb-1">{item.count}</span><span className={`${color} w-full rounded-t-sm`} style={{ height: `${Math.max(3, (item.count / max) * 115)}px` }} /></button>)}</div><div className="flex gap-1.5 mt-1">{items.map(item => <div key={item.value} className="flex-1 min-w-0 text-center text-xxs text-gray-500 truncate" title={item.label}>{item.label}</div>)}</div></div>;
}

function HorizontalBars({ series, color, onClick, multi = false }: { series: { answered: number; items: CountItem[] }; color: string; onClick: (item: CountItem) => void; multi?: boolean }) {
  const items = series.items.filter(i => i.count > 0); if (!items.length) return <Empty />; const max = Math.max(...items.map(i => i.count), 1);
  return <div><div className="space-y-2">{items.map(item => <button type="button" key={item.value} onClick={() => onClick(item)} className="cursor-pointer w-full grid grid-cols-[minmax(90px,1.3fr)_3fr_42px] gap-2 items-center text-left hover:bg-gray-50 rounded px-1 py-0.5"><span className="text-xs text-gray-600 truncate" title={item.label}>{item.label}</span><span className="h-3.5 bg-gray-100 rounded-sm overflow-hidden"><span className={`block h-full ${color}`} style={{ width: `${(item.count / max) * 100}%` }} /></span><span className="text-xs font-bold font-mono text-right">{item.count}</span></button>)}</div>{multi && <div className="text-xxs text-gray-400 mt-2">เลือกได้มากกว่า 1 ข้อ · ฐานผู้ตอบ {fmt(series.answered)} คน</div>}</div>;
}

function SeriesChips({ title, series, onClick }: { title: string; series: CountSeries; onClick: (item: CountItem) => void }) {
  const items = topItems(series); return <div><div className="text-xxs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{title} <span className="normal-case font-normal text-gray-300">(n={series.answered})</span></div>{items.length ? <div className="flex flex-wrap gap-1.5">{items.map(item => <button type="button" key={item.value} onClick={() => onClick(item)} className="cursor-pointer inline-flex items-center gap-1.5 rounded-md bg-gray-50 border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-gray-300"><span className="truncate max-w-40">{item.label}</span><b className="font-mono text-gray-900">{item.count}</b></button>)}</div> : <div className="text-xs text-gray-300">ยังไม่มีข้อมูล</div>}</div>;
}

function MiniStat({ label, value, detail, onClick, danger }: { label: string; value: string; detail?: string; onClick?: () => void; danger?: boolean }) {
  const Tag = onClick ? "button" : "div"; return <Tag type={onClick ? "button" : undefined} onClick={onClick} className={`rounded-xl border border-gray-200 bg-gray-50 p-3 text-left ${onClick ? "cursor-pointer hover:border-gray-300 hover:bg-white transition-colors" : ""}`}><div className="text-xs text-gray-500 leading-tight">{label}</div><div className={`text-lg font-bold font-mono mt-1 ${danger ? "text-rose-600" : "text-gray-900"}`}>{value}</div>{detail && <div className="text-xxs text-gray-400 mt-1">{detail}</div>}</Tag>;
}

function YesStat({ label, series, onClick }: { label: string; series: CountSeries; onClick: () => void }) {
  const yes = series.items.find(i => i.value === "yes")?.count || 0;
  return <MiniStat label={label} value={series.answered < 30 ? `${fmt(yes)} / ${fmt(series.answered)}` : `${pct(yes, series.answered)}%`} detail={series.answered < 30 ? `${pct(yes, series.answered)}% · ข้อมูลยังน้อย` : `${fmt(yes)} / ${fmt(series.answered)} คน`} onClick={onClick} />;
}

const STACK_COLORS: Record<string, string> = { yes: "bg-emerald-500", considering: "bg-amber-400", maybe: "bg-amber-400", no: "bg-gray-300" };
function StackedSeries({ label, series, onClick }: { label: string; series: CountSeries; onClick: (item: CountItem) => void }) {
  return <div className="grid grid-cols-[120px_1fr] gap-2 items-center"><div className="text-xs text-gray-600 leading-tight">{label}</div><div className="h-5 rounded overflow-hidden bg-gray-100 flex">{series.items.filter(i => i.count > 0).map(item => <button type="button" key={item.value} title={`${item.label} ${item.count}`} onClick={() => onClick(item)} className={`cursor-pointer h-full ${STACK_COLORS[item.value] || "bg-sky-400"}`} style={{ width: `${pct(item.count, series.answered)}%` }} />)}</div></div>;
}
function StackLegend() { return <div className="flex gap-3 text-xxs text-gray-500"><span><i className="inline-block w-2 h-2 bg-emerald-500 mr-1" />มี</span><span><i className="inline-block w-2 h-2 bg-amber-400 mr-1" />กำลังพิจารณา/ไม่แน่ใจ</span><span><i className="inline-block w-2 h-2 bg-gray-300 mr-1" />ไม่มี</span></div>; }

function SeriesDistribution({ series, onClick }: { series: CountSeries; onClick: (item: CountItem) => void }) {
  const colors = ["bg-teal-500", "bg-sky-500", "bg-amber-400", "bg-gray-300"]; return <div><div className="h-5 flex rounded overflow-hidden bg-gray-100">{series.items.filter(i => i.count > 0).map((item, index) => <button type="button" key={item.value} onClick={() => onClick(item)} className={`cursor-pointer ${colors[index % colors.length]}`} style={{ width: `${pct(item.count, series.answered)}%` }} title={`${item.label} ${item.count}`} />)}</div><div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">{series.items.filter(i => i.count > 0).map((item, index) => <button key={item.value} type="button" onClick={() => onClick(item)} className="cursor-pointer text-xxs text-gray-500"><i className={`inline-block w-2 h-2 mr-1 ${colors[index % colors.length]}`} />{item.label} {item.count}</button>)}</div></div>;
}

function DecisionMatrix({ factors, onClick }: { factors: CustomerDashboardData["sections"]["decision"]["factors"]; onClick: (key: string, label: string, score?: number) => void }) {
  if (!factors.some(f => f.answered > 0)) return <Empty />;
  return <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-1 text-xxs"><thead><tr><th className="text-left text-gray-400 font-medium">ปัจจัย</th>{[1,2,3,4,5].map(n => <th key={n} className="text-gray-400 font-medium w-9">{n}</th>)}<th className="text-gray-400 font-medium">เฉลี่ย</th></tr></thead><tbody>{factors.map(factor => <tr key={factor.key}><td><button type="button" onClick={() => onClick(factor.key, factor.label)} className="cursor-pointer text-left text-gray-700 hover:underline max-w-52 leading-tight" title={factor.label}>{factor.label}</button></td>{factor.scores.map((count, index) => <td key={index}><button type="button" disabled={!count} onClick={() => onClick(factor.key, factor.label, index + 1)} className={`w-full rounded py-1.5 font-mono ${count ? ["bg-sky-50","bg-sky-100","bg-sky-200","bg-sky-400 text-white","bg-sky-700 text-white"][index] + " cursor-pointer" : "bg-gray-50 text-gray-300"}`}>{count}</button></td>)}<td className="text-center font-bold font-mono text-gray-800">{factor.average ?? "—"}</td></tr>)}</tbody></table></div>;
}

function sectionMax(...series: CountSeries[]) { return Math.max(...series.map(s => s.answered), 0); }

function exportDrilldownExcel(state: NonNullable<DrillState>) {
  if (!state.rows.length) return;
  const header = ["ID", "ชื่อ-นามสกุล", "บ้านเลขที่", "โครงการ", "Source", "สถานะ", "คำตอบ", "วันที่สร้าง"];
  const rows = state.rows.map(row => {
    const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG[row.status.split("-")[0]];
    return [
      row.id,
      row.full_name,
      row.house_number || "",
      row.project_name || "",
      row.source || "",
      cfg?.label || row.status,
      row.answer,
      row.created_at ? new Date(row.created_at).toLocaleDateString("th-TH") : "",
    ];
  });
  const worksheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  worksheet["!cols"] = [
    { wch: 8 }, { wch: 28 }, { wch: 14 }, { wch: 28 },
    { wch: 18 }, { wch: 18 }, { wch: 42 }, { wch: 14 },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  header.forEach((_, column) => {
    const ref = XLSX.utils.encode_cell({ r: 0, c: column });
    if (worksheet[ref]) {
      worksheet[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: "F3F4F6" } } };
    }
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
  const safeTitle = state.title.replace(/[\\/:*?[\]]/g, "-");
  XLSX.writeFile(workbook, `${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function DrilldownModal({ state, onClose }: { state: NonNullable<DrillState>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={state.title} className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 truncate">
            {state.title} <span className="text-base font-normal text-gray-500 ml-1">({state.loading ? "…" : state.rows.length})</span>
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            {!state.loading && !state.error && state.rows.length > 0 && (
              <button
                type="button"
                onClick={() => exportDrilldownExcel(state)}
                className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
                title={`Export ${state.rows.length} rows to Excel`}
              >
                <DownloadIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                <span>Excel</span>
              </button>
            )}
            <button type="button" aria-label="ปิดหน้าต่าง" onClick={onClose} className="cursor-pointer w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl">✕</button>
          </div>
        </div>
        <div className="overflow-auto divide-y divide-gray-100">
          {state.loading ? (
            <div className="py-12 grid place-items-center"><span className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div>
          ) : state.error ? (
            <div className="text-center py-10 text-red-500 text-sm">{state.error}</div>
          ) : !state.rows.length ? (
            <div className="text-center py-10 text-gray-400 text-sm">ไม่มีรายการ</div>
          ) : state.rows.map(row => {
            const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG[row.status.split("-")[0]];
            return (
              <LeadLink key={row.id} id={row.id} className="cursor-pointer flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-gray-600 font-bold text-sm">{row.full_name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 truncate flex items-baseline gap-2">
                    <span className="truncate">{row.full_name}</span>
                    {row.created_at && <span className="text-xs font-normal text-gray-400 shrink-0">สร้าง {new Date(row.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>}
                  </div>
                  <div className="grid grid-cols-[3.5rem_minmax(5rem,7rem)_minmax(0,1fr)] gap-3 text-xs text-gray-500 font-mono tabular-nums">
                    <span>ID {row.id}</span>
                    <span className="truncate">บ้าน {row.house_number || "—"}</span>
                    <span className="truncate">{row.project_name || "ไม่ระบุโครงการ"}</span>
                  </div>
                  <div className="text-xs text-sky-700 truncate mt-0.5">{row.answer}</div>
                </div>
                <span className={`text-xxs font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white shrink-0 ${cfg?.color || "bg-gray-400"}`}>{cfg?.label || row.status}</span>
              </LeadLink>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xxs text-gray-400 text-center">คลิกชื่อเพื่อเปิด lead detail ใน tab ใหม่</div>
      </div>
    </div>
  );
}
