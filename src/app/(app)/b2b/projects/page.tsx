"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { ChevronRightIcon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/api";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatTHB } from "@/lib/utils/formatters";
import { B2B_FLOW, B2B_MAX_MOVABLE_STAGE, B2B_PROJECT_ROLES, B2B_PROJECT_VIEW_ROLES, B2B_STAGE_GROUPS, stageGroupOf, stageLabel, type B2bProjectRow } from "@/lib/b2b/project";
import { projectNext, WAITER_DOT, WAITER_LABEL, WAITER_TONE, WAITERS, type ProjectNext, type ProjectWaiter } from "@/lib/b2b/project-next";
import { daysSince, STAGE_AGING_WARN_DAYS } from "@/lib/b2b/project-view";
import StageBadge from "@/components/b2b/project/StageBadge";
import ProjectFormModal from "@/components/b2b/project/ProjectFormModal";

// รายการโครงการ B2B — แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 1 · หน้าตาแบบ flow แผน 20261016-06 (แบบ A)
// ?stage= ตามเมนู (ไม่มี = ทุกโครงการที่ยังเปิด · sales/site = "ทั้งหมด" ของการ์ดขาย / สำรวจ & ติดตั้ง)
// แถบขั้นด้านบน (จำนวน · ราคา · กดกรอง — ไม่ติดป้ายรอใคร ดูจากตาราง/ชิปกรองแทน) + แถวมีรางขั้น · งานถัดไป · ผู้ดำเนินการ · วันในขั้น
// เอามุมมองกระดานออกแล้ว (ผู้ใช้สั่ง 16 ต.ค. 69) — แถบขั้นด้านบนแทนภาพรวมรายขั้น
// มูลค่า = ราคาขายของ BOQ ที่บันทึกล่าสุด (ก่อน VAT)

const pad = (n: number) => String(n).padStart(2, "0");
/** เลขขั้น 01–09 ตามรางของหน้าโครงการ */
const noOf = (step: number) => B2B_FLOW.findIndex((s) => s.step === step) + 1;
/** kW ไม่เกิน 2 ตำแหน่ง ตัดศูนย์ท้าย (183.04 · 150 · 0.7) — ช่วงหลายขนาดสั้นลง */
const kw = (w: number) => (w / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 });
const million = (n: number) => `${(n / 1e6).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ล้าน`;

type Row = { r: B2bProjectRow; nx: ProjectNext; days: number | null };

/** รอคนอื่นที่ไม่ใช่ผู้ดูแลโครงการ — ติดป้ายสีท้ายงานถัดไป (งานของผู้ดูแลเองไม่ติดป้าย · คอลัมน์สถานะเดิมยุบ 16 ต.ค. 69) */
const waitingOther = (nx: ProjectNext): ProjectWaiter | null => (nx.wait && nx.wait !== "us" ? nx.wait : null);

