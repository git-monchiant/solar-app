"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import { LeadLink } from "@/components/lead/LeadLink";
import { DownloadIcon } from "@/components/ui/icons";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { STATUS_CONFIG } from "@/lib/constants/statuses";
import { getWithTtl, setWithTtl, TWO_HOURS_MS } from "@/lib/storage-ttl";
import type {
  CountItem, CountSeries, CustomerDashboardData, CustomerDrilldownRow,
} from "@/lib/customer-dashboard-types";

const fmt = (value: number | null | undefined) => Number(value || 0).toLocaleString("th-TH");
const pct = (value: number, total: number) => total > 0 ? Math.round((value / total) * 100) : 0;
const topItems = (series: CountSeries, limit = 8) => series.items.filter(item => item.count > 0).sort((a, b) => b.count - a.count).slice(0, limit);
const countOf = (series: CountSeries, value: string) => series.items.find(item => item.value === value)?.count || 0;

type DrillState = { title: string; loading: boolean; rows: CustomerDrilldownRow[]; error?: string } | null;

export default function CustomerDashboardPage() {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const urlFilters = useMemo(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search);
    return {
      from: p.get("from"), to: p.get("to"), projectId: p.get("project_id"),
      source: p.get("source"), status: p.get("status"),
    };
  }, []);
  const [dateFrom, setDateFrom] = useState(() => urlFilters?.from || getWithTtl<string>("dashboardCustomer.dateFrom", TWO_HOURS_MS) || "2026-01-01");
  const [dateTo, setDateTo] = useState(() => urlFilters?.to || getWithTtl<string>("dashboardCustomer.dateTo", TWO_HOURS_MS) || today);
  const [projectId, setProjectId] = useState(() => urlFilters?.projectId || getWithTtl<string>("dashboardCustomer.projectId", TWO_HOURS_MS) || "");
  const [source, setSource] = useState(() => urlFilters?.source || getWithTtl<string>("dashboardCustomer.source", TWO_HOURS_MS) || "");
  const [status, setStatus] = useState(() => urlFilters?.status || getWithTtl<string>("dashboardCustomer.status", TWO_HOURS_MS) || "");
  const [data, setData] = useState<CustomerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drill, setDrill] = useState<DrillState>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  useEffect(() => { setWithTtl("dashboardCustomer.dateFrom", dateFrom); }, [dateFrom]);
  useEffect(() => { setWithTtl("dashboardCustomer.dateTo", dateTo); }, [dateTo]);
  useEffect(() => { setWithTtl("dashboardCustomer.projectId", projectId); }, [projectId]);
  useEffect(() => { setWithTtl("dashboardCustomer.source", source); }, [source]);
  useEffect(() => { setWithTtl("dashboardCustomer.status", status); }, [status]);

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (dateFrom) p.set("from", dateFrom);
    if (dateTo) p.set("to", dateTo);
    if (projectId) p.set("project_id", projectId);
    if (source) p.set("source", source);
    if (status) p.set("status", status);
    return p;
  }, [dateFrom, dateTo, projectId, source, status]);

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

  const reset = () => { setDateFrom("2026-01-01"); setDateTo(today); setProjectId(""); setSource(""); setStatus(""); };
  const filtersChanged = dateFrom !== "2026-01-01" || dateTo !== today || !!projectId || !!source || !!status;

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
      const p = new URLSearchParams(filterParams);
      p.set("path", "/dashboard-customer");
      p.set("details", "1");
      const response = await fetch(`/api/report/dashboard-pdf?${p.toString()}`, { headers: { ...getUserIdHeader() } });
      if (!response.ok) throw new Error("ดาวน์โหลด PDF ไม่สำเร็จ");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dashboard-iii_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { alert(err instanceof Error ? err.message : "ดาวน์โหลด PDF ไม่สำเร็จ"); }
    finally { setPdfLoading(false); }
  };

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
    } catch (err) { alert(err instanceof Error ? err.message : "สร้างไฟล์ Excel ไม่สำเร็จ"); }
    finally { setExcelLoading(false); }
  };

  return (
    <div className="dashboard-print-root">
      <div className="dashboard-pdf-skip">
        <Header title="Dashboard III" subtitle="CUSTOMER QUESTIONNAIRE · SENA SOLAR ENERGY" rightContent={
          <div className="flex items-center gap-2">
            <CustomerFilters
              className="hidden xl:flex"
              data={data}
              projectId={projectId} setProjectId={setProjectId}
              source={source} setSource={setSource}
              status={status} setStatus={setStatus}
              dateFrom={dateFrom} setDateFrom={setDateFrom}
              dateTo={dateTo} setDateTo={setDateTo}
              filtersChanged={filtersChanged} reset={reset} loading={loading}
            />
            <button type="button" onClick={downloadExcel} disabled={excelLoading || pdfLoading}
              className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-emerald-200 text-xs font-semibold text-emerald-700 hover:border-emerald-300 disabled:opacity-60">
              {excelLoading ? <span className="w-3.5 h-3.5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />}
              <span>{excelLoading ? "กำลังสร้าง..." : "Excel"}</span>
            </button>
            <button type="button" onClick={downloadPdf} disabled={pdfLoading || excelLoading}
              className="cursor-pointer inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white border border-gray-200 text-xs font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60">
              {pdfLoading ? <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /> : <DownloadIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />}
              <span>{pdfLoading ? "กำลังสร้าง..." : "PDF"}</span>
            </button>
          </div>
        } />
      </div>

      {drill && <DrilldownModal state={drill} onClose={() => setDrill(null)} />}

      <div className="dashboard-pdf-content w-full p-3 md:p-4 space-y-4">
        <div className="dashboard-pdf-skip xl:hidden rounded-xl border border-gray-200 bg-gray-50 p-3">
          <CustomerFilters
            className="flex flex-wrap"
            data={data}
            projectId={projectId} setProjectId={setProjectId}
            source={source} setSource={setSource}
            status={status} setStatus={setStatus}
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            filtersChanged={filtersChanged} reset={reset} loading={loading}
          />
        </div>

        <FilterBanner from={dateFrom} to={dateTo} project={data?.filters.projects.find(p => String(p.id) === projectId)?.name} source={data?.filters.sources.find(s => s.value === source)?.label} status={status ? STATUS_CONFIG[status]?.label || status : undefined} />
        {error && !data && <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">{error}</div>}
        {!data && !error && <div className="h-64 grid place-items-center"><span className="w-9 h-9 border-3 border-gray-200 border-t-primary rounded-full animate-spin" /></div>}

        {data && <>
          <ReportGroup title="Executive Summary" subtitle="ภาพรวมฐานข้อมูล การจำแนกลูกค้า และความพร้อมในการตัดสินใจ">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <SummaryPanel title="Questionnaire Overview" rate={`${pct(data.meta.respondents, data.meta.cohortLeads)}% response`} rateTone="text-sky-600" value={fmt(data.meta.cohortLeads)} note="Lead ทั้งหมดในช่วงเวลาที่เลือก">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SummaryTile label="ยังไม่ตอบ" value={fmt(data.meta.cohortLeads - data.meta.respondents)} tone="gray" onClick={() => openDrill("ยังไม่ตอบแบบสอบถาม", "questionnaire_status", "unanswered")} />
                <SummaryTile label="ตอบบางส่วน" value={fmt(data.meta.respondents - data.meta.completeEight)} tone="blue" onClick={() => openDrill("ตอบแบบสอบถามบางส่วน", "questionnaire_status", "partial")} />
                <SummaryTile label="ครบ 8 หัวข้อ" value={fmt(data.meta.completeEight)} tone="green" onClick={() => openDrill("ตอบครบทั้ง 8 หัวข้อ", "questionnaire_status", "complete")} />
                <SummaryTile label="Coverage เฉลี่ย" value={`${data.meta.coveragePct}%`} tone="violet" />
              </div>
            </SummaryPanel>

            <SummaryPanel title="กลุ่มลูกค้า" rate={`${pct(data.summary.customerGroups.answered, data.meta.cohortLeads)}% classified`} rateTone="text-violet-600" value={fmt(data.meta.cohortLeads)} note={`Lead ทั้งหมด · จัดกลุ่มแล้ว ${fmt(data.summary.customerGroups.answered)} Lead`}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SummaryTile label="ลูกค้าทั่วไป" value={fmt(countOf(data.summary.customerGroups, "general"))} tone="blue" onClick={() => openDrill("ลูกค้าทั่วไป", "customer_group", "general")} />
                <SummaryTile label="ลูกค้าเสนา" value={fmt(countOf(data.summary.customerGroups, "sena"))} tone="green" onClick={() => openDrill("ลูกค้าเสนา", "customer_group", "sena")} />
                <SummaryTile label="SME" value={fmt(countOf(data.summary.customerGroups, "sme"))} tone="violet" onClick={() => openDrill("SME", "customer_group", "sme")} />
                <SummaryTile label="ยังไม่ระบุ" value={fmt(countOf(data.summary.customerGroups, "unclassified"))} tone="gray" onClick={() => openDrill("ยังไม่ระบุกลุ่มลูกค้า", "customer_group", "unclassified")} />
              </div>
            </SummaryPanel>

            <SummaryPanel title="Sales Grade" rate={`${pct(data.summary.salesGrades.answered, data.meta.cohortLeads)}% graded`} rateTone="text-emerald-600" value={fmt(data.summary.salesGrades.answered)} note={`Lead ที่ฝ่ายขายจัดเกรดแล้ว · ยังไม่จัดเกรด ${fmt(countOf(data.summary.salesGrades, "ungraded"))} Lead`}>
              <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
                <SummaryTile label="ยังไม่จัด" value="–" detail={fmt(countOf(data.summary.salesGrades, "ungraded"))} tone="gray" onClick={() => openDrill("ยังไม่จัด Sales Grade", "sales_grade", "ungraded")} />
                <SummaryTile label="พร้อมซื้อ" value="A" detail={fmt(countOf(data.summary.salesGrades, "A"))} tone="green" onClick={() => openDrill("Grade A · พร้อมซื้อ", "sales_grade", "A")} />
                <SummaryTile label="เปรียบเทียบ" value="B" detail={fmt(countOf(data.summary.salesGrades, "B"))} tone="blue" onClick={() => openDrill("Grade B · เปรียบเทียบ", "sales_grade", "B")} />
                <SummaryTile label="พิจารณา" value="C" detail={fmt(countOf(data.summary.salesGrades, "C"))} tone="amber" onClick={() => openDrill("Grade C · พิจารณา", "sales_grade", "C")} />
                <SummaryTile label="ยังไม่พร้อม" value="D" detail={fmt(countOf(data.summary.salesGrades, "D"))} tone="amber" onClick={() => openDrill("Grade D · ยังไม่พร้อม", "sales_grade", "D")} />
                <SummaryTile label="หาข้อมูล" value="E" detail={fmt(countOf(data.summary.salesGrades, "E"))} tone="gray" onClick={() => openDrill("Grade E · หาข้อมูล", "sales_grade", "E")} />
                <SummaryTile label="ไม่สนใจ" value="F" detail={fmt(countOf(data.summary.salesGrades, "F"))} tone="rose" onClick={() => openDrill("Grade F · ไม่สนใจ", "sales_grade", "F")} />
              </div>
            </SummaryPanel>

            <SummaryPanel title="ระยะเวลาในการตัดสินใจ" rate={`${pct(data.sections.decision.timeline.answered, data.meta.cohortLeads)}% answered`} rateTone="text-orange-600" value={`${fmt(data.sections.decision.timeline.answered)} / ${fmt(data.meta.cohortLeads)}`} note={`Lead ที่ตอบระยะเวลาตัดสินใจ · ยังไม่ตอบ ${fmt(data.meta.cohortLeads - data.sections.decision.timeline.answered)} Lead`}>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <SummaryTile label="1–3 เดือน" value={fmt(countOf(data.sections.decision.timeline, "1-3m"))} tone="green" onClick={() => openDrill("ตัดสินใจภายใน 1–3 เดือน", "decision_timeline", "1-3m")} />
                <SummaryTile label="ภายใน 6 เดือน" value={fmt(countOf(data.sections.decision.timeline, "6m"))} tone="blue" onClick={() => openDrill("ตัดสินใจภายใน 6 เดือน", "decision_timeline", "6m")} />
                <SummaryTile label="มากกว่า 1 ปี" value={fmt(countOf(data.sections.decision.timeline, "1y+"))} tone="amber" onClick={() => openDrill("ตัดสินใจมากกว่า 1 ปี", "decision_timeline", "1y+")} />
                <SummaryTile label="อื่นๆ" value={fmt(countOf(data.sections.decision.timeline, "other"))} tone="violet" onClick={() => openDrill("ระยะเวลาตัดสินใจอื่นๆ", "decision_timeline", "other")} />
                <SummaryTile label="ยังไม่ตอบ" value={fmt(data.meta.cohortLeads - data.sections.decision.timeline.answered)} tone="gray" onClick={() => openDrill("ยังไม่ตอบระยะเวลาตัดสินใจ", "decision_timeline", "unanswered")} />
              </div>
            </SummaryPanel>
          </div>
          </ReportGroup>

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
  className, data, projectId, setProjectId, source, setSource, status, setStatus,
  dateFrom, setDateFrom, dateTo, setDateTo, filtersChanged, reset, loading,
}: {
  className: string;
  data: CustomerDashboardData | null;
  projectId: string; setProjectId: (value: string) => void;
  source: string; setSource: (value: string) => void;
  status: string; setStatus: (value: string) => void;
  dateFrom: string; setDateFrom: (value: string) => void;
  dateTo: string; setDateTo: (value: string) => void;
  filtersChanged: boolean; reset: () => void; loading: boolean;
}) {
  const controlClass = "h-8 px-2 rounded-lg bg-white border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-gray-300";
  return <div className={`${className} items-center gap-1 text-xs text-gray-500`}>
    <select value={projectId} onChange={e => setProjectId(e.target.value)} className={`${controlClass} w-36`} title="เลือกโครงการ">
      <option value="">ทุกโครงการ</option>{data?.filters.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
    </select>
    <select value={source} onChange={e => setSource(e.target.value)} className={`${controlClass} w-28`} title="เลือก Source">
      <option value="">ทุก Source</option>{data?.filters.sources.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
    <select value={status} onChange={e => setStatus(e.target.value)} className={`${controlClass} w-28`} title="เลือกสถานะ">
      <option value="">ทุกสถานะ</option>{data?.filters.statuses.map(item => <option key={item} value={item}>{STATUS_CONFIG[item]?.label || item}</option>)}
    </select>
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

function FilterBanner({ from, to, project, source, status }: { from: string; to: string; project?: string; source?: string; status?: string }) {
  const thai = (value: string) => { if (!value) return "—"; const [y, m, d] = value.split("-"); return `${d}/${m}/${Number(y) + 543}`; };
  return <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 flex items-center gap-2 flex-wrap"><span className="font-semibold text-gray-500 uppercase tracking-wider">Filter</span><span className="font-mono">{thai(from)} – {thai(to)}</span>{project && <><span className="text-gray-300">·</span><span>{project}</span></>}{source && <><span className="text-gray-300">·</span><span>{source}</span></>}{status && <><span className="text-gray-300">·</span><span>{status}</span></>}</div>;
}

function SummaryPanel({ title, rate, rateTone, value, note, children }: { title: string; rate: string; rateTone: string; value: string; note: string; children: React.ReactNode }) {
  return <section className="rounded-2xl bg-white border border-gray-200 p-4 min-w-0 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{title}</div><div className={`text-xs font-bold shrink-0 ${rateTone}`}>{rate}</div></div>
    <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 mt-1">{value}</div>
    <div className="text-xxs text-gray-400 mt-0.5">{note}</div>
    <div className="mt-2">{children}</div>
  </section>;
}

type SummaryTone = "gray" | "blue" | "green" | "violet" | "amber" | "rose";
const SUMMARY_TONES: Record<SummaryTone, { box: string; value: string; label: string; detail: string }> = {
  gray: { box: "bg-gray-200", value: "text-slate-700", label: "text-slate-600", detail: "text-slate-400" },
  blue: { box: "bg-sky-50", value: "text-sky-700", label: "text-sky-700", detail: "text-sky-500" },
  green: { box: "bg-emerald-600", value: "text-white", label: "text-white", detail: "text-emerald-100" },
  violet: { box: "bg-indigo-50", value: "text-indigo-600", label: "text-indigo-600", detail: "text-indigo-400" },
  amber: { box: "bg-amber-50", value: "text-amber-600", label: "text-amber-600", detail: "text-amber-400" },
  rose: { box: "bg-rose-50", value: "text-rose-600", label: "text-rose-600", detail: "text-rose-400" },
};

function SummaryTile({ label, value, detail, tone, onClick }: { label: string; value: string; detail?: string; tone: SummaryTone; onClick?: () => void }) {
  const colors = SUMMARY_TONES[tone];
  const content = <><span className={`text-xl font-bold font-mono tabular-nums ${colors.value}`}>{value}</span><span className={`text-xxs mt-1 leading-tight text-center ${colors.label}`}>{label}</span>{detail && <span className={`text-xxs mt-0.5 font-mono ${colors.detail}`}>{detail}</span>}</>;
  const className = `min-w-0 min-h-14 rounded-lg px-2 py-1 flex flex-col items-center justify-center ${colors.box}`;
  return onClick
    ? <button type="button" onClick={onClick} className={`cursor-pointer ${className} hover:ring-2 hover:ring-gray-200 transition-shadow`}>{content}</button>
    : <div className={className}>{content}</div>;
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

function DrilldownModal({ state, onClose }: { state: NonNullable<DrillState>; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}><div role="dialog" aria-modal="true" aria-label={state.title} className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between p-4 border-b border-gray-200"><h3 className="text-lg font-bold text-gray-900">{state.title} <span className="text-base font-normal text-gray-500">({state.loading ? "…" : state.rows.length})</span></h3><button type="button" aria-label="ปิดหน้าต่าง" onClick={onClose} className="cursor-pointer w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 text-xl">×</button></div><div className="overflow-auto divide-y divide-gray-100">{state.loading ? <div className="py-12 grid place-items-center"><span className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" /></div> : state.error ? <div className="text-center py-10 text-red-500 text-sm">{state.error}</div> : !state.rows.length ? <div className="text-center py-10 text-gray-400 text-sm">ไม่มีรายการ</div> : state.rows.map(row => { const cfg = STATUS_CONFIG[row.status]; return <LeadLink key={row.id} id={row.id} className="cursor-pointer flex items-center gap-3 px-4 py-3 hover:bg-gray-50"><div className="w-9 h-9 rounded-full bg-gray-100 grid place-items-center text-gray-600 font-bold">{row.full_name.charAt(0)}</div><div className="flex-1 min-w-0"><div className="text-sm font-semibold text-gray-900 truncate">{row.full_name}</div><div className="text-xs text-gray-400 truncate">ID {row.id} · บ้าน {row.house_number || "—"} · {row.project_name || "ไม่ระบุโครงการ"}</div><div className="text-xs text-sky-700 truncate mt-0.5">{row.answer}</div></div><span className={`text-xxs font-semibold rounded-md px-2 py-1 ${cfg?.bg || "bg-gray-100"} ${cfg?.text || "text-gray-600"}`}>{cfg?.label || row.status}</span></LeadLink>; })}</div><div className="px-4 py-2 text-center text-xxs text-gray-400 border-t">คลิกชื่อเพื่อเปิด Lead Detail ในแท็บใหม่</div></div></div>;
}
