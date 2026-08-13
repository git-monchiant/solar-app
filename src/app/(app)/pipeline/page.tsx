"use client";

import { apiFetch } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import Dropdown from "@/components/ui/Dropdown";
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
  /** งวดที่ต้องจ่าย "ก่อนติดตั้ง" เท่านั้น — งวดที่ติ๊กชำระหลังติดตั้งไม่ถูกนับ */
  order_before_total_count?: number | null;
  order_before_paid_count?: number | null;
  order_before_ready_count?: number | null;
  order_ready_count?: number | null;
  order_total_count?: number | null;
  journey_step?: number | null;
  journey_sub?: number | null;
}

type TabKey = "all" | "pre_survey" | "booking" | "survey" | "quotation" | "order" | "wait_install" | "install" | "installing" | "warranty" | "gridtie" | "handover" | "lost";
type SortField = "follow_up" | "created" | "name" | "activity" | "survey_date" | "install_date";
type SortOrder = "asc" | "desc";

const TAB_KEYS: TabKey[] = ["all","pre_survey","booking","survey","quotation","order","wait_install","install","installing","warranty","gridtie","handover","lost"];
const SORT_FIELDS: SortField[] = ["follow_up", "created", "name", "activity", "survey_date", "install_date"];

// Tab = กลุ่มของ journey code ที่ persist บน leads.journey_step/journey_sub
// (กติกา: src/lib/journey-rules.mjs · design: docs/plan/20260813-01-journey-step-codes.md)
//
// install/installing ยัง split ด้วย install_date สดๆ (journey_sub 710/720 เกลี่ย
// รายคืน อาจช้าได้ ~1 วัน) และคงเงื่อนไขเงิน "งวดก่อนติดตั้งครบ" ไว้ — งานที่ยัง
// เก็บเงินไม่ครบไม่ควรขึ้นกระดานติดตั้ง (งวดที่ติ๊ก "ชำระหลังติดตั้ง" ไม่นับ
// ไม่งั้นงาน 20/80 หายจากกระดานทันทีที่นัดวัน — ตรงกับ today API)
const matchesTab = (l: Lead, key: TabKey, todayYmd: string): boolean => {
  if (key === "all") return true;
  if (key === "pre_survey") return l.journey_step === 100;
  if (key === "booking") return l.journey_step === 200;
  if (key === "survey") return l.journey_step === 300;
  if (key === "quotation") return l.journey_step === 400;
  if (key === "order") return l.journey_step === 500;
  if (key === "wait_install") return l.journey_step === 600;
  if (key === "warranty") return l.journey_step === 800;
  if (key === "gridtie") return l.journey_step === 900;
  if (key === "handover") return l.journey_step === 1000;
  if (key === "lost") return l.journey_step === 9800 || l.journey_step === 9900;
  const totalCount = l.order_total_count ?? 0;
  const beforeTotal = l.order_before_total_count ?? totalCount;
  const beforeReady = l.order_before_ready_count ?? l.order_before_paid_count ?? l.order_paid_count ?? 0;
  const gateOk = totalCount > 0 && beforeReady >= beforeTotal;
  if (key === "install") return l.journey_step === 700 && gateOk && !!l.install_date && l.install_date.slice(0, 10) > todayYmd;
  if (key === "installing") return l.journey_step === 700 && gateOk && (!l.install_date || l.install_date.slice(0, 10) <= todayYmd);
  return false;
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  // ?tab= จากเมนูโมดูล/deep link ชนะค่าที่จำไว้ — ไม่มีก็ใช้ tab ล่าสุดจาก localStorage
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "all";
    const fromUrl = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (fromUrl && TAB_KEYS.includes(fromUrl)) return fromUrl;
    const saved = localStorage.getItem("pipelineTab") as TabKey | null;
    return saved && TAB_KEYS.includes(saved) ? saved : "all";
  });
  useEffect(() => {
    const t = searchParams.get("tab") as TabKey | null;
    if (t && TAB_KEYS.includes(t)) setTab(t);
  }, [searchParams]);
  const { activeRoles } = useActiveRoles();
  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar");
  const isAdmin = hasRole(activeRoles, "admin");
  const isAccount = hasRole(activeRoles, "account");

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
  // โหมดโมดูล: left menu ทำหน้าที่เลือก tab (ผ่าน ?tab=) → ซ่อนแถบ tab แนวนอน
  // และหัวเรื่องหน้า = ชื่อเมนูที่ active (จาก hook กลาง ไม่ต้องรู้จักเมนูเอง)
  const { module: activeModule, item: activeMenuItem } = useActiveMenuItem();
  const moduleMode = !!activeModule;

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
    { key: "wait_install", label: "มัดจำแล้ว รอนัดติดตั้ง" },
    { key: "install",    label: "รอติดตั้ง" },
    { key: "installing", label: "กำลังติดตั้ง" },
    { key: "warranty",   label: "รอออกใบรับประกัน" },
    { key: "gridtie",    label: "รอขอขนานไฟ" },
    { key: "handover",   label: "ส่งมอบแล้ว" },
    { key: "lost",       label: "ยกเลิก" },
  ];
  const visible = isAdmin || isSales || isSolar || isAccount;
  const TABS = (visible ? ALL_TABS : []).map(t => ({ key: t.key, label: t.label, count: countFor(t.key) }));

  return (
    <div>
      <ListPageHeader
        title={moduleMode ? (activeMenuItem?.label ?? ALL_TABS.find(t => t.key === tab)?.label ?? "Pipeline") : "Pipeline"}
        subtitle={moduleMode ? undefined : "ALL LEADS & CUSTOMERS"}
        tabsLeft={moduleMode ? `${countFor(tab)} รายการ` : undefined}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์, โครงการ..."
        tabs={moduleMode ? [] : TABS}
        activeTab={tab}
        onTabChange={(k) => { setTab(k as TabKey); localStorage.setItem("pipelineTab", k); }}
        tabsRight={(
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">จัดเรียงข้อมูล</span>
            <Dropdown
              className="w-36"
              value={sortField}
              onChange={(v) => {
                if (!v) return;
                const s = v as typeof sortField;
                setSortField(s);
                localStorage.setItem("pipeline.sortField", s);
              }}
              options={[
                { value: "follow_up", label: "วันนัดติดตาม" },
                { value: "created", label: "วันที่สร้าง" },
                { value: "activity", label: "กิจกรรมล่าสุด" },
                ...(tab === "survey" ? [{ value: "survey_date", label: "วันที่สำรวจ" }] : []),
                ...(tab === "install" ? [{ value: "install_date", label: "วันที่ติดตั้ง" }] : []),
                { value: "name", label: "ชื่อลูกค้า" },
              ]}
            />
            <Dropdown
              className="w-32"
              value={sortOrder}
              onChange={(v) => {
                if (!v) return;
                const s = v as typeof sortOrder;
                setSortOrder(s);
                localStorage.setItem("pipeline.sortOrder", s);
              }}
              options={[
                { value: "asc", label: sortField === "name" ? "ก-ฮ" : "เก่า → ใหม่" },
                { value: "desc", label: sortField === "name" ? "ฮ-ก" : "ใหม่ → เก่า" },
              ]}
            />
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
