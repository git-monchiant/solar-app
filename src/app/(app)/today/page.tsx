"use client";
import { CheckIcon, PlusIcon } from "@/components/ui/icons";

import { apiFetch } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOpenLead } from "@/lib/hooks/useOpenLead";
import BaseLeadCard, { LeadData } from "@/components/lead/LeadCard";
import TodaySlaFooter, { type TodaySlaItem, type TodaySlaSolarUser, type TodaySlaStatus } from "@/components/sla/TodaySlaFooter";
import { slaTaskLabel } from "@/lib/sla-display";
import ListPageHeader from "@/components/layout/ListPageHeader";
import NewLeadModal from "@/components/modal/NewLeadModal";
import ChannelPickerModal from "@/components/shared/ChannelPickerModal";
import type { ChannelValue } from "@/lib/constants/channels";
import { useActiveRoles, hasRole, useMe } from "@/lib/roles";
import EventCalendarList from "@/components/calendar/EventCalendarList";

interface TodayData {
  newLeads: LeadData[];
  overduePreSurvey: LeadData[];
  followUpToday: LeadData[];
  followUpOverdue: LeadData[];
  followUpUpcoming: LeadData[];
  surveyToday: LeadData[];
  surveyPending: LeadData[];
  quotationPending: LeadData[];
  installPending: LeadData[];
  waitInstall: LeadData[];
  installScheduled: LeadData[];
  warranty: LeadData[];
  recentlyClosed: LeadData[];
  booking: LeadData[];
  stats: { pipeline: number; won: number; lost: number; new_this_week: number };
}

type TodayTab = "sales_all" | "sales" | "booking" | "quote" | "deposit_paid" | "sales_wait_install" | "sales_solar" | "solar" | "solar_survey" | "solar_quote" | "solar_wait_install" | "solar_install" | "solar_installing" | "solar_warranty" | "solar_gridtie" | "calendar";

type SlaFilterKey = "breached" | "near_due" | "active" | "without";
type SlaStatusKey = Exclude<SlaFilterKey, "without">;

type SlaDashboardData = {
  counts: Record<TodaySlaStatus, number>;
  leadCounts: Record<TodaySlaStatus, number> & { near_due: number };
  items: TodaySlaItem[];
};

// เรียงตามความเร่งด่วน ใช้ทั้งลำดับปุ่มบนจอและลำดับค่าใน URL จะได้ลิงก์คงที่
const SLA_FILTER_ORDER: SlaFilterKey[] = ["breached", "near_due", "active", "without"];

const SLA_CHIPS: { key: SlaFilterKey; label: string; on: string; tick: string; num: string }[] = [
  { key: "breached", label: "เกินกำหนด", on: "border-red-200 bg-red-50 text-red-700", tick: "border-red-500 bg-red-500", num: "text-red-600" },
  { key: "near_due", label: "ใกล้กำหนด", on: "border-amber-200 bg-amber-50 text-amber-700", tick: "border-amber-500 bg-amber-500", num: "text-amber-600" },
  { key: "active", label: "ตามแผน", on: "border-sky-200 bg-sky-50 text-sky-700", tick: "border-sky-500 bg-sky-500", num: "text-sky-700" },
  { key: "without", label: "ไม่มีงาน SLA", on: "border-gray-300 bg-gray-100 text-gray-700", tick: "border-gray-600 bg-gray-600", num: "text-gray-500" },
];

/** "ไม่มีงาน SLA" กับสถานะอื่นอยู่ร่วมกันไม่ได้ — Lead ที่ไม่มี SLA ย่อมไม่มีสถานะ SLA */
function normalizeSlaFilters(keys: SlaFilterKey[]): SlaFilterKey[] {
  const unique = new Set(keys);
  if (unique.has("without")) return ["without"];
  return SLA_FILTER_ORDER.filter(key => unique.has(key));
}

function parseSlaFilters(value: string | null): SlaFilterKey[] {
  if (!value) return [];
  const keys: SlaFilterKey[] = [];
  for (const part of value.split(",")) {
    const key = part.trim();
    // ลิงก์เดิม ?sla=all คือ "มีงาน SLA" ซึ่งเท่ากับติ๊กครบทั้งสามสถานะ
    if (key === "all") keys.push("breached", "near_due", "active");
    else if ((SLA_FILTER_ORDER as string[]).includes(key)) keys.push(key as SlaFilterKey);
  }
  return normalizeSlaFilters(keys);
}

function matchesSlaStatus(item: TodaySlaItem, keys: SlaStatusKey[]): boolean {
  return keys.some(key => (key === "near_due"
    ? item.status === "warning" || item.status === "critical"
    : item.status === key));
}

type TodaySlaCardContextValue = {
  enabled: boolean;
  itemsByLead: Map<number, TodaySlaItem[]>;
  solarUsers: TodaySlaSolarUser[];
  currentUserId?: number;
  solarManagerView: boolean;
  solarView: boolean;
  assigningId: number | null;
  onAssignSolar: (item: TodaySlaItem, userId: number | null) => void;
};

const TodaySlaCardContext = createContext<TodaySlaCardContextValue | null>(null);

function LeadCard(props: ComponentProps<typeof BaseLeadCard>) {
  const sla = useContext(TodaySlaCardContext);
  if (!sla?.enabled) return <BaseLeadCard {...props} />;

  const items = sla.itemsByLead.get(props.lead.id) ?? [];
  const primary = items[0];
  const lead = primary ? {
    ...props.lead,
    sla_policy_code: primary.policy_code,
    sla_task_name: primary.task_name,
    sla_status: primary.status,
    sla_due_at: primary.due_at,
    // The footer collapses to the most urgent SLA, so pass the rest too - the
    // card needs all of them to tell whether one already owns the follow-up date.
    sla_items: items.map(item => ({ policy_code: item.policy_code, due_at: item.due_at })),
  } : props.lead;

  return (
    <BaseLeadCard
      {...props}
      lead={lead}
      slaFooter={items.length > 0 ? (
        <TodaySlaFooter
          items={items}
          solarUsers={sla.solarUsers}
          currentUserId={sla.currentUserId}
          solarManagerView={sla.solarManagerView}
          solarView={sla.solarView}
          assigningId={sla.assigningId}
          onAssignSolar={sla.onAssignSolar}
        />
      ) : null}
    />
  );
}

