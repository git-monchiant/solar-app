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
  next_follow_up: string | null;
  package_name: string | null;
  package_price: number | null;
  pre_doc_no: string | null;
  payment_confirmed?: boolean | number | null;
  assigned_name: string | null;
}

type TabKey = "all" | "pre_survey" | "booking" | "survey" | "quotation" | "order" | "install" | "warranty" | "gridtie" | "closed" | "lost";

// Booking = pre_survey lead ที่กดยืนยันการชำระเงิน 1 หรือ 2 แล้ว
// (status เป็น pre_survey-01 หรือ pre_survey-02). plain `pre_survey` =
// ก่อนกดยืนยัน 1 → ไป tab "รอติดตาม" ตามปกติ
const matchesTab = (l: Lead, key: TabKey): boolean => {
  if (key === "all") return true;
  if (key === "pre_survey") return l.status === "pre_survey";
  if (key === "booking") return l.status === "pre_survey-01" || l.status === "pre_survey-02";
  if (key === "lost") return l.status === "lost" || l.status === "returned";
  if (key === "quotation") return l.status === "quote";
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

  useEffect(() => {
    const saved = localStorage.getItem("pipelineTab") as TabKey;
    const ALL_KEYS: TabKey[] = ["all","pre_survey","booking","survey","quotation","order","install","warranty","gridtie","closed","lost"];
    if (saved && ALL_KEYS.includes(saved)) setTab(saved);
  }, []);
  const [search, setSearch] = useState("");

  const fetchLeads = useCallback(() => {
    apiFetch("/api/leads").then(setLeads).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // For survey/install tabs, sort by the scheduled appointment date ascending so
  // the upcoming jobs appear first (nulls at the end). Other tabs keep the
  // API's default ordering.
  const sortByApptDate = (field: "survey_date" | "install_date") =>
    (a: Lead, b: Lead) => {
      const av = a[field] ? String(a[field]).slice(0, 10) : "";
      const bv = b[field] ? String(b[field]).slice(0, 10) : "";
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv);
    };

  const filtered = leads
    .filter(l => matchesTab(l, tab))
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
    .sort(tab === "survey" ? sortByApptDate("survey_date") : tab === "install" ? sortByApptDate("install_date") : () => 0);

  const countFor = (key: TabKey) => key === "all" ? leads.length : leads.filter(l => matchesTab(l, key)).length;

  // Sales + solar both see the full pipeline. Tab visibility used to gate by
  // role, but the team wanted shared visibility into every stage.
  const ALL_TABS: { key: TabKey; label: string }[] = [
    { key: "all",        label: "ทั้งหมด" },
    { key: "pre_survey", label: "รอติดตาม" },
    { key: "booking",    label: "รายการจอง" },
    { key: "survey",     label: "สำรวจหน้างาน" },
    { key: "quotation",  label: "รอใบเสนอราคา" },
    { key: "order",      label: "รออนุมัติ/ชำระ" },
    { key: "install",    label: "ติดตั้ง" },
    { key: "warranty",   label: "รอออกใบรับประกัน" },
    { key: "gridtie",    label: "ขอขนานไฟ" },
    { key: "closed",     label: "ส่งมอบแล้ว" },
    { key: "lost",       label: "ยกเลิกและส่งกลับ" },
  ];
  const visible = isAdmin || isSales || isSolar;
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
