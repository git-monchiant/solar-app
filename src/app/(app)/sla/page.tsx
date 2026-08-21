"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClockIcon, PhoneIcon, UserIcon } from "@/components/ui/icons";
import ListPageHeader from "@/components/layout/ListPageHeader";
import SourceTag from "@/components/SourceTag";
import { apiFetch } from "@/lib/api";
import { formatThaiDateShort, formatThaiTime } from "@/lib/utils/formatters";
import { useOpenLead } from "@/lib/hooks/useOpenLead";
import { useActiveRoles, useMe } from "@/lib/roles";

type SlaStatus = "active" | "warning" | "critical" | "breached";
type SlaVisibleStatus = Exclude<SlaStatus, "critical">;
type SlaTab = "all" | SlaVisibleStatus;

type SlaItem = {
  id: number;
  lead_id: number;
  policy_code: string;
  task_name: string;
  status: SlaStatus;
  due_at: string;
  full_name: string;
  phone: string;
  customer_grade: string | null;
  source: string | null;
  owner_name: string | null;
  owner_user_id: number | null;
  owner_role: "sales" | "solar";
};

type DashboardData = {
  counts: Record<SlaStatus, number>;
  leadCounts: Record<SlaStatus, number> & { near_due: number };
  items: SlaItem[];
  scope: {
    isAdmin: boolean;
    isSalesSup: boolean;
    isSolarSup: boolean;
    isSales: boolean;
    isSolar: boolean;
    userId: number;
  };
};

type SolarUser = { id: number; full_name: string };

const STATUS_LABEL: Record<SlaStatus, string> = {
  active: "กำลังดำเนินการ",
  warning: "ใกล้กำหนด SLA",
  critical: "ใกล้กำหนด SLA",
  breached: "เกินกำหนด SLA",
};

