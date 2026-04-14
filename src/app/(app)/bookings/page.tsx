"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import LeadCard, { LeadData } from "@/components/LeadCard";
import LeadGroupList from "@/components/LeadGroupList";
import ListPageHeader from "@/components/ListPageHeader";

const BOOKING_STATUSES = ["survey", "quoted", "purchased", "installed"];

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: "all", label: "All", statuses: BOOKING_STATUSES },
  { key: "survey", label: "Survey", statuses: ["survey"] },
  { key: "quoted", label: "Quotation", statuses: ["quoted"] },
  { key: "purchased", label: "Purchased", statuses: ["purchased"] },
  { key: "installed", label: "Installed", statuses: ["installed"] },
];

export default function BookingsPage() {
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    apiFetch("/api/leads")
      .then((data: LeadData[]) => setLeads(data.filter((l) => BOOKING_STATUSES.includes(l.status))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];

  const filtered = leads.filter((l) => {
    if (!activeTab.statuses.includes(l.status)) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.full_name?.toLowerCase().includes(q) ||
      l.phone?.toLowerCase().includes(q) ||
      l.installation_address?.toLowerCase().includes(q) ||
      l.booking_number?.toLowerCase().includes(q) ||
      l.project_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <ListPageHeader
        title="Bookings"
        subtitle="Survey → Installed"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์, booking number, บ้านเลขที่..."
        tabs={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          count: leads.filter((l) => t.statuses.includes(l.status)).length,
        }))}
        activeTab={tab}
        onTabChange={setTab}
      />

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : tab === "survey" ? (
          <SurveyByDateList leads={filtered} emptyText={search ? "ไม่พบผลลัพธ์" : "ไม่มีรายการในขั้นนี้"} />
        ) : (
          <LeadGroupList
            leads={filtered}
            statuses={activeTab.statuses}
            emptyText={search ? "ไม่พบผลลัพธ์" : "ไม่มีรายการในขั้นนี้"}
            emptyHint={search ? "ลองคำค้นหาอื่น" : undefined}
          />
        )}
      </div>
    </div>
  );
}

const TIME_SLOT_ORDER: Record<string, number> = { morning: 0, afternoon: 1 };
const TIME_SLOT_LABEL: Record<string, string> = {
  morning: "09:00 - 12:00",
  afternoon: "13:00 - 16:00",
};

function SurveyByDateList({ leads, emptyText }: { leads: LeadData[]; emptyText: string }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);

  // Sort leads: with survey_date first (chronological), then by time slot, then no-date
  const sorted = [...leads].sort((a, b) => {
    if (!a.survey_date && !b.survey_date) return 0;
    if (!a.survey_date) return 1;
    if (!b.survey_date) return -1;
    const dateCmp = a.survey_date.localeCompare(b.survey_date);
    if (dateCmp !== 0) return dateCmp;
    return (TIME_SLOT_ORDER[a.survey_time_slot ?? ""] ?? 99) - (TIME_SLOT_ORDER[b.survey_time_slot ?? ""] ?? 99);
  });

  // Group by date key
  const groups: { key: string; label: string; leads: LeadData[] }[] = [];
  for (const l of sorted) {
    const key = l.survey_date ? l.survey_date.slice(0, 10) : "no-date";
    let group = groups.find(g => g.key === key);
    if (!group) {
      let label: string;
      if (key === "no-date") label = "ไม่ระบุวัน";
      else if (key === todayKey) label = "Survey Today";
      else if (key < todayKey) label = `Overdue · ${formatGroupDate(key)}`;
      else label = `Survey · ${formatGroupDate(key)}`;
      group = { key, label, leads: [] };
      groups.push(group);
    }
    group.leads.push(l);
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">{emptyText}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(g => {
        const isToday = g.key === todayKey;
        const isOverdue = g.key !== "no-date" && g.key < todayKey;
        const headerColor = isToday ? "text-active" : isOverdue ? "text-red-600" : "text-gray-500";
        const pillColor = isToday ? "text-active bg-active-light" : isOverdue ? "text-red-600 bg-red-50" : "text-gray-600 bg-gray-100";
        return (
          <section key={g.key}>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className={`text-xs font-bold tracking-wider uppercase ${headerColor}`}>{g.label}</h2>
              <span className={`text-xs font-semibold ${pillColor} px-2 py-0.5 rounded-full`}>{g.leads.length}</span>
            </div>
            <div className="space-y-3">
              {g.leads.map(l => <LeadCard key={l.id} lead={l} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function formatGroupDate(iso: string) {
  return new Date(iso).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
}