function WaitChip({ w }: { w: ProjectWaiter }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xxs font-bold whitespace-nowrap ${WAITER_TONE[w]}`}>{WAITER_LABEL[w]}</span>;
}

/** อยู่ขั้นนี้กี่วัน — เกินเกณฑ์เดียวกับการ์ดขั้นในหน้าโครงการ = สีเตือน */
function Days({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-300">—</span>;
  const late = days > STAGE_AGING_WARN_DAYS;
  return (
    <span className={`whitespace-nowrap tabular-nums ${late ? "font-semibold text-amber-600" : days === 0 ? "text-gray-400" : "text-gray-600"}`}
      title={late ? `อยู่ในขั้นนี้เกิน ${STAGE_AGING_WARN_DAYS} วัน` : undefined}>
      {days === 0 ? "วันนี้" : `${days} วัน`}
    </span>
  );
}

/** รางขั้นในแถว — จุดม่วงวง = ขั้นปัจจุบัน · ขั้นที่ไม่อยู่บนรางของหน้านี้ (เช่น ปิดแล้ว) ใช้ป้ายขั้นแทน */
function StepRail({ steps, r }: { steps: number[] | null; r: B2bProjectRow }) {
  const idx = steps ? steps.indexOf(r.stage) : -1;
  if (!steps || idx < 0) return <StageBadge stage={r.stage} sub={r.sub} surveyDate={r.survey_date} />;
  return (
    <div>
      <div className="flex items-center" aria-label={`ขั้น ${pad(noOf(r.stage))} ${stageLabel(r.stage)}`}>
        {steps.map((s, i) => (
          <Fragment key={s}>
            {i > 0 && <span className={`h-0.5 w-2.5 ${i <= idx ? "bg-primary" : "bg-gray-200"}`} />}
            <span title={`${pad(noOf(s))} ${stageLabel(s)}`}
              className={`shrink-0 rounded-full ${i < idx ? "h-2.5 w-2.5 bg-primary" : i === idx ? "h-3.5 w-3.5 border-[3px] border-active bg-white" : "h-2.5 w-2.5 bg-gray-200"}`} />
          </Fragment>
        ))}
      </div>
      <div className="mt-1 text-xs font-semibold text-active-dark whitespace-nowrap">{pad(noOf(r.stage))} {stageLabel(r.stage)}</div>
    </div>
  );
}

/** สีขั้นย่อย — ฟ้า ทำแล้ว · ม่วง ตอนนี้ · แดง ส่งกลับแก้ · เทา ยังไม่ถึง */
const subTone = (nx: ProjectNext, i: number) => (nx.back === i ? "bg-red-500" : i < nx.done ? "bg-primary" : i === nx.done ? "bg-active" : "bg-gray-200");
/** ชื่อขั้นย่อยตอนนี้ — ซ้ำกับข้อความงานถัดไป (เช่น "จัดทำใบ" ใต้ "จัดทำใบเสนอราคาประมาณการ") ไม่ต้องโชว์ */
function subNow(nx: ProjectNext): string | null {
  const cur = nx.back ?? nx.done;
  if (cur >= nx.subs.length) return "ดำเนินการครบแล้ว";
  if (nx.back != null) return `${nx.subs[cur]} · ถูกส่งกลับแก้ไข`;
  return nx.text.includes(nx.subs[cur]) ? null : nx.subs[cur];
}

function BoqCell({ r }: { r: B2bProjectRow }) {
  if (r.boq_count === 0) return <span className="text-gray-300">—</span>;
  const lo = r.boq_capacity_min_wp, hi = r.boq_capacity_max_wp;
  return (
    <>
      <div className="tabular-nums whitespace-nowrap">{lo && hi ? `${lo === hi ? kw(lo) : `${kw(lo)} – ${kw(hi)}`} kWp` : <span className="text-gray-400">ยังไม่มีรายการ</span>}</div>
      {r.boq_count > 1 && <div className="text-xs text-gray-400">{r.boq_count} ขนาด</div>}
    </>
  );
}

export default function B2bProjectListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stage = searchParams.get("stage") ?? "open";
  const { item } = useActiveMenuItem();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_PROJECT_VIEW_ROLES);
  const canEdit = hasRole(activeRoles, ...B2B_PROJECT_ROLES);
  // ผลที่โหลดผูกกับขั้นที่ขอ — เปลี่ยนเมนูแล้วยังไม่ได้ผลใหม่ = กำลังโหลด (ไม่โชว์รายการของเมนูเก่าค้าง)
  const [data, setData] = useState<{ stage: string; rows: B2bProjectRow[] } | null>(null);
  const rows = data?.stage === stage ? data.rows : null;
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // ตัวกรอง "รอใคร" / ขั้นจากแถบด้านบน — ผูกกับเมนูที่เปิด (เปลี่ยนเมนู = ล้างเอง)
  const [filt, setFilt] = useState<{ stage: string; wait: ProjectWaiter | null; step: number | null }>({ stage, wait: null, step: null });
  const waitFilter = filt.stage === stage ? filt.wait : null;
  const stepFilter = filt.stage === stage ? filt.step : null;
  const setWait = (w: ProjectWaiter | null) => setFilt({ stage, wait: w, step: stepFilter });
  const setStep = (s: number | null) => setFilt({ stage, wait: waitFilter, step: s });
  // เวลาอ้างอิงนับวันในขั้น — จับครั้งเดียวตอนแสดง (render ต้องให้ผลเดิมทุกครั้ง)
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/projects?stage=${encodeURIComponent(stage)}`)
      .then((r: B2bProjectRow[]) => setData({ stage, rows: r }))
      .catch(() => setData({ stage, rows: [] }));
  }, [canUse, stage]);

  const shown = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => !q || [r.code, r.name, r.customer_name, r.location, r.owner_name].some((x) => (x ?? "").toLowerCase().includes(q)))
      .map((r) => {
        const nx = projectNext(r);
        return { r, nx, days: nx.wait ? daysSince(r.stage_since, now) : null };
      });
  }, [rows, search, now]);

  // ช่องของแถบขั้น: กลุ่มของการ์ด (sales/site/closed/lost) = ทุกขั้นในกลุ่ม · ทั้งหมด = ขั้นขายเสมอ + ขั้นอื่นที่มีโครงการอยู่จริง
  const group = stage !== "open" ? stageGroupOf(stage) : null;
  const present = new Set(shown.map((x) => x.r.stage));
  const columns: number[] = group ? [...group]
    : /^\d{4}$/.test(stage) ? [Number(stage)]
    : B2B_FLOW.map((s) => s.step as number).filter((s) => s <= B2B_MAX_MOVABLE_STAGE || present.has(s));
  // รางขั้นในแถว: การ์ดสำรวจ & ติดตั้ง = 03 + 06–09 · ฝั่งขาย = 01–05 · เปิดทั้งหมด = 9 ขั้น · ปิด/แพ้ = ไม่มีราง (ป้ายขั้นแทน)
  const closedGroup = stage === "closed" || stage === "lost";
  const railSteps: number[] | null = closedGroup ? null
    : stage === "site" || (/^\d{4}$/.test(stage) && Number(stage) >= 3600) ? [...B2B_STAGE_GROUPS.site]
    : stage === "open" ? B2B_FLOW.map((s) => s.step as number)
    : [...B2B_STAGE_GROUPS.sales];
  const showPipe = !closedGroup && columns.length > 1;

  const title = item?.label ?? "โครงการ B2B";
  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title={title} subtitle="COMMERCIAL (B2B)" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }
  if (!rows) return <Loading />;

  // ตัวกรองแบบแยกมิติ: นับชิปรอใครจากแถวที่ผ่านตัวกรองขั้น · นับแถบขั้นจากแถวที่ผ่านตัวกรองรอใคร
  const byStep = showPipe && stepFilter != null ? shown.filter((x) => x.r.stage === stepFilter) : shown;
  const byWait = waitFilter ? shown.filter((x) => x.nx.wait === waitFilter) : shown;
  const listRows = byStep.filter((x) => !waitFilter || x.nx.wait === waitFilter);

  const open = (r: B2bProjectRow) => router.push(`/b2b/projects/${r.id}`);
  // สร้างโครงการ = ขั้น 01 โครงการใหม่ → ปุ่มอยู่เฉพาะรายการฝั่งขาย (การ์ดโครงการ/ปิด/แพ้ ไม่มี)
  const canCreateHere = stage === "open" || stage === "sales" || stage === "3100";
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const waitCounts = WAITERS.map((w) => [w, byStep.filter((x) => x.nx.wait === w).length] as const);
  const filterChip = (w: ProjectWaiter | null, label: string, n: number) => {
    const on = waitFilter === w;
    return (
      <button key={w ?? "all"} type="button" onClick={() => setWait(on && w ? null : w)} style={{ minHeight: 0 }} aria-pressed={on}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
        {w && <i className={`h-1.5 w-1.5 rounded-full ${on ? "bg-white" : WAITER_DOT[w]}`} />}
        {label} <span className="tabular-nums">{n}</span>
      </button>
    );
  };
  const sumOf = (xs: Row[]) => xs.reduce((t, x) => t + (x.r.boq_total_sale ?? 0), 0);

  return (
    <div>
      <Header title={title} subtitle={`COMMERCIAL (B2B) · ${shown.length} โครงการ`} />
      <div className="p-3 md:p-6 space-y-4">
        {/* แถบขั้น (A) — เส้นทางของการ์ดนี้ · กดขั้น = กรองรายการ (กดซ้ำ = เลิกกรอง) */}
        {showPipe && shown.length > 0 && (
          <div className="flex overflow-x-auto rounded-xl border border-gray-200 bg-white">
            {columns.map((s, i) => {
              const xs = byWait.filter((x) => x.r.stage === s);
              const sum = sumOf(xs);
              const on = stepFilter === s;
              return (
                <button key={s} type="button" onClick={() => setStep(on ? null : s)} style={{ minHeight: 0 }} aria-pressed={on}
                  className={`relative min-w-[132px] flex-1 border-gray-100 px-3 py-2.5 text-left transition-colors md:px-4 ${i > 0 ? "border-l" : ""} ${on ? "bg-active-light" : "hover:bg-gray-50"}`}>
                  {i > 0 && (
                    <span className="absolute -left-2.5 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400">
                      <ChevronRightIcon className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xxs font-bold ${on ? "bg-active text-white" : "bg-gray-100 text-gray-500"}`}>{pad(noOf(s))}</span>
                    <span className="truncate text-sm font-semibold text-gray-800">{columns.length > 5 ? B2B_FLOW[noOf(s) - 1].short : stageLabel(s)}</span>
                  </div>
                  <div className="mt-1 text-2xl font-bold leading-none tabular-nums text-gray-900">{xs.length}<span className="ml-1 text-xs font-medium text-gray-400">โครงการ</span></div>
                  <div className="mt-1 text-xs tabular-nums text-gray-500">{sum > 0 ? million(sum) : "—"}</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา เลขที่ / โครงการ / ลูกค้า / ที่ตั้ง / ผู้ดูแล…"
            className="h-8 px-4 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:border-primary" />
          {canEdit && canCreateHere && (
            <button type="button" onClick={() => setCreating(true)}
              className="h-8 px-5 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-colors">+ สร้างโครงการ</button>
          )}
          {/* รอใคร — สีตามคนที่ต้องทำ · ชิปที่เป็น 0 ไม่โชว์ (ยกเว้นที่เลือกอยู่) */}
          {!closedGroup && shown.length > 0 && (
            <div className="flex w-full gap-1.5 overflow-x-auto">
              {filterChip(null, "ทั้งหมด", byStep.length)}
              {waitCounts.filter(([w, n]) => n > 0 || waitFilter === w).map(([w, n]) => filterChip(w, WAITER_LABEL[w], n))}
            </div>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl bg-white border border-gray-300 px-5 py-10 text-center text-sm text-gray-400">
            {rows.length === 0 ? (canEdit && canCreateHere ? "ยังไม่มีโครงการ — กด \"+ สร้างโครงการ\" เพื่อเริ่ม" : "ไม่มีโครงการในขั้นนี้") : "ไม่พบโครงการตามคำค้น"}
          </div>
        ) : listRows.length === 0 ? (
            <div className="rounded-xl bg-white border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">ไม่มีโครงการตามตัวกรอง</div>
          ) : (
            <>
              {/* จอกว้าง: ตาราง */}
              <div className="max-md:hidden rounded-xl bg-white border border-gray-300 overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-semibold min-w-[180px]">โครงการ</th>
                      <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ขั้นตอน</th>
                      <th className="px-3 py-2 font-semibold">งานถัดไป</th>
                      <th className={`${num} font-semibold w-px`}>BOQ</th>
                      <th className={`${num} font-semibold w-px`}>ราคา BOQ ล่าสุด</th>
                      <th className="px-3 py-2 font-semibold w-px whitespace-nowrap">ผู้ดูแล</th>
                      <th className={`${num} font-semibold w-px`}>ระยะเวลาในขั้น</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listRows.map(({ r, nx, days }) => (
                      <tr key={r.id} onClick={() => open(r)} className="cursor-pointer border-t border-gray-100 hover:bg-primary/5">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-gray-900 leading-snug">{r.name}</div>
                          <div className="text-xs text-gray-400">{r.code} · {r.customer_name}</div>
                        </td>
                        <td className="px-3 py-2.5"><StepRail steps={railSteps} r={r} /></td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-gray-900 leading-snug">
                            {nx.text}
                            {waitingOther(nx) && <span className="ml-2 inline-block align-middle"><WaitChip w={waitingOther(nx)!} /></span>}
                          </div>
                          {nx.subs.length > 0 && <SubLine nx={nx} />}
                        </td>
                        <td className={num}><BoqCell r={r} /></td>
                        <td className={`${num} font-medium`}>{r.boq_total_sale ? formatTHB(r.boq_total_sale, { decimals: 0 }) : "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{r.owner_name ?? "—"}</td>
                        <td className={num}><Days days={days} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* มือถือ: การ์ด */}
              <div className="md:hidden space-y-2">
                {listRows.map(({ r, nx, days }) => (
                  <button key={r.id} type="button" onClick={() => open(r)} style={{ minHeight: 0 }}
                    className="w-full space-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900 leading-snug">{r.name}</div>
                        <div className="truncate text-xs text-gray-400">{r.code} · {r.customer_name}</div>
                      </div>
                      <span className="shrink-0 text-xs"><Days days={days} /></span>
                    </div>
                    <StepRail steps={railSteps} r={r} />
                    <div className="text-sm text-gray-800">→ {nx.text}</div>
                    <div className="flex items-center justify-between gap-2">
                      {waitingOther(nx) ? <WaitChip w={waitingOther(nx)!} /> : <span className="text-xs text-gray-400">{r.owner_name ?? ""}</span>}
                      <span className="text-sm font-medium tabular-nums">{r.boq_total_sale ? formatTHB(r.boq_total_sale, { decimals: 0 }) : "—"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
      </div>

      {creating && (
        <ProjectFormModal initial={null} onClose={() => setCreating(false)} onSaved={(r) => router.push(`/b2b/projects/${r.id}`)} />
      )}
    </div>
  );
}

/** บรรทัดรองใต้งานถัดไปในตาราง — ขั้นย่อยตอนนี้ของขั้น (เช่น อนุมัติ 1/3) */
function SubLine({ nx }: { nx: ProjectNext }) {
  const label = subNow(nx);
  return (
    <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
      <span className="flex gap-0.5">{nx.subs.map((s, i) => <span key={s} title={s} className={`h-1.5 w-3 rounded-full ${subTone(nx, i)}`} />)}</span>
      {label && <span className={nx.back != null ? "font-semibold text-red-600" : ""}>{label}</span>}
    </div>
  );
}
