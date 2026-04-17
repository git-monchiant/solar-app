"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, useCallback } from "react";
import ListPageHeader from "@/components/ListPageHeader";
import LeadCard, { type LeadData } from "@/components/LeadCard";
import NewLeadModal from "@/components/NewLeadModal";
import { useActiveRoles, hasRole } from "@/lib/roles";

interface Lead {
  id: number;
  full_name: string;
  phone: string;
  project_name: string;
  installation_address: string;
  status: string;
  source: string;
  contact_date: string;
  created_at: string;
  survey_date: string | null;
  next_follow_up: string | null;
  package_name: string | null;
  package_price: number | null;
  booking_number: string | null;
}

type TabKey = "all" | "pre_survey" | "survey" | "quotation" | "order" | "install" | "warranty" | "gridtie" | "closed" | "lost";

const TAB_STATUSES: Record<TabKey, string[]> = {
  all: [],
  pre_survey: ["register", "booked"],
  survey: ["survey"],
  quotation: ["quote"],
  order: ["order"],
  install: ["install"],
  warranty: ["warranty"],
  gridtie: ["gridtie"],
  closed: ["closed"],
  lost: ["lost"],
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("all");
  const { activeRoles } = useActiveRoles();
  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar");
  const isAdmin = hasRole(activeRoles, "admin");

  useEffect(() => {
    const saved = localStorage.getItem("pipelineTab") as TabKey;
    if (saved && TAB_STATUSES[saved] !== undefined) setTab(saved);
  }, []);
  const [search, setSearch] = useState("");
  const [showNewLead, setShowNewLead] = useState(false);

  const fetchLeads = useCallback(() => {
    apiFetch("/api/leads").then(setLeads).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const filtered = leads
    .filter(l => {
      if (tab === "all") return true;
      return TAB_STATUSES[tab].includes(l.status);
    })
    .filter(l => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return l.full_name?.toLowerCase().includes(q) || l.phone?.includes(q) || l.project_name?.toLowerCase().includes(q) || l.installation_address?.toLowerCase().includes(q);
    });

  const countFor = (key: TabKey) => key === "all" ? leads.length : leads.filter(l => TAB_STATUSES[key].includes(l.status)).length;

  const ALL_TABS: { key: TabKey; label: string; roles: ("sales" | "solar")[] }[] = [
    { key: "all",        label: "ทั้งหมด",           roles: ["sales", "solar"] },
    { key: "pre_survey", label: "รอติดตาม",          roles: ["sales"] },
    { key: "survey",     label: "สำรวจหน้างาน",      roles: ["solar"] },
    { key: "quotation",  label: "รอใบเสนอราคา",      roles: ["solar"] },
    { key: "order",      label: "รออนุมัติ/ชำระ",    roles: ["sales"] },
    { key: "install",    label: "กำลังติดตั้ง",      roles: ["solar"] },
    { key: "warranty",   label: "ออกใบรับประกัน",    roles: ["solar"] },
    { key: "gridtie",    label: "ขอขนานไฟ",          roles: ["solar"] },
    { key: "closed",     label: "ติดตั้งเรียบร้อย",  roles: ["sales", "solar"] },
    { key: "lost",       label: "ยกเลิก",            roles: ["sales"] },
  ];
  const TABS = ALL_TABS
    .filter(t => isAdmin || t.roles.some(r => (r === "sales" && isSales) || (r === "solar" && isSolar)))
    .map(t => ({ key: t.key, label: t.label, count: countFor(t.key) }));

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
        actionLabel="+ New Lead"
        onAction={() => setShowNewLead(true)}
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

      {showNewLead && (
        <NewLeadModal onClose={() => setShowNewLead(false)} onCreated={fetchLeads} />
      )}
    </div>
  );
}
