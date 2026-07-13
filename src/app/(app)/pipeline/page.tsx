"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";
import LeadCard, { type LeadData } from "@/components/lead/LeadCard";
import { useActiveRoles, hasRole } from "@/lib/roles";

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
  order_total_count?: number | null;
}

type TabKey = "all" | "pre_survey" | "booking" | "survey" | "quotation" | "order" | "deposit" | "wait_install" | "install" | "installing" | "warranty" | "gridtie" | "lost";

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
  if (key === "order") return l.status === "order" && (l.order_paid_count ?? 0) === 0;
  if (key === "deposit") return l.status === "order" && (l.order_paid_count ?? 0) >= 1;
  // "รอนัดติดตั้ง" — paid the deposit but no install date scheduled yet.
  // Status not gated (could be order or install) but we exclude lost.
  if (key === "wait_install") return (l.order_paid_count ?? 0) > 0 && !l.install_date && !l.install_completed_at && l.status !== "lost" && l.status !== "returned";
  // "Done" statuses match dashboard's stepDoneRows — once a lead moves into
  // warranty/gridtie/closed it belongs to the warranty/done section, not here.
  //
  // Final-installment requirement: a lead only shows in "รอติดตั้ง" /
  // "กำลังติดตั้ง" once ALL installments are confirmed paid, not just the
  // deposit. order_total_count comes from /api/leads (count of payment rows
  // under slip_field LIKE 'order_installment_%'); the install tabs gate on
  // paid_count >= total_count so the final-installment receipt is the entry
  // ticket. Leads stuck mid-payment fall back to the "ชำระมัดจำ" tab.
  const totalCount = l.order_total_count ?? 0;
  const paidCount = l.order_paid_count ?? 0;
  const allPaid = totalCount > 0 && paidCount >= totalCount;
  const installScheduled = allPaid && !!l.install_date
    && l.status !== "warranty" && l.status !== "gridtie" && l.status !== "closed"
    && l.status !== "lost" && l.status !== "returned";
  if (key === "install") return installScheduled && l.install_date!.slice(0, 10) > todayYmd;
  if (key === "installing") return installScheduled && l.install_date!.slice(0, 10) <= todayYmd;
  return l.status === key;
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const { activeRoles } = useActiveRoles();
  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar", "smartify");
  const isAdmin = hasRole(activeRoles, "admin");
  const isAccount = hasRole(activeRoles, "account");

  const [sortField, setSortField] = useState<"follow_up" | "created" | "name" | "activity" | "survey_date" | "install_date">("follow_up");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  useEffect(() => {
    const saved = localStorage.getItem("pipelineTab") as TabKey;
    const ALL_KEYS: TabKey[] = ["all","pre_survey","booking","survey","quotation","order","deposit","wait_install","install","installing","warranty","gridtie","lost"];
    if (saved && ALL_KEYS.includes(saved)) setTab(saved);

    const sf = localStorage.getItem("pipeline.sortField");
    if (sf === "follow_up" || sf === "created" || sf === "activity" || sf === "name" || sf === "survey_date" || sf === "install_date") setSortField(sf);
    const so = localStorage.getItem("pipeline.sortOrder");
    if (so === "asc" || so === "desc") setSortOrder(so);
  }, []);
  const [search, setSearch] = useState("");

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
      setSortField("follow_up");
      localStorage.setItem("pipeline.sortField", "follow_up");
    } else if (sortField === "install_date" && tab !== "install" && tab !== "installing") {
      setSortField("follow_up");
      localStorage.setItem("pipeline.sortField", "follow_up");
    }
  }, [tab, sortField]);

  const todayYmd = new Date().toISOString().slice(0, 10);
  const filtered = sortLeads(
    leads
      .filter(l => matchesTab(l, tab, todayYmd))
      .filter(l => {
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
      })
  );

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
        tabsRight={(
          <div className="hidden md:flex items-center gap-2">
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
        )}
      />

      <div className="p-3 md:p-4">
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
