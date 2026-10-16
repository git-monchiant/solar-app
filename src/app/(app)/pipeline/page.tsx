"use client";

import { apiFetch } from "@/lib/api";
import { CheckIcon } from "@/components/ui/icons";
import { useSearchParams } from "next/navigation";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import Dropdown from "@/components/ui/Dropdown";
import { useEffect, useState, useCallback } from "react";
import ListPageHeader from "@/components/layout/ListPageHeader";
import LeadCard, { type LeadData } from "@/components/lead/LeadCard";
import { useActiveRoles, hasRole, useMe } from "@/lib/roles";
import { normalizeSourceKey, SOURCE_STYLES } from "@/lib/source-tag";
import Loading from "@/components/ui/Loading";
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
  /** touchpoint channels เพิ่มเติมระหว่างทาง — JSON array string เช่น '["line_sena"]' */
  tag: string | null;
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
  assigned_user_id?: number | null;
  order_paid_count?: number | null;
  /** งวดที่ต้องจ่าย "ก่อนติดตั้ง" เท่านั้น — งวดที่ติ๊กชำระหลังติดตั้งไม่ถูกนับ */
  order_before_total_count?: number | null;
  order_before_paid_count?: number | null;
  order_before_ready_count?: number | null;
  order_ready_count?: number | null;
  order_total_count?: number | null;
  journey_step?: number | null;
  journey_sub?: number | null;
  /** งาน SLA ที่ใกล้ครบกำหนดที่สุดของ lead — /api/leads ส่งมาแค่ตัวบนสุดตัวเดียว */
  sla_status?: "active" | "warning" | "critical" | "breached" | null;
  sla_started_at?: string | null;
  sla_policy_code?: string | null;
  sla_task_name?: string | null;
  sla_owner_role?: "sales" | "solar" | null;
  sla_owner_user_id?: number | null;
  sla_owner_name?: string | null;
  sla_done_completed_at?: string | null;
  sla_done_breached_at?: string | null;
}

type TabKey = "all" | "pre_survey" | "booking" | "survey" | "quotation" | "order" | "quote_process" | "install_process" | "warranty_process" | "wait_install" | "install" | "installing" | "warranty" | "gridtie" | "handover" | "lost";
type SortField = "follow_up" | "created" | "name" | "activity" | "survey_date" | "install_date";
type SortOrder = "asc" | "desc";

const TAB_KEYS: TabKey[] = ["all","pre_survey","booking","survey","quotation","order","quote_process","install_process","warranty_process","wait_install","install","installing","warranty","gridtie","handover","lost"];
const SORT_FIELDS: SortField[] = ["follow_up", "created", "name", "activity", "survey_date", "install_date"];

const parseTags = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === "string") : [];
  } catch { return []; }
};

