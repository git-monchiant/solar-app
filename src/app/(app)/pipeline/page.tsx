"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";
import LeadCard, { type LeadData } from "@/components/lead/LeadCard";
import { useActiveRoles, hasRole } from "@/lib/roles";
import SlaFilterChips from "@/components/sla/SlaFilterChips";
import SlaSubFilter, { SLA_SUB_SELECT_CLASS } from "@/components/sla/SlaSubFilter";
import { slaPolicyOrder, slaTaskLabel } from "@/lib/sla-display";
import {
  matchesSlaStatus,
  parseSlaFilters,
  slaFilterKeyOf,
  toggleSlaFilter,
  type SlaFilterKey,
  type SlaStatusKey,
} from "@/lib/sla-filter";

interface Lead {
  id: number;
  full_name: string;
  phone: string;
  email: string | null;
  project_name: string;
  installation_address: string;
  house_number: string | null;
  status: string;
  source: string;
  note: string | null;
  contact_date: string;
  created_at: string;
  survey_date: string | null;
  install_date: string | null;
  install_completed_at?: string | null;
  next_follow_up: string | null;
  last_activity_date?: string | null;
  package_name: string | null;
  package_price: number | null;
  pre_doc_no: string | null;
  payment_confirmed?: boolean | number | null;
  assigned_name: string | null;
  order_paid_count?: number | null;
  /** งวดที่ต้องจ่าย "ก่อนติดตั้ง" เท่านั้น — งวดที่ติ๊กชำระหลังติดตั้งไม่ถูกนับ */
  order_before_total_count?: number | null;
  order_before_paid_count?: number | null;
  order_before_ready_count?: number | null;
  order_ready_count?: number | null;
  order_total_count?: number | null;
  /** งาน SLA ที่ใกล้ครบกำหนดที่สุดของ lead — /api/leads ส่งมาแค่ตัวบนสุดตัวเดียว */
  sla_status?: "active" | "warning" | "critical" | "breached" | null;
  sla_started_at?: string | null;
  sla_policy_code?: string | null;
  sla_task_name?: string | null;
  sla_owner_role?: "sales" | "solar" | null;
  sla_owner_user_id?: number | null;
  sla_owner_name?: string | null;
}

type TabKey = "all" | "pre_survey" | "booking" | "survey" | "quotation" | "order" | "deposit" | "wait_install" | "install" | "installing" | "warranty" | "gridtie" | "lost";
type SortField = "follow_up" | "created" | "name" | "activity" | "survey_date" | "install_date";
type SortOrder = "asc" | "desc";

const TAB_KEYS: TabKey[] = ["all","pre_survey","booking","survey","quotation","order","deposit","wait_install","install","installing","warranty","gridtie","lost"];
const SORT_FIELDS: SortField[] = ["follow_up", "created", "name", "activity", "survey_date", "install_date"];