export default function TodayPage() {
  const [todayData, setTodayData] = useState<TodayData | null>(null);
  const [allLeads, setAllLeads] = useState<LeadData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TodayTab>("sales_all");
  const [search, setSearch] = useState("");
  const [zones, setZones] = useState<{ id: number; name: string; color?: string | null }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [channelPickerOpen, setChannelPickerOpen] = useState(false);
  const [pickedChannel, setPickedChannel] = useState<ChannelValue | null>(null);
  const [sortField, setSortField] = useState<"follow_up" | "created" | "name" | "activity">("follow_up");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [mineOnly, setMineOnly] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [slaFilters, setSlaFilters] = useState<SlaFilterKey[]>(() => parseSlaFilters(searchParams.get("sla")));
  const [slaSubOpen, setSlaSubOpen] = useState(false);
  const slaSubRef = useRef<HTMLSpanElement | null>(null);
  const [slaData, setSlaData] = useState<SlaDashboardData | null>(null);
  const [slaDataRoleKey, setSlaDataRoleKey] = useState("");
  const [slaError, setSlaError] = useState<string | null>(null);
  const [slaStageFilter, setSlaStageFilter] = useState("all");
  const [slaSalesOwnerFilter, setSlaSalesOwnerFilter] = useState("all");
  const [slaSolarOwnerFilter, setSlaSolarOwnerFilter] = useState("all");
  const [solarUsers, setSolarUsers] = useState<TodaySlaSolarUser[]>([]);
  const [assigningSlaId, setAssigningSlaId] = useState<number | null>(null);
  const { activeRoles } = useActiveRoles();
  const { me } = useMe();
  const slaEnabled = slaFilters.length > 0;
  const slaWithoutOnly = slaFilters[0] === "without";
  // slaStatusMode = กำลังกรองด้วย "สถานะ" จริง ๆ (ไม่ใช่ "ไม่มีงาน SLA" ซึ่งไม่มีสถานะให้กรอง)
  const slaStatusKeys = useMemo(
    () => slaFilters.filter((key): key is SlaStatusKey => key !== "without"),
    [slaFilters],
  );
  const slaStatusMode = slaStatusKeys.length > 0;
  const slaAvailable = hasRole(activeRoles, "admin", "sales", "solar");
  const activeRoleKey = activeRoles.join("|");
  const salesManagerView = activeRoles.includes("admin") || activeRoles.includes("sales_sup");
  const solarManagerView = activeRoles.includes("admin") || activeRoles.includes("solar_sup");
  const solarView = hasRole(activeRoles, "solar");

  const loadSla = useCallback(async () => {
    setSlaError(null);
    try {
      const nextData = await apiFetch("/api/sla/dashboard") as SlaDashboardData;
      setSlaData(nextData);
      setSlaDataRoleKey(activeRoleKey);
    } catch (error) {
      setSlaError(error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูล SLA ได้");
    }
  }, [activeRoleKey]);

  useEffect(() => {
    setSlaFilters(parseSlaFilters(searchParams.get("sla")));
  }, [searchParams]);

  useEffect(() => {
    if (!slaSubOpen) return;
    const close = (event: MouseEvent) => {
      if (!slaSubRef.current?.contains(event.target as Node)) setSlaSubOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [slaSubOpen]);

  useEffect(() => {
    if (!slaAvailable || loading) return;
    loadSla();
    const timer = window.setInterval(loadSla, 60_000);
    return () => window.clearInterval(timer);
  }, [activeRoleKey, loadSla, loading, slaAvailable]);

  useEffect(() => {
    if (!slaAvailable || !solarManagerView) return;
    Promise.all([
      apiFetch("/api/users?role=solar") as Promise<TodaySlaSolarUser[]>,
      apiFetch("/api/users?role=solar_sup") as Promise<TodaySlaSolarUser[]>,
    ]).then(groups => {
      const unique = new Map<number, TodaySlaSolarUser>();
      groups.flat().forEach(user => unique.set(user.id, user));
      setSolarUsers(Array.from(unique.values()).sort((a, b) => a.full_name.localeCompare(b.full_name, "th")));
    }).catch(console.error);
  }, [slaAvailable, solarManagerView]);

  useEffect(() => {
    if (!salesManagerView) setSlaSalesOwnerFilter("all");
    if (!solarManagerView) setSlaSolarOwnerFilter("all");
  }, [salesManagerView, solarManagerView]);

  const assignSolarWork = useCallback(async (item: TodaySlaItem, userId: number | null) => {
    setAssigningSlaId(item.id);
    setSlaError(null);
    try {
      await apiFetch("/api/sla/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance_id: item.id, user_id: userId }),
      });
      await loadSla();
    } catch (error) {
      setSlaError(error instanceof Error ? error.message : "มอบหมายงาน SLA ไม่สำเร็จ");
    } finally {
      setAssigningSlaId(null);
    }
  }, [loadSla]);

  const scopedSlaData = slaDataRoleKey === activeRoleKey ? slaData : null;

  const allSlaLeadIds = useMemo(
    () => new Set((scopedSlaData?.items ?? []).map(item => item.lead_id)),
    [scopedSlaData],
  );

  const slaStageOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of scopedSlaData?.items ?? []) options.set(item.policy_code, slaTaskLabel(item.policy_code, item.task_name));
    return Array.from(options, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [scopedSlaData]);

  const slaOwnerOptions = useMemo(() => {
    const sales = new Map<number, string>();
    const solar = new Map<number, string>();
    for (const item of scopedSlaData?.items ?? []) {
      if (!item.owner_user_id || !item.owner_name) continue;
      if (item.owner_role === "sales") sales.set(item.owner_user_id, item.owner_name);
      if (item.owner_role === "solar") solar.set(item.owner_user_id, item.owner_name);
    }
    for (const user of solarUsers) solar.set(user.id, user.full_name);
    const toOptions = (owners: Map<number, string>) => Array.from(owners, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    return { sales: toOptions(sales), solar: toOptions(solar) };
  }, [scopedSlaData, solarUsers]);

  const filteredSlaItems = useMemo(() => (scopedSlaData?.items ?? []).filter(item => {
    if (!slaEnabled) return true;
    if (slaStageFilter !== "all" && item.policy_code !== slaStageFilter) return false;
    if (slaSalesOwnerFilter !== "all") {
      if (item.owner_role !== "sales") return false;
      if (slaSalesOwnerFilter === "unassigned") return item.owner_user_id == null;
      if (item.owner_user_id !== Number(slaSalesOwnerFilter)) return false;
    }
    if (slaSolarOwnerFilter !== "all") {
      if (item.owner_role !== "solar") return false;
      if (slaSolarOwnerFilter === "unassigned") return item.owner_user_id == null;
      if (item.owner_user_id !== Number(slaSolarOwnerFilter)) return false;
    }
    return true;
  }), [scopedSlaData, slaEnabled, slaSalesOwnerFilter, slaSolarOwnerFilter, slaStageFilter]);

  const slaItemsByLead = useMemo(() => {
    const grouped = new Map<number, TodaySlaItem[]>();
    if (slaWithoutOnly) return grouped;
    for (const item of filteredSlaItems) {
      if (slaStatusKeys.length > 0 && !matchesSlaStatus(item, slaStatusKeys)) continue;
      const items = grouped.get(item.lead_id) ?? [];
      items.push(item);
      grouped.set(item.lead_id, items);
    }
    return grouped;
  }, [filteredSlaItems, slaStatusKeys, slaWithoutOnly]);

  // จัดกลุ่มงาน SLA ตาม Lead โดยไม่กรองสถานะ ใช้เป็นฐานนับตัวเลขบนชิป
  // ถ้านับจาก slaItemsByLead ตัวเลขของชิปที่ยังไม่ได้ติ๊กจะกลายเป็น 0 ทันทีที่ติ๊กอันแรก
  const slaItemsByLeadAll = useMemo(() => {
    const grouped = new Map<number, TodaySlaItem[]>();
    for (const item of filteredSlaItems) {
      const items = grouped.get(item.lead_id) ?? [];
      items.push(item);
      grouped.set(item.lead_id, items);
    }
    return grouped;
  }, [filteredSlaItems]);

  const slaSubFilterCount = [slaStageFilter !== "all", slaSalesOwnerFilter !== "all", slaSolarOwnerFilter !== "all"]
    .filter(Boolean).length;

  useEffect(() => {
    const savedSortField = localStorage.getItem("today.sortField");
    if (savedSortField === "follow_up" || savedSortField === "created" || savedSortField === "activity" || savedSortField === "name") {
      setSortField(savedSortField);
    }
    const savedSortOrder = localStorage.getItem("today.sortOrder");
    if (savedSortOrder === "asc" || savedSortOrder === "desc") {
      setSortOrder(savedSortOrder);
    }
    if (localStorage.getItem("today.mineOnly") === "1") setMineOnly(true);

    apiFetch("/api/zones").then(setZones).catch(console.error);

  }, []);

  // Default zone = first zone from /api/zones. Validate against current list so
  // a stale localStorage value (e.g. zone since renamed/deleted) doesn't leave
  // the calendar permanently empty.
  useEffect(() => {
    if (zones.length === 0 || selectedZone) return;
    const saved = localStorage.getItem("selectedZone");
    const valid = saved && (saved === "all" || zones.some(z => z.name === saved));
    setSelectedZone(valid ? saved! : zones[0].name);
  }, [zones, selectedZone]);

  useEffect(() => {
    const load = () => Promise.all([
      apiFetch("/api/today"),
      apiFetch("/api/leads"),
    ]).then(([t, leads]: [TodayData, LeadData[]]) => {
      setTodayData(t);
      setAllLeads(leads);
    }).catch(console.error).finally(() => setLoading(false));
    load();
    // Re-fetch when the user returns to this tab/window — e.g. they opened
    // a lead in a new tab, changed its grade, then switched back here. Without
    // this the list would show the stale snapshot until F5.
    const onFocus = () => { load(); };
    window.addEventListener("focus", onFocus);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // If saved tab no longer valid for current role, fall back to first available.
  // Skip while activeRoles is still loading (empty) — otherwise we'd downgrade a
  // valid "sales" tab to "calendar" on first render before /api/me resolves.
  useEffect(() => {
    if (activeRoles.length === 0) return;
    const isAdminish = hasRole(activeRoles, "admin", "account");
    const isSales = hasRole(activeRoles, "sales") || isAdminish;
    const isSolar = hasRole(activeRoles, "solar") || isAdminish;
    const validKeys: string[] = [];
    if (isSales) validKeys.push("sales_all", "sales", "booking", "quote", "deposit_paid", "sales_wait_install", "sales_solar");
    if (isSolar) validKeys.push("solar", "solar_survey", "solar_quote", "solar_wait_install", "solar_install", "solar_installing", "solar_warranty", "solar_gridtie");
    validKeys.push("calendar");
    if (!validKeys.includes(tab)) {
      const fallback = validKeys[0] as TodayTab;
      setTab(fallback);
    }
  }, [activeRoles, tab]);

  // Snap to today's row whenever the calendar tab becomes visible — the list
  // window starts at the 1st of the current month, so without this the user
  // lands on past dates instead of today.
  useEffect(() => {
    if (tab !== "calendar") return;
    const t = new Date();
    const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(`day-${k}`);
      if (el) { el.scrollIntoView({ behavior: "auto", block: "start" }); return; }
      if (++tries < 30) setTimeout(tick, 50);
    };
    tick();
  }, [tab]);

  if (loading || activeRoles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  // Account-only role → simplified single-tab "รอยืนยันรับเงิน" view.
  // (Sales/solar/admin see the full multi-tab Today below.)
  const accountOnly =
    hasRole(activeRoles, "account") &&
    !hasRole(activeRoles, "admin", "sales", "solar");
  if (accountOnly) {
    return <AccountTodayView leads={allLeads || []} search={search} setSearch={setSearch} />;
  }

  const raw = todayData!;

  // skipSla = ข้ามตัวกรอง SLA เพื่อดูว่าแท็บนี้มี Lead อะไรบ้าง "ก่อน" ถูกกรอง
  // ใช้เป็นขอบเขตของตัวเลขบนชิป ตัวเลขจะได้ตรงกับผลที่ได้จริงเมื่อกดในแท็บนั้น
  const filterLeads = (leads: LeadData[], skipSla = false) => {
    let out = leads;
    if (slaEnabled && !skipSla) {
      if (!scopedSlaData) return [];
      out = slaWithoutOnly
        ? out.filter(lead => !allSlaLeadIds.has(lead.id))
        : out.filter(lead => slaItemsByLead.has(lead.id));
    }
    if (mineOnly && me?.id) {
      out = slaStatusMode && !skipSla
        ? out.filter(lead => (slaItemsByLead.get(lead.id) ?? []).some(item => item.owner_user_id === me.id))
        : out.filter(lead => lead.assigned_user_id === me.id);
    }
    if (!search.trim()) return out;
    const q = search.trim().toLowerCase();
    return out.filter(l =>
      l.full_name?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.project_name?.toLowerCase().includes(q) ||
      l.installation_address?.toLowerCase().includes(q) ||
      l.house_number?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.source?.toLowerCase().includes(q) ||
      l.note?.toLowerCase().includes(q) ||
      l.assigned_name?.toLowerCase().includes(q) ||
      l.pre_doc_no?.toLowerCase().includes(q) ||
      (slaItemsByLead.get(l.id) ?? []).some(item =>
        slaTaskLabel(item.policy_code, item.task_name).toLowerCase().includes(q) ||
        item.task_name.toLowerCase().includes(q) ||
        item.policy_code.toLowerCase().includes(q) ||
        item.owner_name?.toLowerCase().includes(q)
      )
    );
  };

  const buildBuckets = (skipSla: boolean) => {
    const pick = (leads: LeadData[] | undefined) => filterLeads(leads || [], skipSla);
    const installAll = pick(raw.installPending);
    return {
      followUpOverdue: pick(raw.followUpOverdue),
      followUpToday: pick(raw.followUpToday),
      newLeads: pick(raw.newLeads),
      overduePreSurvey: pick(raw.overduePreSurvey),
      followUpUpcoming: pick(raw.followUpUpcoming),
      surveyToday: pick(raw.surveyToday),
      surveyPending: pick(raw.surveyPending),
      quotationPending: pick(raw.quotationPending),
      // Split รอเสนอราคา (no installment paid yet) from ชำระมัดจำ (≥1 confirmed)
      installPending: installAll.filter(l => (l.order_paid_count ?? 0) === 0),
      depositPaid: installAll.filter(l => (l.order_paid_count ?? 0) >= 1),
      waitInstall: pick(raw.waitInstall),
      installScheduled: pick(raw.installScheduled),
      warranty: pick(raw.warranty),
      recentlyClosed: pick(raw.recentlyClosed),
      booking: pick(raw.booking),
    };
  };

  const d = buildBuckets(false);

  const bookingCount = d.booking.length;
  // Solar เห็นเฉพาะ booking ที่จ่ายแล้ว (รอนัดสำรวจ); ส่วนที่รอชำระเป็นงาน sales
  const bookingPaidCount = d.booking.filter(l => l.payment_confirmed).length;
  // ติดตามลูกค้า tab — งานที่ sales ต้องตามวันนี้:
  // - ถึงวัน follow-up แล้ว (overdue + today) → แสดงบนสุด
  // - lead ใหม่ที่ยังไม่ได้ติดต่อ
  // installPending (รออนุมัติ/ชำระ) ไม่อยู่ที่นี่ — มี tab "เสนอราคา" แยกไว้แล้ว
  const salesCount =
    d.followUpOverdue.length +
    d.followUpToday.length +
    d.newLeads.length;
  const solarCount = bookingPaidCount + d.surveyToday.length + d.surveyPending.length + d.quotationPending.length + d.waitInstall.length + d.installScheduled.length + d.warranty.length;
  const salesSolarCount = d.quotationPending.length;

  const isSales = hasRole(activeRoles, "sales");
  const isSolar = hasRole(activeRoles, "solar");
  // Solar sub-tabs — survey/install grouped from the same data buckets the
  // ทีมโซลาร์ tab uses, so each section can be reached directly without
  // scrolling.
  const solarSurveyCount = bookingPaidCount + d.surveyToday.length + d.surveyPending.length;
  const solarQuoteCount = d.quotationPending.length;
  const solarWaitInstallCount = d.waitInstall.length;
  // Split installScheduled into "รอติดตั้ง" (วันยังไม่ถึง) vs "กำลังติดตั้ง"
  // (วันถึงแล้ว แต่ยังไม่ promote เป็น warranty) — เงื่อนไขตรงกับ pipeline.
  const todayYmd = new Date().toISOString().slice(0, 10);
  const installFuture = d.installScheduled.filter(l => !!l.install_date && l.install_date.slice(0, 10) > todayYmd);
  const installInProgress = d.installScheduled.filter(l => !!l.install_date && l.install_date.slice(0, 10) <= todayYmd);
  const solarInstallCount = installFuture.length;
  const solarInstallingCount = installInProgress.length;
  const solarWarrantyCount = d.warranty.length;
  // ใช้ชุดข้อมูลและเงื่อนไขเดียวกับ Pipeline > ขอขนานไฟ
  const solarGridtie = filterLeads(allLeads || []).filter(l => l.status === "gridtie");

  const sortLeads = (leads: LeadData[], dateField?: "survey_date" | "install_date"): LeadData[] => {
    const ts = (v: string | null | undefined, fallback: number) =>
      v ? new Date(v).getTime() : fallback;
    const arr = [...leads];
    if (slaStatusMode) {
      const priority: Record<TodaySlaStatus, number> = { breached: 0, critical: 1, warning: 2, active: 3 };
      arr.sort((a, b) => {
        const aItem = slaItemsByLead.get(a.id)?.[0];
        const bItem = slaItemsByLead.get(b.id)?.[0];
        if (!aItem || !bItem) return Number(!!bItem) - Number(!!aItem);
        return priority[aItem.status] - priority[bItem.status]
          || ts(aItem.due_at, Number.POSITIVE_INFINITY) - ts(bItem.due_at, Number.POSITIVE_INFINITY);
      });
      return arr;
    }
    // Appointment-date sort: always ASC (เลย/ใกล้กำหนดสุดอยู่บน) and ignores
    // the global dropdown — sections with นัดสำรวจ/ติดตั้ง use this hard.
    if (dateField) {
      const fallback = Number.POSITIVE_INFINITY;
      arr.sort((a, b) => ts(a[dateField], fallback) - ts(b[dateField], fallback));
      return arr;
    }
    const dir = sortOrder === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortField === "name") {
        return (a.full_name || "").localeCompare(b.full_name || "", "th") * dir;
      }
      const fallback = sortOrder === "asc" ? Number.POSITIVE_INFINITY : 0;
      // วันนัดติดตาม: fallback ใช้ activity ล่าสุด เพื่อให้ sort เห็นผลแม้ section
      // ที่ leads ไม่มี next_follow_up (survey/quote/install)
      const av =
        sortField === "follow_up" ? ts(a.next_follow_up ?? a.last_activity_date, fallback)
        : sortField === "created" ? ts(a.created_at, fallback)
        : ts(a.last_activity_date, fallback);
      const bv =
        sortField === "follow_up" ? ts(b.next_follow_up ?? b.last_activity_date, fallback)
        : sortField === "created" ? ts(b.created_at, fallback)
        : ts(b.last_activity_date, fallback);
      return (av - bv) * dir;
    });
    return arr;
  };

  const applySlaFilters = (next: SlaFilterKey[]) => {
    setSlaFilters(next);
    // ไม่มีสถานะไหนถูกเลือก = ไม่มีอะไรให้กรองย่อย ล้างทิ้งไม่ให้ค้างแบบมองไม่เห็น
    if (next.length === 0 || next[0] === "without") {
      setSlaStageFilter("all");
      setSlaSalesOwnerFilter("all");
      setSlaSolarOwnerFilter("all");
      setSlaSubOpen(false);
    }
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) params.set("sla", next.join(","));
    else params.delete("sla");
    const query = params.toString();
    router.replace(query ? `/today?${query}` : "/today", { scroll: false });
  };

  const toggleSlaFilter = (key: SlaFilterKey) => {
    if (slaFilters.includes(key)) {
      applySlaFilters(slaFilters.filter(current => current !== key));
      return;
    }
    // "ไม่มีงาน SLA" กับสถานะอื่นเลือกพร้อมกันไม่ได้ อันที่เพิ่งกดชนะ
    applySlaFilters(key === "without"
      ? ["without"]
      : normalizeSlaFilters([...slaFilters.filter(current => current !== "without"), key]));
  };

  const salesAllCount = allLeads ? filterLeads(allLeads).length : 0;

  const allTabs = [
    isSales && { key: "sales_all", label: "ทั้งหมด", count: salesAllCount },
    isSales && { key: "sales", label: "ติดตามลูกค้า", count: salesCount },
    isSales && { key: "booking", label: "รายการจอง", count: bookingCount },
    isSales && { key: "sales_solar", label: "ติดตามใบเสนอราคา", count: salesSolarCount },
    isSales && { key: "quote", label: "รอเสนอลูกค้า", count: d.installPending.length },
    isSales && { key: "deposit_paid", label: "ชำระมัดจำ", count: d.depositPaid.length },
    isSales && { key: "sales_wait_install", label: "รอนัดติดตั้ง", count: solarWaitInstallCount },
    isSolar && { key: "solar", label: "ทั้งหมด", count: solarCount },
    isSolar && { key: "solar_survey", label: "รอสำรวจ", count: solarSurveyCount },
    isSolar && { key: "solar_quote", label: "รอทำใบเสนอราคา", count: solarQuoteCount },
    isSolar && { key: "solar_wait_install", label: "รอนัดติดตั้ง", count: solarWaitInstallCount },
    isSolar && { key: "solar_install", label: "รอติดตั้ง", count: solarInstallCount },
    isSolar && { key: "solar_installing", label: "กำลังติดตั้ง", count: solarInstallingCount },
    isSolar && { key: "solar_warranty", label: "รอออกใบรับประกัน", count: solarWarrantyCount },
    isSolar && { key: "solar_gridtie", label: "ขอขนานไฟ", count: solarGridtie.length },
    { key: "calendar", label: "ปฏิทิน" },
  ].filter(Boolean) as { key: string; label: string; count?: number }[];

  // While effect re-syncs an invalid tab, render against an in-bounds key
  const visibleTab = (allTabs.some(t => t.key === tab) ? tab : (allTabs[0]?.key ?? "calendar")) as TodayTab;
  const slaCardContext: TodaySlaCardContextValue = {
    enabled: slaAvailable && scopedSlaData !== null,
    itemsByLead: slaItemsByLead,
    solarUsers,
    currentUserId: me?.id,
    solarManagerView,
    solarView,
    assigningId: assigningSlaId,
    onAssignSolar: assignSolarWork,
  };

  // Lead ที่แท็บนี้จะแสดงถ้ายังไม่กรองด้วย SLA — ต้องสะท้อนสูตรนับของแต่ละแท็บใน allTabs
  const slaScopeLeads = (() => {
    if (!slaAvailable || !scopedSlaData) return [] as LeadData[];
    const b = buildBuckets(true);
    const bookingReady = b.booking.filter(l => l.payment_confirmed);
    const scheduled = (future: boolean) => b.installScheduled.filter(l =>
      !!l.install_date && (future ? l.install_date.slice(0, 10) > todayYmd : l.install_date.slice(0, 10) <= todayYmd));
    switch (visibleTab) {
      case "sales_all": return filterLeads(allLeads || [], true);
      case "sales": return [...b.followUpOverdue, ...b.followUpToday, ...b.newLeads];
      case "booking": return b.booking;
      case "sales_solar":
      case "solar_quote": return b.quotationPending;
      case "quote": return b.installPending;
      case "deposit_paid": return b.depositPaid;
      case "sales_wait_install":
      case "solar_wait_install": return b.waitInstall;
      case "solar": return [...bookingReady, ...b.surveyToday, ...b.surveyPending, ...b.quotationPending,
        ...b.waitInstall, ...b.installScheduled, ...b.warranty];
      case "solar_survey": return [...bookingReady, ...b.surveyToday, ...b.surveyPending];
      case "solar_install": return scheduled(true);
      case "solar_installing": return scheduled(false);
      case "solar_warranty": return b.warranty;
      case "solar_gridtie": return filterLeads(allLeads || [], true).filter(l => l.status === "gridtie");
      default: return [] as LeadData[];
    }
  })();

  const slaChipCounts = (() => {
    const counts: Record<SlaFilterKey, number> = { breached: 0, near_due: 0, active: 0, without: 0 };
    // ตั้งใจนับตาม "จำนวนที่แสดง" ไม่ใช่ Lead ไม่ซ้ำ — Lead เดียวอยู่ได้หลาย section
    // ในแท็บเดียว (เช่น เลยกำหนดติดตาม + Lead ใหม่) และตัวเลขบนแท็บก็นับแบบนั้น
    // ถ้านับไม่ซ้ำ ชิปจะบอก 11 แต่กดแล้วขึ้น 13 ซึ่งผิดคำสัญญาของตัวเลข
    for (const lead of slaScopeLeads) {
      const items = slaItemsByLeadAll.get(lead.id);
      if (!items?.length) { counts.without += 1; continue; }
      // Lead เดียวมีได้หลายงาน SLA — นับเข้าทุกสถานะที่มี แต่ไม่นับซ้ำในสถานะเดียวกัน
      const statuses = new Set<SlaStatusKey>();
      for (const item of items) {
        if (item.status === "breached") statuses.add("breached");
        else if (item.status === "warning" || item.status === "critical") statuses.add("near_due");
        else if (item.status === "active") statuses.add("active");
      }
      for (const key of statuses) counts[key] += 1;
    }
    return counts;
  })();

  const renderSlaChip = (chip: (typeof SLA_CHIPS)[number]) => {
    const on = slaFilters.includes(chip.key);
    const count = slaChipCounts[chip.key];
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => toggleSlaFilter(chip.key)}
        className={`h-7 inline-flex items-center gap-1.5 rounded-full border px-2.5 text-xxs font-semibold whitespace-nowrap transition-colors ${
          on ? chip.on : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
        }`}
      >
        <span className={`w-3 h-3 rounded border-2 flex items-center justify-center ${on ? chip.tick : "border-gray-300"}`}>
          {on && <CheckIcon className="w-1.5 h-1.5 text-white" strokeWidth={4} />}
        </span>
        {chip.label}
        {/* ยังไม่ติ๊กก็ยังคุมสีของตัวเอง — กวาดตาแถวเดียวรู้ว่าสีไหนคือเรื่องด่วน ตามม็อกอัพ */}
        <span className={`font-mono tabular-nums font-bold ${on ? "" : chip.num}`}>{count.toLocaleString("th-TH")}</span>
      </button>
    );
  };

  // Keep SLA controls next to "งานของฉัน" so users can narrow urgent work
  // without leaving Today. Controls wrap on mobile instead of disappearing.
  const sortControls = (
    <div className="flex items-center gap-2 flex-wrap">
      {slaAvailable && (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-xxs font-bold uppercase tracking-wider text-gray-400">SLA</span>
          {SLA_CHIPS.map(chip => (
            <span key={chip.key} className="inline-flex items-center gap-1.5">
              {/* Lead ที่ไม่มี SLA เป็นคนละชุดกับสถานะ SLA — เส้นคั่นบอกว่าเลือกร่วมกันไม่ได้ */}
              {chip.key === "without" && <span aria-hidden className="h-5 w-px bg-gray-200" />}
              {renderSlaChip(chip)}
            </span>
          ))}
          {slaStatusMode && (
            <span className="relative inline-flex" ref={slaSubRef}>
              <button
                type="button"
                aria-expanded={slaSubOpen}
                onClick={() => setSlaSubOpen(open => !open)}
                className={`h-7 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xxs font-semibold whitespace-nowrap transition-colors ${
                  slaSubFilterCount > 0
                    ? "border-gray-800 bg-white text-gray-900"
                    : "border-dashed border-gray-300 bg-white text-gray-600 hover:border-gray-500"
                }`}
              >
                ตัวกรองย่อย
                {slaSubFilterCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-800 px-1 text-[10px] font-bold text-white">
                    {slaSubFilterCount}
                  </span>
                )}
              </button>
              {slaSubOpen && (
                <div className="absolute right-0 top-8 z-30 flex w-60 flex-col gap-1.5 rounded-lg border border-gray-300 bg-white p-2.5 text-left shadow-lg">
                  <span className="text-xxs font-bold uppercase tracking-wider text-gray-400">กรองเฉพาะ</span>
                  <select
                    aria-label="กรองตามขั้นตอน SLA"
                    value={slaStageFilter}
                    onChange={event => setSlaStageFilter(event.target.value)}
                    className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 pr-7 text-xxs font-medium text-gray-700 outline-none focus:border-gray-400"
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
                      onChange={event => {
                        setSlaSalesOwnerFilter(event.target.value);
                        if (event.target.value !== "all") setSlaSolarOwnerFilter("all");
                      }}
                      className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 pr-7 text-xxs font-medium text-gray-700 outline-none focus:border-gray-400"
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
                      onChange={event => {
                        setSlaSolarOwnerFilter(event.target.value);
                        if (event.target.value !== "all") setSlaSalesOwnerFilter("all");
                      }}
                      className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 pr-7 text-xxs font-medium text-gray-700 outline-none focus:border-gray-400"
                    >
                      <option value="all">Solar ทุกคน</option>
                      <option value="unassigned">Solar ยังไม่มอบหมาย</option>
                      {slaOwnerOptions.solar.map(owner => (
                        <option key={owner.id} value={owner.id}>{owner.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </span>
          )}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          const next = !mineOnly;
          setMineOnly(next);
          localStorage.setItem("today.mineOnly", next ? "1" : "0");
        }}
        className="h-7 ml-auto inline-flex items-center gap-1.5 px-1 text-xxs font-medium text-gray-700 cursor-pointer whitespace-nowrap"
      >
        <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${mineOnly ? "border-gray-800 bg-gray-800" : "border-gray-300"}`}>
          {mineOnly && <CheckIcon className="w-2 h-2 text-white" strokeWidth={4} />}
        </span>
        งานของฉัน
      </button>
      {slaStatusMode ? (
        <span className="hidden xl:inline text-xxs font-semibold text-gray-500">เรียงตามความเร่งด่วนของ SLA</span>
      ) : (
        <>
          <select
            value={sortField}
            onChange={(e) => {
              const v = e.target.value as typeof sortField;
              setSortField(v);
              localStorage.setItem("today.sortField", v);
            }}
            className="hidden h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-xxs font-medium text-gray-700 focus:outline-none focus:border-gray-400 md:block"
          >
            <option value="follow_up">วันนัดติดตาม</option>
            <option value="created">วันที่สร้าง</option>
            <option value="activity">กิจกรรมล่าสุด</option>
            <option value="name">ชื่อลูกค้า</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => {
              const v = e.target.value as typeof sortOrder;
              setSortOrder(v);
              localStorage.setItem("today.sortOrder", v);
            }}
            className="hidden h-7 px-2 pr-6 rounded-md border border-gray-200 bg-white text-xxs font-medium text-gray-700 focus:outline-none focus:border-gray-400 md:block"
          >
            <option value="asc">{sortField === "name" ? "ก-ฮ" : "เก่า → ใหม่"}</option>
            <option value="desc">{sortField === "name" ? "ฮ-ก" : "ใหม่ → เก่า"}</option>
          </select>
        </>
      )}
    </div>
  );

  // sales_all tab now shows ALL leads (same as Pipeline > ทั้งหมด), so count
  // matches the filtered all-leads list rather than summed today buckets.

  return (
    <TodaySlaCardContext.Provider value={slaCardContext}>
    <div>
      <ListPageHeader
        title="Today"
        subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์..."
        tabs={allTabs}
        activeTab={visibleTab}
        onTabChange={(k) => setTab(k as TodayTab)}
      />

      {/* Content */}
      <div className="p-4 space-y-5">
        {slaAvailable && slaError && visibleTab !== "calendar" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
            <span>{slaError}</span>
            <button type="button" onClick={() => loadSla()} className="ml-auto rounded-full bg-red-600 px-3 py-1 font-bold text-white">ลองใหม่</button>
          </div>
        )}
        {visibleTab !== "calendar" && (
          <div className="-mt-1 px-1">{sortControls}</div>
        )}
        {/* Sales · ทั้งหมด — เรียงตาม section เดิม + section "อื่นๆ" รวม leads
            ที่ไม่อยู่ใน bucket ใดข้างบน (เพื่อให้เห็น lead ครบทุกใบเหมือน pipeline) */}
        {visibleTab === "sales_all" && (
          <>
            {/* First section header + sort controls on a single row.
                When overdue is empty, the controls sit alone right-aligned. */}
            <div className="flex items-center justify-between mb-3 px-1 gap-3 flex-wrap">
              {d.followUpOverdue.length > 0 ? (
                <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">เลยกำหนดติดตาม</h2>
              ) : <div />}
              <div className="flex items-center gap-2">
                {d.followUpOverdue.length > 0 && (
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.followUpOverdue.length}</span>
                )}
              </div>
            </div>
            {d.followUpOverdue.length > 0 && (
              <section>
                <div className="space-y-3">{sortLeads(d.followUpOverdue).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">รอติดตาม</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.followUpToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.followUpToday).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.newLeads.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่ ยังไม่ติดต่อ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.newLeads).map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {d.booking.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{d.booking.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.booking).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.installPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-700">รอเสนอลูกค้า</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">{d.installPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.depositPaid.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">ชำระมัดจำแล้ว</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{d.depositPaid.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.depositPaid).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.waitInstall.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-orange-600">รอนัดติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{d.waitInstall.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.waitInstall).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {/* Rest of leads — anything not in the priority sections above */}
            {(() => {
              if (!allLeads) return null;
              const seen = new Set<number>([
                ...d.followUpOverdue.map(l => l.id),
                ...d.followUpToday.map(l => l.id),
                ...d.newLeads.map(l => l.id),
                ...d.booking.map(l => l.id),
                ...d.installPending.map(l => l.id),
                ...d.depositPaid.map(l => l.id),
                ...d.waitInstall.map(l => l.id),
                ...d.quotationPending.map(l => l.id),
              ]);
              const rest = filterLeads(allLeads).filter(l => !seen.has(l.id));
              if (rest.length === 0) return null;
              return (
                <section>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-xs font-bold tracking-wider uppercase text-gray-500">อื่นๆ</h2>
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{rest.length}</span>
                  </div>
                  <div className="space-y-3">{sortLeads(rest).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
                </section>
              );
            })()}
            {salesAllCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานที่ต้องดำเนินการ</div>
              </div>
            )}
          </>
        )}

        {/* Sales Tab — งานที่ต้องติดตามทั้งหมด.
         * บนสุด: ที่ถึงวัน follow-up แล้ว (overdue + today)
         * ถัดมา: lead ใหม่, รออนุมัติ/ชำระ
         * ที่ยังไม่ถึงวัน follow-up → ไปดู pipeline */}
        {visibleTab === "sales" && (
          <>
            <div className="flex items-center justify-between mb-3 px-1 gap-3 flex-wrap">
              {d.followUpOverdue.length > 0 ? (
                <h2 className="text-xs font-bold tracking-wider uppercase text-red-600">เลยกำหนดติดตาม</h2>
              ) : <div />}
              <div className="flex items-center gap-2">
                {d.followUpOverdue.length > 0 && (
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{d.followUpOverdue.length}</span>
                )}
              </div>
            </div>
            {d.followUpOverdue.length > 0 && (
              <section>
                <div className="space-y-3">{sortLeads(d.followUpOverdue).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.followUpToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">นัดติดตามวันนี้</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.followUpToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.followUpToday).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.newLeads.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-blue-600">Lead ใหม่ ยังไม่ติดต่อ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{d.newLeads.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.newLeads).map((l) => <LeadCard key={l.id} lead={l} compact />)}</div>
              </section>
            )}
            {salesCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานที่ต้องติดตาม</div>
              </div>
            )}
          </>
        )}

        {/* Booking Tab — "จอง" = จ่ายค่าสำรวจแล้ว (payment_confirmed=true)
            ยังอยู่ใน pre_survey รอนัดสำรวจ. ที่ยังไม่จ่ายจะอยู่ในแท็บ
            "ติดตามลูกค้า" ให้ sales ตามเก็บ. */}
        {visibleTab === "booking" && (
          d.booking.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
              </div>
              <div className="text-base font-semibold text-gray-900">ยังไม่มีรายการจอง</div>
              <div className="text-sm text-gray-500 mt-1">ลูกค้าที่ชำระค่าสำรวจแล้วจะปรากฏที่นี่</div>
            </div>
          ) : (
            <section>
              <div className="flex items-center justify-between mb-3 px-1">
                <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{d.booking.length}</span>
                </div>
              </div>
              <div className="space-y-3">{sortLeads(d.booking).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
            </section>
          )
        )}

        {/* Quote Tab — leads at status='order' (sales has to draft + send the
            quotation, follow up on payment). Reuses installPending data. */}
        {visibleTab === "quote" && (
          <>
            {d.installPending.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-700">รอเสนอลูกค้า</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">{d.installPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-violet-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-violet-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">ยังไม่มีรายการเสนอราคา</div>
                <div className="text-sm text-gray-500 mt-1">หลังสำรวจเสร็จและออกใบเสนอราคา จะปรากฏที่นี่</div>
              </div>
            )}
          </>
        )}

        {/* Deposit-Paid Tab — leads at status='order' with ≥1 confirmed installment */}
        {visibleTab === "deposit_paid" && (
          <>
            {d.depositPaid.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">ชำระมัดจำแล้ว</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{d.depositPaid.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.depositPaid).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375" /></svg>
                </div>
                <div className="text-base font-semibold text-gray-900">ยังไม่มีรายการชำระมัดจำ</div>
                <div className="text-sm text-gray-500 mt-1">รายการที่ชำระงวด 1 แล้วจะปรากฏที่นี่</div>
              </div>
            )}
          </>
        )}

        {/* Sales · รอนัดติดตั้ง — มัดจำแล้ว แต่ Solar ยังไม่นัดวันติดตั้ง.
            Sales ใช้ติดตามว่าลูกค้าที่จ่ายแล้วได้นัดติดตั้งหรือยัง */}
        {visibleTab === "sales_wait_install" && (
          <>
            {d.waitInstall.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-orange-600">รอนัดติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{d.waitInstall.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.waitInstall).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-orange-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-orange-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานรอนัดติดตั้ง</div>
              </div>
            )}
          </>
        )}

        {/* Sales-Solar Tab — sales follows up on solar team's progress */}
        {visibleTab === "sales_solar" && (
          <>
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {salesSolarCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานรอใบเสนอราคา</div>
              </div>
            )}
          </>
        )}

        {/* Solar Tab */}
        {visibleTab === "solar" && (() => {
          const bookingReady = d.booking.filter(l => l.payment_confirmed);
          return (
          <>
            {/* Survey วันนี้ มาก่อน — เป็นคำถามแรกของช่างตอนเช้า "วันนี้มีนัดอะไร"
             * เรียงตาม survey_date (เวลานัด) เช้า → เย็น */}
            {d.surveyToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-primary">Survey วันนี้</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{d.surveyToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyToday, "survey_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {/* Booking — เฉพาะ "จ่ายแล้ว" Solar ต้องนัดสำรวจ. ลูกค้ายังไม่จ่าย
             * เป็นงาน sales ตามเงิน — ไม่อยู่บน solar dashboard */}
            {bookingReady.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{bookingReady.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(bookingReady).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">Survey รอดำเนินการ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.surveyPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyPending, "survey_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.quotationPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.waitInstall.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-orange-600">รอนัดติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{d.waitInstall.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.waitInstall).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.installScheduled.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-600">รอติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{d.installScheduled.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.installScheduled, "install_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.warranty.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-cyan-700">รอออกใบรับประกัน</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">{d.warranty.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.warranty).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {solarCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงาน Solar วันนี้</div>
              </div>
            )}
          </>
          );
        })()}

        {/* Solar · สำรวจ — booking ที่จ่ายแล้ว + survey วันนี้ + รอนัดสำรวจ */}
        {visibleTab === "solar_survey" && (() => {
          const bookingReady = d.booking.filter(l => l.payment_confirmed);
          return (
          <>
            {d.surveyToday.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-primary">Survey วันนี้</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{d.surveyToday.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyToday, "survey_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {bookingReady.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-700">รายการจอง · รอนัดสำรวจ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{bookingReady.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(bookingReady).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {d.surveyPending.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-600">Survey รอดำเนินการ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{d.surveyPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.surveyPending, "survey_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            )}
            {solarSurveyCount === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานสำรวจ</div>
              </div>
            )}
          </>
          );
        })()}

        {/* Solar · ใบเสนอราคา — ใบเสนอราคาที่ยังรอจัดทำ */}
        {visibleTab === "solar_quote" && (
          <>
            {d.quotationPending.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-violet-600">รอใบเสนอราคา</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{d.quotationPending.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.quotationPending).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีใบเสนอราคาที่ต้องทำ</div>
              </div>
            )}
          </>
        )}

        {/* Solar · รอนัดติดตั้ง — มัดจำแล้ว แต่ยังไม่นัดวันติดตั้ง (matches pipeline wait_install) */}
        {visibleTab === "solar_wait_install" && (
          <>
            {d.waitInstall.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-orange-600">รอนัดติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{d.waitInstall.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.waitInstall).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-orange-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-orange-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานรอนัดติดตั้ง</div>
              </div>
            )}
          </>
        )}

        {/* Solar · รอติดตั้ง — นัดวันติดตั้งแล้ว ยังไม่เสร็จ (matches pipeline install) */}
        {visibleTab === "solar_install" && (
          <>
            {installFuture.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-600">รอติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{installFuture.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(installFuture, "install_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานรอติดตั้ง</div>
              </div>
            )}
          </>
        )}

        {visibleTab === "solar_installing" && (
          <>
            {installInProgress.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-emerald-600">กำลังติดตั้ง</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{installInProgress.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(installInProgress, "install_date").map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-emerald-500" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีงานกำลังติดตั้ง</div>
              </div>
            )}
          </>
        )}

        {/* Solar · รอออกใบรับประกัน — status='warranty' */}
        {visibleTab === "solar_warranty" && (
          <>
            {d.warranty.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-cyan-700">รอออกใบรับประกัน</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">{d.warranty.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(d.warranty).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-cyan-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-cyan-600" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีรายการรอออกใบรับประกัน</div>
              </div>
            )}
          </>
        )}

        {/* Solar · ขอขนานไฟ — รายการเดียวกับ Pipeline > ขอขนานไฟ */}
        {visibleTab === "solar_gridtie" && (
          <>
            {solarGridtie.length > 0 ? (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h2 className="text-xs font-bold tracking-wider uppercase text-amber-700">ขอขนานไฟ</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{solarGridtie.length}</span>
                  </div>
                </div>
                <div className="space-y-3">{sortLeads(solarGridtie).map((l) => <LeadCard key={l.id} lead={l} />)}</div>
              </section>
            ) : (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-3">
                  <CheckIcon className="w-8 h-8 text-amber-600" strokeWidth={2} />
                </div>
                <div className="text-base font-semibold text-gray-900">All caught up!</div>
                <div className="text-sm text-gray-500 mt-1">ไม่มีรายการขอขนานไฟ</div>
              </div>
            )}
          </>
        )}

        {/* Calendar Tab — shared list view (same component as /calendar) */}
        {visibleTab === "calendar" && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setSelectedZone("all"); localStorage.setItem("selectedZone", "all"); }}
                className={`px-3 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedZone === "all" ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}
                style={{ minHeight: 0 }}
              >
                All
              </button>
              {zones.map((z) => {
                const active = selectedZone === z.name;
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => { setSelectedZone(z.name); localStorage.setItem("selectedZone", z.name); }}
                    className="px-3 h-8 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5"
                    style={{
                      minHeight: 0,
                      backgroundColor: active && z.color ? z.color : "white",
                      borderColor: z.color || "#e5e7eb",
                      color: active ? "white" : (z.color || "#4b5563"),
                    }}
                  >
                    {!active && z.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />}
                    {z.name}
                  </button>
                );
              })}
            </div>
            <EventCalendarList monthsBack={0} monthsForward={2} controlledZone={selectedZone} hideNav />
          </div>
        )}
      </div>

      {/* FAB — primary teal */}
      <button
        type="button"
        onClick={() => setChannelPickerOpen(true)}
        className="fixed bottom-24 right-5 md:bottom-6 md:right-6 w-14 h-14 bg-gradient-to-b from-primary via-primary to-primary rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary-dark transition-all z-20"
      >
        <PlusIcon className="w-6 h-6" strokeWidth={2.5} />
      </button>

      {channelPickerOpen && (
        <ChannelPickerModal
          onClose={() => setChannelPickerOpen(false)}
          onPick={(code) => {
            setChannelPickerOpen(false);
            setPickedChannel(code);
          }}
        />
      )}

      {pickedChannel && (
        <NewLeadModal
          initialSource={pickedChannel}
          onClose={() => setPickedChannel(null)}
        />
      )}
    </div>
    </TodaySlaCardContext.Provider>
  );
}