// จัดกลุ่มช่องทางเป็น bucket มาตรฐานชุดเดียวกับ dashboard (normalizeSourceKey):
// โค้ดสะกดต่าง/ค่า other:xxx ทั้งหมด ยุบรวมตามกติกากลาง — "อื่นๆ" เป็นตัวเลือกเดียว
// เรียงตามตัวอักษรของป้าย (ยกเว้น "อื่นๆ" ไว้ท้ายสุด)
const buildGroups = (values: string[]) => {
  const keys = new Set<string>();
  for (const v of values) keys.add(normalizeSourceKey(v));
  return [...keys]
    .map((key) => ({ value: key, label: SOURCE_STYLES[key as keyof typeof SOURCE_STYLES]?.label ?? key }))
    .sort((a, b) => {
      if (a.value === "other") return 1;
      if (b.value === "other") return -1;
      return a.label.localeCompare(b.label, "th");
    });
};

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
  // กระบวนการใบเสนอทั้งวง: รอทำใบเสนอ → รออนุมัติ → รอชำระ (400 คลุมช่วงรออนุมัติอยู่แล้ว)
  if (key === "quote_process") return l.journey_step === 400 || l.journey_step === 500;
  // กระบวนการติดตั้ง: รอนัด → รอ/กำลังติดตั้ง (ออกใบรับประกันเป็นงานหลังติดตั้ง ไม่รวม)
  // — นับตาม journey ตรงๆ ไม่ใส่ money gate เพื่อให้เท่ากับ badge
  if (key === "install_process") return l.journey_step === 600 || l.journey_step === 700;
  // งานรับประกันทั้งวง (การ์ดโมดูล Warranty): รอออกใบรับประกัน + รอขอขนานไฟ
  if (key === "warranty_process") return l.journey_step === 800 || l.journey_step === 900;
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
  // filter ช่องทาง (source) + tag — "all" = ไม่กรอง
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  // โหมดโมดูล: left menu ทำหน้าที่เลือก tab (ผ่าน ?tab=) → ซ่อนแถบ tab แนวนอน
  // และหัวเรื่องหน้า = ชื่อเมนูที่ active (จาก hook กลาง ไม่ต้องรู้จักเมนูเอง)
  const { module: activeModule, item: activeMenuItem } = useActiveMenuItem();
  const moduleMode = !!activeModule;
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

  // "งานของฉัน" — ให้เหมือนหน้า Today ทั้งความหมายและการจำค่า ต่างกันแค่คีย์
  const { me } = useMe();
  const [mineOnly, setMineOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pipeline.mineOnly") === "1";
  });

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

  // ตัวเลือกใน dropdown = lead source (แหล่งแรก) ของรายการในเมนู/แท็บปัจจุบันเท่านั้น
  // (จัดกลุ่มการสะกด + เรียงตามจำนวนมาก → น้อย) — ช่องทางที่ไม่มี lead ในหน้านี้ไม่แสดง
  const tabLeads = leads.filter(l => matchesTab(l, tab, todayYmd));
  const sourceOptions = buildGroups(tabLeads.map(l => l.source).filter(Boolean));
  const tagOptions = buildGroups(tabLeads.flatMap(l => parseTags(l.tag)));

  // เปลี่ยนเมนู/แท็บ → ล้าง filter กันค่าที่ไม่มีในหน้าใหม่ค้างกรองแบบมองไม่เห็น
  useEffect(() => { setSourceFilter("all"); setTagFilter("all"); }, [tab]);

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

  const slaAvailable = leads.some(l => l.sla_status);
  const slaStatusKeys = slaFilters.filter((key): key is SlaStatusKey => key !== "without");
  const slaStatusMode = slaStatusKeys.length > 0;

  // ความหมายเดียวกับ Today: ถ้ากำลังกรองด้วยสถานะ SLA อยู่ "ของฉัน" = งาน SLA ที่ฉันเป็นเจ้าของ
  // นอกนั้น = lead ที่ฉันเป็นผู้ดูแล (Pipeline มี SLA ต่อ lead แถวเดียว จึงเทียบ owner ตรง ๆ ได้)
  const matchesMine = (l: Lead) => {
    if (!mineOnly || !me?.id) return true;
    return slaStatusMode ? l.sla_owner_user_id === me.id : l.assigned_user_id === me.id;
  };

  // ตัวเลขบนชิปต้องเป็น "จำนวนที่จะเห็นจริงเมื่อกด" จึงนับหลังกรองแท็บ คำค้น และงานของฉันแล้ว
  // แต่ก่อนกรอง SLA ไม่งั้นพอติ๊กปุ่มหนึ่ง ตัวเลขปุ่มที่เหลือจะกลายเป็น 0 หมด
  // กรองช่องทาง/tag ก่อนเข้าเครื่องกรอง SLA — ตัวเลขบนชิป SLA จะได้ตรงกับรายการที่เห็นจริง
  const tabScoped = tabLeads
    .filter(l => sourceFilter === "all" || (l.source && normalizeSourceKey(l.source) === sourceFilter))
    .filter(l => tagFilter === "all" || parseTags(l.tag).some(t => normalizeSourceKey(t) === tagFilter))
    .filter(matchesSearch).filter(matchesMine);

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
    const key = slaFilterKeyOf(l.sla_status, { completedAt: l.sla_done_completed_at, breachedAt: l.sla_done_breached_at });
    if (key) counts[key] += 1;
    return counts;
  }, { breached: 0, near_due: 0, active: 0, done_ontime: 0, without: 0 } as Record<SlaFilterKey, number>);

  const filteredBase = sortLeads(slaScoped.filter(l => {
    if (slaFilters.length === 0) return true;
    // normalizeSlaFilters การันตีว่า "ไม่มีงาน SLA" กับ "เสร็จตามกำหนด" อยู่ตัวเดียวเสมอ
    if (slaFilters.includes("without") || slaFilters.includes("done_ontime")) {
      return slaFilterKeyOf(l.sla_status, { completedAt: l.sla_done_completed_at, breachedAt: l.sla_done_breached_at }) === slaFilters[0];
    }
    return matchesSlaStatus(l.sla_status, slaStatusKeys);
  }));

  // list รวมกระบวนการ (ใบเสนอ/ติดตั้ง): จัดกลุ่มตามลำดับขั้น journey ก่อน
  // — sort ของผู้ใช้ยังมีผลภายในแต่ละกลุ่ม (Array.sort เสถียร)
  const filtered = tab === "quote_process" || tab === "install_process" || tab === "warranty_process"
    ? [...filteredBase].sort((a, b) =>
        ((a.journey_step ?? 0) - (b.journey_step ?? 0)) || ((a.journey_sub ?? 0) - (b.journey_sub ?? 0)))
    : filteredBase;

  const countFor = (key: TabKey) => key === "all" ? leads.length : leads.filter(l => matchesTab(l, key, todayYmd)).length;

  // Sales + solar both see the full pipeline. Tab visibility used to gate by
  // role, but the team wanted shared visibility into every stage.
  const ALL_TABS: { key: TabKey; label: string }[] = [
    { key: "all",        label: "ทั้งหมด" },
    { key: "pre_survey", label: "รอติดตาม" },
    { key: "booking",    label: "รายการจอง" },
    { key: "survey",     label: "รอสำรวจ" },
    { key: "quotation",  label: "รอใบเสนอราคา" },
    { key: "quote_process", label: "ใบเสนอราคา" },
    { key: "install_process", label: "ติดตั้ง" },
    { key: "warranty_process", label: "รับประกัน" },
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
        tabsLeft={moduleMode ? (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">
              {(sourceFilter !== "all" || tagFilter !== "all") ? filtered.length : countFor(tab)} รายการ
            </span>
            {/* filter ช่องทาง/Tag เฉพาะ list "ทั้งหมด" — list รายขั้นเอาแค่จำนวนพอ */}
            {tab === "all" && (
            <Dropdown
              className="w-40 font-normal"
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v || "all")}
              options={[{ value: "all", label: "ช่องทางทั้งหมด" }, ...sourceOptions]}
            />
            )}
            {tab === "all" && tagOptions.length > 0 && (
              <Dropdown
                className="w-36 font-normal"
                value={tagFilter}
                onChange={(v) => setTagFilter(v || "all")}
                options={[{ value: "all", label: "Tag ทั้งหมด" }, ...tagOptions]}
              />
            )}
          </div>
        ) : undefined}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์, โครงการ..."
        tabs={moduleMode ? [] : TABS}
        activeTab={tab}
        onTabChange={(k) => { setTab(k as TabKey); localStorage.setItem("pipelineTab", k); }}
      />

      <div className="p-3 md:p-4">
        {/* แถวตัวกรอง SLA + เรียงข้อมูล อยู่ในตัวหน้า ไม่ใช่ tabsRight — tabsRight ซ่อนบนจอแคบ
            ติ๊กไว้แล้วจะปลดไม่ได้ · ปุ่มเรียงย้ายลงมาด้วย จะได้ใช้บนมือถือได้ (เดิมซ่อนทิ้งไปเลย) */}
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
            <button
              type="button"
              onClick={() => {
                const next = !mineOnly;
                setMineOnly(next);
                localStorage.setItem("pipeline.mineOnly", next ? "1" : "0");
              }}
              className="h-7 inline-flex items-center gap-1.5 px-1 text-xxs font-medium text-gray-700 cursor-pointer whitespace-nowrap"
            >
              <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${mineOnly ? "border-gray-800 bg-gray-800" : "border-gray-300"}`}>
                {mineOnly && <CheckIcon className="w-2 h-2 text-white" strokeWidth={4} />}
              </span>
              งานของฉัน
            </button>
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
        </div>
        {loading ? (
          <Loading />
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