// Booking = pre_survey lead ที่กดยืนยันการชำระเงิน 1 หรือ 2 แล้ว
// (status เป็น pre_survey-01 หรือ pre_survey-02). plain `pre_survey` =
// ก่อนกดยืนยัน 1 → ไป tab "รอติดตาม" ตามปกติ
//
// `todayYmd` — "YYYY-MM-DD" of today's local date, used to split install tabs:
//   install     → install_date strictly in the future (waiting for the day)
//   installing  → install_date ≤ today (day has arrived/passed but the lead
//                 still sits in the install workflow — e.g. ติดตั้งเสร็จ ticked
//                 but ส่งมอบ not yet, so the macro `status` is still "install").
// Both ignore install_completed_at and are status-agnostic except for excluding
// terminal states (warranty / lost / returned) — matches the dashboard's
// stepInstallScheduledRows / stepInstallingRows split.
const matchesTab = (l: Lead, key: TabKey, todayYmd: string): boolean => {
  if (key === "all") return true;
  if (key === "pre_survey") return l.status === "pre_survey";
  if (key === "booking") return l.status === "pre_survey-01" || l.status === "pre_survey-02";
  if (key === "lost") return l.status === "lost" || l.status === "returned";
  if (key === "quotation") return l.status === "quote";
  // Split 'order' status by paid deposit — ≥1 confirmed installment goes to
  // "ชำระมัดจำ", the rest stays in "รออนุมัติ/ชำระ".
  if (key === "order") return l.status === "order" && (l.order_ready_count ?? l.order_paid_count ?? 0) === 0;
  if (key === "deposit") return l.status === "order" && (l.order_paid_count ?? 0) >= 1;
  // "รอนัดติดตั้ง" — paid the deposit but no install date scheduled yet.
  // Status not gated (could be order or install) but we exclude lost.
  if (key === "wait_install") return ((l.order_ready_count ?? l.order_paid_count ?? 0) > 0) && !l.install_date && !l.install_completed_at && l.status !== "lost" && l.status !== "returned";
  // "Done" statuses match dashboard's stepDoneRows — once a lead moves into
  // warranty/gridtie/closed it belongs to the warranty/done section, not here.
  //
  // Install readiness: normal payments count after confirmed_at; cheque rows
  // count after cheque_received_at so Sale/Install can proceed while
  // Accounting still confirms the actual money later.
  const totalCount = l.order_total_count ?? 0;
  const paidCount = l.order_paid_count ?? 0;
  // เงื่อนไขขึ้นกระดาน = งวด "ก่อนติดตั้ง" ต้องรับเงินครบ ส่วนงวดที่ติ๊ก
  // "ชำระหลังติดตั้ง" เก็บที่ Step 05 จึงไม่นับ ไม่งั้นงาน 20/80 จะหายจาก
  // รอติดตั้ง/กำลังติดตั้ง ทันทีที่นัดวัน (ตรงกับ today API)
  const beforeTotal = l.order_before_total_count ?? totalCount;
  const beforeReady = l.order_before_ready_count ?? l.order_before_paid_count ?? paidCount;
  const allInstallReady = totalCount > 0 && beforeReady >= beforeTotal;
  const installScheduled = allInstallReady && !!l.install_date
    && l.status !== "warranty" && l.status !== "gridtie" && l.status !== "closed"
    && l.status !== "lost" && l.status !== "returned";
  if (key === "install") return installScheduled && l.install_date!.slice(0, 10) > todayYmd;
  if (key === "installing") return installScheduled && l.install_date!.slice(0, 10) <= todayYmd;
  return l.status === key;
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "all";
    const saved = localStorage.getItem("pipelineTab") as TabKey | null;
    return saved && TAB_KEYS.includes(saved) ? saved : "all";
  });
  const { activeRoles } = useActiveRoles();
  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar");
  const isAdmin = hasRole(activeRoles, "admin");
  const isAccount = hasRole(activeRoles, "account");
  // เกณฑ์เดียวกับหน้า Today — คนที่ไม่ได้ดูแลทีมไม่ต้องมีตัวกรอง "ใครรับผิดชอบ"
  const salesManagerView = activeRoles.includes("admin") || activeRoles.includes("sales_sup");
  const solarManagerView = activeRoles.includes("admin") || activeRoles.includes("solar_sup");

  const [sortField, setSortField] = useState<SortField>(() => {
    if (typeof window === "undefined") return "follow_up";
    const saved = localStorage.getItem("pipeline.sortField") as SortField | null;
    return saved && SORT_FIELDS.includes(saved) ? saved : "follow_up";
  });
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => {
    if (typeof window === "undefined") return "asc";
    return localStorage.getItem("pipeline.sortOrder") === "desc" ? "desc" : "asc";
  });
  const [search, setSearch] = useState("");
  // จำค่าไว้แบบเดียวกับ pipeline.sortField เพราะ Pipeline เป็นหน้าที่เปิดค้างทั้งวัน
  // ต่างจาก Today ที่จำใน URL เพราะใช้ส่งลิงก์หากันมากกว่า
  const [slaFilters, setSlaFilters] = useState<SlaFilterKey[]>(() => {
    if (typeof window === "undefined") return [];
    return parseSlaFilters(localStorage.getItem("pipeline.sla"));
  });

  // ตัวกรองใน popover ไม่จำข้ามรอบเหมือนชิป — เปิดหน้ามาแล้วเจอตัวกรองแคบ ๆ ที่มองไม่เห็น
  // เป็นกับดักที่แย่กว่าความสะดวกที่ได้ (หน้า Today ก็ไม่จำเหมือนกัน)
  const [slaStageFilter, setSlaStageFilter] = useState("all");
  const [slaSalesOwnerFilter, setSlaSalesOwnerFilter] = useState("all");
  const [slaSolarOwnerFilter, setSlaSolarOwnerFilter] = useState("all");

  const onToggleSla = (key: SlaFilterKey) => {
    const next = toggleSlaFilter(slaFilters, key);
    setSlaFilters(next);
    localStorage.setItem("pipeline.sla", next.join(","));
    // ไม่มีสถานะไหนถูกเลือก = ไม่มีอะไรให้กรองย่อย ล้างทิ้งไม่ให้ค้างแบบมองไม่เห็น
    if (next.length === 0 || next[0] === "without") {
      setSlaStageFilter("all");
      setSlaSalesOwnerFilter("all");
      setSlaSolarOwnerFilter("all");
    }
  };

  const fetchLeads = useCallback(() => {
    apiFetch("/api/leads").then(setLeads).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // User-selected sort — applied across all tabs, overrides API default order.
  // วันนัดติดตาม fallback ใช้ activity ล่าสุด เพื่อให้ section ที่ไม่มี follow_up
  // (survey/quote/install) ยัง sort เห็นผล
  const sortLeads = (arr: Lead[]): Lead[] => {
    const dir = sortOrder === "asc" ? 1 : -1;
    const ts = (v: string | null | undefined, fb: number) => v ? new Date(v).getTime() : fb;
    return [...arr].sort((a, b) => {
      if (sortField === "name") {
        return (a.full_name || "").localeCompare(b.full_name || "", "th") * dir;
      }
      const fb = sortOrder === "asc" ? Number.POSITIVE_INFINITY : 0;
      const av =
        sortField === "follow_up" ? ts(a.next_follow_up ?? a.last_activity_date, fb)
        : sortField === "created" ? ts(a.created_at, fb)
        : sortField === "survey_date" ? ts(a.survey_date, fb)
        : sortField === "install_date" ? ts(a.install_date, fb)
        : ts(a.last_activity_date, fb);
      const bv =
        sortField === "follow_up" ? ts(b.next_follow_up ?? b.last_activity_date, fb)
        : sortField === "created" ? ts(b.created_at, fb)
        : sortField === "survey_date" ? ts(b.survey_date, fb)
        : sortField === "install_date" ? ts(b.install_date, fb)
        : ts(b.last_activity_date, fb);
      return (av - bv) * dir;
    });
  };

  // Reset sort field when switching away from survey/install tabs so a stale
  // survey_date/install_date selection doesn't silently apply to unrelated tabs.
  useEffect(() => {
    if (sortField === "survey_date" && tab !== "survey") {
      localStorage.setItem("pipeline.sortField", "follow_up");
      queueMicrotask(() => setSortField("follow_up"));
    } else if (sortField === "install_date" && tab !== "install" && tab !== "installing") {
      localStorage.setItem("pipeline.sortField", "follow_up");
      queueMicrotask(() => setSortField("follow_up"));
    }
  }, [tab, sortField]);

  const todayYmd = new Date().toISOString().slice(0, 10);
  const matchesSearch = (l: Lead) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      l.full_name?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.project_name?.toLowerCase().includes(q) ||
      l.installation_address?.toLowerCase().includes(q) ||
      l.house_number?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.source?.toLowerCase().includes(q) ||
      l.note?.toLowerCase().includes(q) ||
      l.assigned_name?.toLowerCase().includes(q) ||
      l.pre_doc_no?.toLowerCase().includes(q)
    );
  };

  // ตัวเลขบนชิปต้องเป็น "จำนวนที่จะเห็นจริงเมื่อกด" จึงนับหลังกรองแท็บกับคำค้นแล้ว
  // แต่ก่อนกรอง SLA ไม่งั้นพอติ๊กปุ่มหนึ่ง ตัวเลขปุ่มที่เหลือจะกลายเป็น 0 หมด
  const tabScoped = leads.filter(l => matchesTab(l, tab, todayYmd)).filter(matchesSearch);
  const slaAvailable = leads.some(l => l.sla_status);
  const slaStatusKeys = slaFilters.filter((key): key is SlaStatusKey => key !== "without");
  const slaStatusMode = slaStatusKeys.length > 0;

  // ตัวเลือกสร้างจากรายการในแท็บก่อนกรอง SLA ตัวเลือกจึงไม่หายไปเองตอนกำลังเลือก
  const slaStageOptions = Array.from(
    tabScoped.reduce((map, l) => {
      if (l.sla_policy_code) map.set(l.sla_policy_code, slaTaskLabel(l.sla_policy_code, l.sla_task_name));
      return map;
    }, new Map<string, string>()),
    ([value, label]) => ({ value, label }),
  ).sort((a, b) => slaPolicyOrder(a.value) - slaPolicyOrder(b.value) || a.label.localeCompare(b.label, "th"));

  // แยกตามทีมเหมือน Today — "Solar ยังไม่มอบหมาย" เป็นคำถามคนละข้อกับ "Sales ยังไม่มอบหมาย"
  // ต่างจาก Today ตรงที่ไม่ยัดรายชื่อทีม Solar ทั้งทีมเข้ามา เพราะหน้านี้มอบหมายงานไม่ได้
  // คนที่ไม่มีงาน SLA เลยจะกลายเป็นตัวเลือกที่กดแล้วว่างเปล่า
  const slaOwnerOptions = (() => {
    const sales = new Map<number, string>();
    const solar = new Map<number, string>();
    for (const l of tabScoped) {
      if (!l.sla_status || !l.sla_owner_user_id || !l.sla_owner_name) continue;
      if (l.sla_owner_role === "sales") sales.set(l.sla_owner_user_id, l.sla_owner_name);
      if (l.sla_owner_role === "solar") solar.set(l.sla_owner_user_id, l.sla_owner_name);
    }
    const toOptions = (owners: Map<number, string>) => Array.from(owners, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    return { sales: toOptions(sales), solar: toOptions(solar) };
  })();

  // สลับ role กลางคันแล้วปุ่มหาย ค่าที่เลือกไว้ต้องไม่ค้างกรองอยู่แบบมองไม่เห็น
  // คิดสดตรงนี้แทนการ reset ผ่าน effect จะได้ไม่มีเฟรมที่ยังกรองด้วยค่าเก่า
  const salesOwnerFilter = salesManagerView ? slaSalesOwnerFilter : "all";
  const solarOwnerFilter = solarManagerView ? slaSolarOwnerFilter : "all";

  const slaSubFilterCount = [slaStageFilter !== "all", salesOwnerFilter !== "all", solarOwnerFilter !== "all"]
    .filter(Boolean).length;

  // ตัวกรองใน popover มีผลกับทั้งตัวเลขบนชิปและรายการที่แสดง ตัวเลขจึงยังบอกความจริง
  // Lead ที่ไม่มี SLA ปล่อยผ่าน ไม่งั้นชิป "ไม่มีงาน SLA" จะกลายเป็น 0 ทันทีที่เลือกขั้นตอน
  const matchesSlaOwner = (l: Lead, value: string, role: "sales" | "solar") => {
    if (value === "all") return true;
    if (l.sla_owner_role !== role) return false;
    if (value === "unassigned") return !l.sla_owner_user_id;
    return String(l.sla_owner_user_id ?? "") === value;
  };

  const matchesSlaSub = (l: Lead) => {
    if (!slaStatusMode || !l.sla_status) return true;
    if (slaStageFilter !== "all" && l.sla_policy_code !== slaStageFilter) return false;
    if (!matchesSlaOwner(l, salesOwnerFilter, "sales")) return false;
    if (!matchesSlaOwner(l, solarOwnerFilter, "solar")) return false;
    return true;
  };

  const slaScoped = tabScoped.filter(matchesSlaSub);
  const slaChipCounts = slaScoped.reduce((counts, l) => {
    const key = slaFilterKeyOf(l.sla_status);
    if (key) counts[key] += 1;
    return counts;
  }, { breached: 0, near_due: 0, active: 0, without: 0 } as Record<SlaFilterKey, number>);

  const filtered = sortLeads(slaScoped.filter(l => {
    if (slaFilters.length === 0) return true;
    // normalizeSlaFilters การันตีว่า "ไม่มีงาน SLA" อยู่ตัวเดียวเสมอ
    if (slaFilters.includes("without")) return !l.sla_status;
    return matchesSlaStatus(l.sla_status, slaStatusKeys);
  }));

  const countFor = (key: TabKey) => key === "all" ? leads.length : leads.filter(l => matchesTab(l, key, todayYmd)).length;

  // Sales + solar both see the full pipeline. Tab visibility used to gate by
  // role, but the team wanted shared visibility into every stage.
  const ALL_TABS: { key: TabKey; label: string }[] = [
    { key: "all",        label: "ทั้งหมด" },
    { key: "pre_survey", label: "รอติดตาม" },
    { key: "booking",    label: "รายการจอง" },
    { key: "survey",     label: "รอสำรวจ" },
    { key: "quotation",  label: "รอใบเสนอราคา" },
    { key: "order",      label: "รอเสนอลูกค้า" },
    { key: "deposit",    label: "ชำระมัดจำ" },
    { key: "wait_install", label: "รอนัดติดตั้ง" },
    { key: "install",    label: "รอติดตั้ง" },
    { key: "installing", label: "กำลังติดตั้ง" },
    { key: "warranty",   label: "รอออกใบรับประกัน" },
    { key: "gridtie",    label: "ขอขนานไฟ" },
    { key: "lost",       label: "ยกเลิก" },
  ];
  const visible = isAdmin || isSales || isSolar || isAccount;
  const TABS = (visible ? ALL_TABS : []).map(t => ({ key: t.key, label: t.label, count: countFor(t.key) }));

  return (
    <div>
      <ListPageHeader
        title="Pipeline"
        subtitle="ALL LEADS & CUSTOMERS"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์, โครงการ..."
        tabs={TABS}
        activeTab={tab}
        onTabChange={(k) => { setTab(k as TabKey); localStorage.setItem("pipelineTab", k); }}
      />

      <div className="p-3 md:p-4">
        {/* ทั้งแถวอยู่ในตัวหน้า ไม่ใช่ tabsRight — tabsRight ซ่อนบนจอแคบ ติ๊กไว้แล้วจะปลดไม่ได้
            และแถวแท็บ 13 ปุ่มก็ไม่เหลือที่ให้ยืน · ปุ่มเรียงย้ายลงมาด้วย จะได้ไม่เบียดแท็บ
            และใช้ได้บนมือถือด้วย (เดิมซ่อนทิ้งไปเลย) */}
        <div className="mb-3 flex flex-wrap items-center gap-2 px-1">
          {slaAvailable && (
            <SlaFilterChips
              filters={slaFilters}
              counts={slaChipCounts}
              onToggle={onToggleSla}
              trailing={slaStatusMode && (
                <SlaSubFilter count={slaSubFilterCount}>
                  <select
                    aria-label="กรองตามขั้นตอน SLA"
                    value={slaStageFilter}
                    onChange={(e) => setSlaStageFilter(e.target.value)}
                    className={SLA_SUB_SELECT_CLASS}
                  >
                    <option value="all">ทุกขั้นตอน SLA</option>
                    {slaStageOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {salesManagerView && (
                    <select
                      aria-label="กรองผู้รับผิดชอบ Sales"
                      value={slaSalesOwnerFilter}
                      onChange={(e) => {
                        setSlaSalesOwnerFilter(e.target.value);
                        if (e.target.value !== "all") setSlaSolarOwnerFilter("all");
                      }}
                      className={SLA_SUB_SELECT_CLASS}
                    >
                      <option value="all">Sales ทุกคน</option>
                      <option value="unassigned">Sales ยังไม่มอบหมาย</option>
                      {slaOwnerOptions.sales.map(owner => (
                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                      ))}
                    </select>
                  )}
                  {solarManagerView && (
                    <select
                      aria-label="กรองผู้รับผิดชอบ Solar"
                      value={slaSolarOwnerFilter}
                      onChange={(e) => {
                        setSlaSolarOwnerFilter(e.target.value);
                        if (e.target.value !== "all") setSlaSalesOwnerFilter("all");
                      }}
                      className={SLA_SUB_SELECT_CLASS}
                    >
                      <option value="all">Solar ทุกคน</option>
                      <option value="unassigned">Solar ยังไม่มอบหมาย</option>
                      {slaOwnerOptions.solar.map(owner => (
                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                      ))}
                    </select>
                  )}
                </SlaSubFilter>
              )}
            />
          )}
          <div className="ml-auto flex items-center gap-2">
            <select
              value={sortField}
              onChange={(e) => {
                const v = e.target.value as typeof sortField;
                setSortField(v);
                localStorage.setItem("pipeline.sortField", v);
              }}
              className="h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-xxs font-medium text-gray-700 focus:outline-none focus:border-gray-400"
            >
              <option value="follow_up">วันนัดติดตาม</option>
              <option value="created">วันที่สร้าง</option>
              <option value="activity">กิจกรรมล่าสุด</option>
              {tab === "survey" && <option value="survey_date">วันที่สำรวจ</option>}
              {tab === "install" && <option value="install_date">วันที่ติดตั้ง</option>}
              <option value="name">ชื่อลูกค้า</option>
            </select>
            <select
              value={sortOrder}
              onChange={(e) => {
                const v = e.target.value as typeof sortOrder;
                setSortOrder(v);
                localStorage.setItem("pipeline.sortOrder", v);
              }}
              className="h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-xxs font-medium text-gray-700 focus:outline-none focus:border-gray-400"
            >
              <option value="asc">{sortField === "name" ? "ก-ฮ" : "เก่า → ใหม่"}</option>
              <option value="desc">{sortField === "name" ? "ฮ-ก" : "ใหม่ → เก่า"}</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">ไม่พบรายการ</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(l => (
              <LeadCard key={l.id} lead={l as unknown as LeadData} />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