const STATUS_STYLE: Record<SlaStatus, { chip: string; dot: string; card: string; edge: string }> = {
  active: { chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500", card: "border-sky-200 bg-sky-50/40", edge: "border-l-sky-400" },
  warning: { chip: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", card: "border-amber-200 bg-amber-50/40", edge: "border-l-amber-400" },
  critical: { chip: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500", card: "border-orange-200 bg-orange-50/40", edge: "border-l-orange-400" },
  breached: { chip: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500", card: "border-red-200 bg-red-50/40", edge: "border-l-red-500" },
};

function formatOverdueDuration(dueAt: string): string {
  const milliseconds = Date.now() - Date.parse(dueAt);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "เพิ่งเกินกำหนด";
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days.toLocaleString("th-TH")} วัน${hours > 0 ? ` ${hours} ชม.` : ""}`;
  if (totalHours > 0) return `${totalHours.toLocaleString("th-TH")} ชม.`;
  return `${Math.max(1, Math.floor(milliseconds / 60_000)).toLocaleString("th-TH")} นาที`;
}

function SummaryCard({ status, count, leadCount, active, onClick }: {
  status: SlaVisibleStatus;
  count: number;
  leadCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const style = STATUS_STYLE[status];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left transition-all hover:shadow-sm active:scale-[0.99] ${
        active ? `${style.card} ring-2 ring-active/20` : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
        <span className="text-xs font-semibold text-gray-500">{STATUS_LABEL[status]}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums text-gray-900">{count.toLocaleString("th-TH")}</span>
        <span className="text-xxs font-semibold text-gray-400">งาน SLA</span>
      </div>
      <div className="mt-1 text-xs font-semibold text-gray-600">
        จำนวน Lead: {leadCount.toLocaleString("th-TH")}
      </div>
    </button>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-gray-200 bg-white p-4">
          <div className="h-4 w-24 rounded bg-gray-100" />
          <div className="mt-4 h-5 w-52 rounded bg-gray-100" />
          <div className="mt-2 h-3 w-72 max-w-full rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export default function SlaDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<SlaTab>("all");
  const [stageFilter, setStageFilter] = useState("all");
  const openLead = useOpenLead();
  const { activeRoles } = useActiveRoles();
  const { me } = useMe();
  const [solarUsers, setSolarUsers] = useState<SolarUser[]>([]);
  const [assigningId, setAssigningId] = useState<number | null>(null);

  const solarManagerView = activeRoles.includes("admin") || activeRoles.includes("solar_sup");
  const solarView = activeRoles.includes("solar") || activeRoles.includes("solar_sup");
  const solarOnlyView = solarView && !activeRoles.includes("sales") && !activeRoles.includes("sales_sup") && !activeRoles.includes("admin");

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await apiFetch("/api/sla/dashboard"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ไม่สามารถโหลดข้อมูล SLA ได้");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!solarManagerView) return;
    Promise.all([
      apiFetch("/api/users?role=solar") as Promise<SolarUser[]>,
      apiFetch("/api/users?role=solar_sup") as Promise<SolarUser[]>,
    ]).then(groups => {
      const unique = new Map<number, SolarUser>();
      groups.flat().forEach(user => unique.set(user.id, user));
      setSolarUsers(Array.from(unique.values()).sort((a, b) => a.full_name.localeCompare(b.full_name, "th")));
    }).catch(console.error);
  }, [solarManagerView]);

  const assignSolarWork = async (item: SlaItem, userId: number | null) => {
    setAssigningId(item.id);
    try {
      await apiFetch("/api/sla/assign", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instance_id: item.id, user_id: userId }),
      });
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "มอบหมายงานไม่สำเร็จ");
    } finally {
      setAssigningId(null);
    }
  };

  const counts = data?.counts ?? { active: 0, warning: 0, critical: 0, breached: 0 };
  const leadCounts = data?.leadCounts ?? { active: 0, warning: 0, critical: 0, breached: 0, near_due: 0 };
  const nearDueCount = counts.warning + counts.critical;
  const total = counts.active + counts.warning + counts.critical + counts.breached;
  const tabs = [
    { key: "all", label: "ทั้งหมด", count: total },
    { key: "breached", label: "เกินกำหนด SLA", count: counts.breached },
    { key: "warning", label: "ใกล้กำหนด SLA", count: nearDueCount },
    { key: "active", label: "กำลังดำเนินการ", count: counts.active },
  ];

  const stageOptions = useMemo(() => {
    const stages = new Map<string, string>();
    for (const item of data?.items ?? []) stages.set(item.policy_code, item.task_name);
    return Array.from(stages, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "th"));
  }, [data]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("th");
    return (data?.items ?? []).filter(item => {
      if (tab === "warning" && item.status !== "warning" && item.status !== "critical") return false;
      if (tab !== "all" && tab !== "warning" && item.status !== tab) return false;
      if (stageFilter !== "all" && item.policy_code !== stageFilter) return false;
      if (!needle) return true;
      return [item.full_name, item.phone, item.owner_name, item.task_name, item.policy_code, item.source, String(item.lead_id)]
        .some(value => String(value || "").toLocaleLowerCase("th").includes(needle));
    });
  }, [data, search, stageFilter, tab]);

  return (
    <div>
      <ListPageHeader
        title={solarOnlyView ? "Solar SLA" : "SLA Dashboard"}
        subtitle={solarOnlyView ? "ติดตามงานสำรวจและติดตั้งตามกำหนดเวลา" : "ติดตามงานตามผู้รับผิดชอบและ Active Role"}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์โทร, Owner, งาน SLA..."
        tabs={tabs}
        activeTab={tab}
        onTabChange={key => setTab(key as SlaTab)}
        actionIcon={
          <svg className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356m-1.181 10.888a8.25 8.25 0 11-2.29-8.568l3.471 2.672" />
          </svg>
        }
        onAction={() => load(true)}
      />

      <main className="space-y-5 p-4">
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">ภาพรวมสถานะ SLA</h2>
            <span className="text-xxs text-gray-400">อัปเดตอัตโนมัติทุก 1 นาที</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["breached", "warning", "active"] as SlaVisibleStatus[]).map(status => (
              <SummaryCard
                key={status}
                status={status}
                count={status === "warning" ? nearDueCount : counts[status]}
                leadCount={status === "warning" ? leadCounts.near_due : leadCounts[status]}
                active={tab === status}
                onClick={() => setTab(current => current === status ? "all" : status)}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              {tab === "all" ? "คิวงานตามความเร่งด่วน" : STATUS_LABEL[tab]}
            </h2>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="sla-stage-filter">กรองตามขั้นตอน SLA</label>
              <select
                id="sla-stage-filter"
                value={stageFilter}
                onChange={event => setStageFilter(event.target.value)}
                className="h-8 max-w-52 rounded-lg border border-gray-200 bg-white px-2 pr-7 text-xs font-semibold text-gray-700 outline-none focus:border-active"
              >
                <option value="all">ทุกขั้นตอนที่เกิน SLA</option>
                {stageOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-active">{filteredItems.length}</span>
            </div>
          </div>

          {loading && !data ? (
            <LoadingCards />
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-semibold text-red-700">โหลดข้อมูล SLA ไม่สำเร็จ</p>
              <p className="mt-1 text-xs text-red-600">{error}</p>
              <button type="button" onClick={() => load()} className="mt-4 h-9 rounded-full bg-active px-4 text-xs font-semibold text-white hover:opacity-90">ลองใหม่</button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <ClockIcon className="mx-auto h-9 w-9 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-gray-600">ไม่พบงาน SLA</p>
              <p className="mt-1 text-xs text-gray-400">ลองเปลี่ยนสถานะหรือล้างคำค้นหา</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map(item => {
                const style = STATUS_STYLE[item.status];
                const isBreached = item.status === "breached";
                return (
                  <article
                    key={item.id}
                    onClick={() => openLead(item.lead_id)}
                    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") openLead(item.lead_id); }}
                    role="button"
                    tabIndex={0}
                    className={`w-full cursor-pointer rounded-2xl border border-l-4 border-gray-300 bg-white p-4 text-left shadow-sm transition-all hover:border-gray-400 hover:shadow-md active:scale-[0.995] ${style.edge}`}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xxs font-bold uppercase tracking-wider ring-1 ring-inset ${style.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {STATUS_LABEL[item.status]}
                      </span>
                      {item.customer_grade && (
                        <span className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2 text-xxs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">Grade {item.customer_grade}</span>
                      )}
                      <SourceTag value={item.source} size="xs" />
                      <span className="ml-auto text-xxs font-semibold text-gray-400">Lead #{item.lead_id}</span>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold text-gray-900">{item.full_name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                            <PhoneIcon className="h-4 w-4 text-emerald-500" />
                            {item.phone || "ไม่มีเบอร์โทร"}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <UserIcon className="h-4 w-4 text-gray-400" />
                            {item.owner_name || (item.owner_role === "solar" ? "ยังไม่มอบหมายทีม Solar" : "ยังไม่มอบหมาย Owner")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-gray-700">
                          <span className="text-xs font-normal text-gray-400">งาน: </span>{item.task_name}
                        </p>
                        {isBreached && (
                          <div className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-red-400 text-xxs">!</span>
                            <span className="min-w-0 break-words">เกิน SLA ที่ขั้นตอน “{item.task_name}”</span>
                          </div>
                        )}
                      </div>

                      <div className={`shrink-0 rounded-xl border px-3 py-2 md:w-60 ${style.card}`}>
                        {isBreached ? (
                          <>
                            <div className="flex items-center justify-between gap-2 text-xxs font-semibold text-red-600">
                              <span>เกิน SLA มาแล้ว</span>
                              <ClockIcon className="h-4 w-4" />
                            </div>
                            <div className="mt-0.5 text-lg font-bold tabular-nums text-red-600">{formatOverdueDuration(item.due_at)}</div>
                            <div className="mt-2 border-t border-red-200 pt-2">
                              <div className="text-xxs font-semibold uppercase tracking-wider text-gray-500">ขั้นตอนที่เกิน</div>
                              <div className="mt-0.5 text-sm font-bold text-gray-800">{item.task_name}</div>
                              <div className="mt-1.5 text-xxs text-gray-500">กำหนดเสร็จ {formatThaiDateShort(item.due_at)} {formatThaiTime(item.due_at)}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-xxs font-semibold uppercase tracking-wider text-gray-500">กำหนดเสร็จ</div>
                            <div className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-bold text-gray-800">
                              <ClockIcon className="h-4 w-4" />
                              {formatThaiDateShort(item.due_at)} {formatThaiTime(item.due_at)}
                            </div>
                            <div className="mt-2 border-t border-gray-200 pt-2">
                              <div className="text-xxs font-semibold uppercase tracking-wider text-gray-500">ขั้นตอน SLA</div>
                              <div className="mt-0.5 text-sm font-bold text-gray-800">{item.task_name}</div>
                            </div>
                          </>
                        )}
                        {item.owner_role === "solar" && (
                          <div className="mt-2" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                            {solarManagerView ? (
                              <select
                                aria-label="มอบหมายผู้รับผิดชอบทีม Solar"
                                value={item.owner_user_id ?? ""}
                                disabled={assigningId === item.id}
                                onChange={event => assignSolarWork(item, event.target.value ? Number(event.target.value) : null)}
                                className="h-8 w-full rounded-lg border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 outline-none focus:border-active"
                              >
                                <option value="">ยังไม่มอบหมาย</option>
                                {solarUsers.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}
                              </select>
                            ) : solarView && !item.owner_user_id ? (
                              <button
                                type="button"
                                disabled={!me || assigningId === item.id}
                                onClick={() => me && assignSolarWork(item, me.id)}
                                className="h-8 w-full rounded-lg bg-active px-3 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                              >
                                {assigningId === item.id ? "กำลังรับงาน…" : "รับงานนี้"}
                              </button>
                            ) : item.owner_user_id === me?.id ? (
                              <span className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-700">งานของฉัน</span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