// Single-tab Today shown to account-only users. Pulls pending installments from
// /api/report/payments, intersects lead_ids with /api/leads, renders LeadCard.
interface PendingReportRow { lead_id: number; installments: { confirmed_at: string | null; has_slip: boolean }[] }
interface PendingReportData { rows: PendingReportRow[] }

function AccountTodayView({ leads, search, setSearch }: { leads: LeadData[]; search: string; setSearch: (s: string) => void }) {
  const openLead = useOpenLead();
  const [report, setReport] = useState<PendingReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  useEffect(() => {
    apiFetch("/api/report/payments")
      .then((r: PendingReportData) => setReport(r))
      .catch(console.error)
      .finally(() => setReportLoading(false));
  }, []);

  // Map lead status → (localStorage substep key, substep index) for the
  // "ชำระเงิน" substep of the relevant step. Used to deep-link the account
  // user into the right form when they click a pending-payment card.
  const paymentSubStepFor = (status: string): { key: string; sub: number } | null => {
    const main = status.split('-')[0];
    if (status === 'pre_survey-01' || status === 'pre_survey-02') return { key: 'preSurveySubStep', sub: 3 };
    if (main === 'order') return { key: 'orderSubStep', sub: 1 };
    if (main === 'install') return { key: 'installSubStep', sub: 3 };
    return null;
  };

  const openAtPayment = (lead: LeadData) => {
    const target = paymentSubStepFor(lead.status || "");
    if (target && typeof window !== 'undefined') {
      localStorage.setItem(`${target.key}_${lead.id}`, String(target.sub));
    }
    openLead(lead.id);
  };

  const pendingIds = new Set<number>();
  if (report) {
    for (const r of report.rows) {
      if (r.installments.some(i => !i.confirmed_at && i.has_slip)) pendingIds.add(r.lead_id);
    }
  }
  const cards = leads.filter(l => pendingIds.has(l.id));
  const q = search.trim().toLowerCase();
  const filtered = !q ? cards : cards.filter(l =>
    l.full_name?.toLowerCase().includes(q) ||
    l.phone?.includes(q) ||
    l.project_name?.toLowerCase().includes(q) ||
    l.installation_address?.toLowerCase().includes(q) ||
    l.house_number?.toLowerCase().includes(q) ||
    l.pre_doc_no?.toLowerCase().includes(q)
  );

  const today = new Date();
  const subtitle = today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  return (
    <div>
      <ListPageHeader
        title="Today"
        subtitle={subtitle}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์..."
        tabs={[{ key: "pending", label: "รอยืนยันรับเงิน", count: filtered.length }]}
        activeTab="pending"
        onTabChange={() => {}}
      />
      <div className="p-3 md:p-6">
        {reportLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-300 p-12 text-center">
            <div className="text-sm text-gray-400">ไม่มีรายการรอยืนยัน</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(lead => (
              <LeadCard key={lead.id} lead={lead} onOpen={openAtPayment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
