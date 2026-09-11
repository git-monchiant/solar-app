"use client";

/**
 * แท็บ SLA Tracking — ตารางติดตาม SLA ของ Lead รายหนึ่ง
 *
 * ต่างจากแท็บ Timeline ตรงที่ Timeline เล่า "สิ่งที่เกิดขึ้นจริงเรียงตามเวลา" จึงมี
 * เฉพาะขั้นที่เดินมาถึงแล้ว ส่วนหน้านี้เป็น "แบบฟอร์มตรวจสอบ" ที่ต้องแสดงครบทุก
 * ขั้นตอนเสมอ ขั้นที่ยังไม่ถึงก็ต้องเห็นว่ายังไม่ถึง ไม่ใช่หายไปเฉย ๆ คนอ่านจะได้
 * รู้ว่าทั้งกระบวนการมีกี่ด่านและ Lead รายนี้เดินมาถึงไหนแล้ว
 *
 * แถวยึดตาม SLA_POLICY_ORDER เสมอ ไม่ได้ยึดตามข้อมูลที่มี ถ้าวันหลังเพิ่มนโยบาย
 * ใหม่ใน SLA_POLICY_ORDER ตารางนี้จะมีแถวเพิ่มให้เองโดยไม่ต้องแก้ไฟล์นี้
 */

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { formatThaiDate, formatThaiTime } from "@/lib/utils/formatters";
import {
  SLA_POLICY_ORDER,
  SLA_TEAM,
  slaTaskLabel,
  slaTeamOf,
} from "@/lib/sla-display";

type SlaInstance = {
  id: number;
  policy_code: string;
  task_name: string | null;
  owner_role: "sales" | "solar" | null;
  owner_name: string | null;
  started_at: string | null;
  due_at: string | null;
  status: string;
  completed_at: string | null;
  breached_at: string | null;
};

type SlaPolicy = {
  policy_code: string;
  name_th: string | null;
  target_minutes: number | null;
  warning_minutes: number | null;
  deadline_rule: string | null;
  config_json: string | null;
};

/** ผลของแต่ละขั้นเมื่อมองย้อนหลัง — ใช้คุมทั้งสีและคำ จะได้ไม่หลุดกัน */
type RowResult = "on_time" | "late" | "open" | "breached" | "cancelled" | "not_started";

const RESULT: Record<RowResult, { label: string; chip: string }> = {
  on_time:     { label: "ภายในกำหนด SLA",  chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  late:        { label: "เกินกำหนด SLA",    chip: "bg-rose-50 text-rose-700 border-rose-200" },
  breached:    { label: "เกินกำหนด SLA",    chip: "bg-red-50 text-red-700 border-red-200" },
  open:        { label: "อยู่ระหว่างดำเนินการ", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  cancelled:   { label: "ยกเลิกรายการ",     chip: "bg-gray-50 text-gray-500 border-gray-200" },
  not_started: { label: "ยังไม่ถึงขั้นตอนนี้",  chip: "bg-gray-50 text-gray-400 border-gray-200" },
};

function minutesText(minutes?: number | null): string {
  if (minutes == null || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} นาที`;
  const hours = minutes / 60;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ชั่วโมง`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} วัน`;
}

function durationText(fromIso?: string | null, toIso?: string | null): string {
  if (!fromIso || !toIso) return "—";
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  return minutesText(Math.max(1, Math.round(ms / 60_000)));
}

function stamp(value?: string | null): string {
  if (!value) return "—";
  return `${formatThaiDate(value)} ${formatThaiTime(value)}`;
}

/**
 * "SLA ที่ตั้งไว้" ของขั้นตอนหนึ่ง — ต้องเป็นค่าที่ตั้งไว้จริงในนโยบายเท่านั้น
 *
 * ห้ามคำนวณจาก เริ่มนับ→ครบกำหนด ของรอบที่เกิดขึ้นจริง เพราะบางนโยบายผูกกับ
 * เวลานาฬิกา (ติดต่อครั้งแรกต้องจบภายใน 23:59 ของวันนั้น) ค่าที่ได้จึงเปลี่ยนไป
 * ทุก Lead ตามเวลาที่รับเข้ามา เช่น 13.1 ชั่วโมง ซึ่งไม่ใช่ "ข้อตกลง" ที่ใครตั้งไว้
 * นโยบายพวกนี้เก็บกติกาไว้ใน config_json จึงอ่านจากตรงนั้นมาอธิบายแทนตัวเลข
 */
function slaTargetLines(policy?: SlaPolicy): string[] {
  if (!policy) return ["—"];
  if (policy.target_minutes) return [minutesText(policy.target_minutes)];

  let config: Record<string, unknown> = {};
  try { config = policy.config_json ? JSON.parse(policy.config_json) : {}; } catch { config = {}; }

  if (policy.deadline_rule === "BANGKOK_CONTACT_WINDOW") {
    const day = String(config.dayWindow ?? "09:00-19:00").replace("-", "–");
    const dayDeadline = String(config.dayDeadline ?? "23:59:59").slice(0, 5);
    const nightDeadline = String(config.nightDeadline ?? "12:00:00").slice(0, 5);
    // สองเงื่อนไขคนละบรรทัด อ่านทีละข้อได้ ไม่ต้องไล่หาจุดคั่นกลางพืดข้อความ
    return [
      `รับ ${day} ภายใน ${dayDeadline} วันเดียวกัน`,
      `นอกเวลา ภายใน ${nightDeadline} วันถัดไป`,
    ];
  }
  if (policy.deadline_rule === "SEQUENTIAL_CALENDAR_DAYS") {
    const days = Array.isArray(config.daysBySequence) ? config.daysBySequence : [];
    if (days.length) return [`${days.join(" / ")} วัน`, "(ตามรอบที่ติดตาม)"];
  }
  return ["—"];
}

/** เกินกำหนดมาแล้วเท่าไร — งานที่ปิดแล้ววัดถึงเวลาปิด งานที่ยังค้างวัดถึงตอนนี้ */
function overdueText(instance?: SlaInstance): string {
  if (!instance?.due_at) return "";
  const endedAt = instance.completed_at ? Date.parse(instance.completed_at) : Date.now();
  const over = endedAt - Date.parse(instance.due_at);
  if (!Number.isFinite(over) || over <= 0) return "";
  return minutesText(Math.max(1, Math.round(over / 60_000)));
}

function resultOf(instance?: SlaInstance): RowResult {
  if (!instance) return "not_started";
  if (instance.status === "cancelled") return "cancelled";
  if (instance.completed_at) return instance.breached_at ? "late" : "on_time";
  if (instance.status === "breached") return "breached";
  return "open";
}

export default function LeadSlaTracking({ leadId }: { leadId: number }) {
  const [items, setItems] = useState<SlaInstance[]>([]);
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/leads/${leadId}/sla`);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setPolicies(Array.isArray(data?.policies) ? data.policies : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ไม่สามารถโหลดข้อมูล SLA ได้");
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-6 text-sm text-gray-400">กำลังโหลดข้อมูล SLA…</div>;
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;

  const policyByCode = new Map(policies.map(p => [p.policy_code, p]));

  const rows = SLA_POLICY_ORDER.map((code, index) => {
    // หนึ่งขั้นตอนมีได้หลายรอบ (เช่น CONTACT_RETRY ตามครั้งที่ 1, 2, 3)
    // แถวสรุปยึดรอบล่าสุดที่ยังไม่ถูกยกเลิก แล้วบอกจำนวนรอบกำกับไว้
    const all = items.filter(item => item.policy_code === code);
    const live = all.filter(item => item.status !== "cancelled");
    const instance = (live.length ? live : all)[live.length ? live.length - 1 : all.length - 1];
    const policy = policyByCode.get(code);
    const result = resultOf(instance);
    const team = SLA_TEAM[slaTeamOf(code, instance?.owner_role)];
    return { code, index, all, instance, policy, result, team };
  });

  const done = rows.filter(r => r.result === "on_time").length;
  const lateCount = rows.filter(r => r.result === "late" || r.result === "breached").length;
  const openCount = rows.filter(r => r.result === "open").length;
  const notStarted = rows.filter(r => r.result === "not_started").length;

  return (
    <div className="p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-bold text-gray-800 uppercase tracking-wide">SLA Tracking</div>
          <div className="text-xs text-gray-500 mt-0.5">
            ทุกขั้นตอนของกระบวนการ ({rows.length} ขั้น) พร้อมกำหนดเวลาและผลการดำเนินงานจริง
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xxs font-semibold">
          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">ภายในกำหนด SLA {done}</span>
          <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">เกินกำหนด SLA {lateCount}</span>
          <span className="px-2 py-1 rounded-full bg-sky-50 text-sky-700">อยู่ระหว่างดำเนินการ {openCount}</span>
          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-500">ยังไม่ถึง {notStarted}</span>
        </div>
      </div>

      {/* ตารางกว้างเกินจอมือถือแน่นอน ให้เลื่อนในกรอบตัวเอง ไม่ให้ทั้งหน้าเลื่อนแนวนอน */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[1080px] table-fixed border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="w-9 px-2 py-2 text-center font-semibold border-b border-gray-200">#</th>
              {/* ความกว้างคุมด้วย % — คอลัมน์ SLA เป็นข้อความกติกาที่ตัดบรรทัดได้
                  จึงบีบให้แคบ ส่วนระยะเวลาที่ใช้มีสองบรรทัด (ใช้ไป + เกินไปเท่าไร)
                  และห้ามตัดคำ จึงต้องกว้างพอ */}
              <th className="w-[16%] px-3 py-2 text-left font-semibold border-b border-gray-200">ขั้นตอน</th>
              <th className="w-[8%] px-3 py-2 text-left font-semibold border-b border-gray-200">ทีม</th>
              <th className="w-[13%] px-3 py-2 text-left font-semibold border-b border-gray-200">SLA</th>
              <th className="w-[10%] px-3 py-2 text-left font-semibold border-b border-gray-200">เริ่มนับ</th>
              <th className="w-[10%] px-3 py-2 text-left font-semibold border-b border-gray-200">ครบกำหนด</th>
              <th className="w-[10%] px-3 py-2 text-left font-semibold border-b border-gray-200">เสร็จจริง</th>
              <th className="w-[14%] px-3 py-2 text-left font-semibold border-b border-gray-200">ระยะเวลาที่ใช้</th>
              <th className="w-[9%] px-3 py-2 text-left font-semibold border-b border-gray-200">ผล</th>
              <th className="w-[10%] px-3 py-2 text-left font-semibold border-b border-gray-200">ผู้รับผิดชอบ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ code, index, all, instance, policy, result, team }) => {
              const muted = result === "not_started";
              return (
                <tr key={code} className={`border-b border-gray-100 last:border-0 ${muted ? "bg-gray-50/40" : ""}`}>
                  <td className={`px-2 py-2 text-center tabular-nums ${muted ? "text-gray-300" : "text-gray-400"}`}>
                    {index + 1}
                  </td>
                  <td className={`px-3 py-2 font-semibold ${muted ? "text-gray-400" : "text-gray-800"}`}>
                    {slaTaskLabel(code, instance?.task_name ?? policy?.name_th)}
                    {all.length > 1 && (
                      <span className="ml-1.5 font-normal text-gray-400">({all.length} รอบ)</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xxs font-bold ${muted ? "bg-gray-100 text-gray-400" : team.chip}`}>
                      {team.label}
                    </span>
                  </td>
                  {/* ค่าที่ตั้งไว้ในนโยบายเท่านั้น ไม่ใช่ค่าที่คำนวณจากรอบจริง — ดู slaTargetText() */}
                  <td className={`px-3 py-2 ${muted ? "text-gray-400" : "text-gray-700"}`}>
                    {slaTargetLines(policy).map((line, i) => <div key={i}>{line}</div>)}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${muted ? "text-gray-300" : "text-gray-600"}`}>
                    {stamp(instance?.started_at)}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${muted ? "text-gray-300" : "text-gray-600"}`}>
                    {stamp(instance?.due_at)}
                  </td>
                  {/* ช่อง Actual ที่ผู้ใช้ขอ — ยังไม่เสร็จก็เว้นว่างไว้ ไม่เดาแทน */}
                  <td className={`px-3 py-2 whitespace-nowrap font-semibold ${
                    result === "on_time" ? "text-emerald-700"
                    : result === "late" ? "text-rose-600"
                    : "text-gray-300"}`}>
                    {stamp(instance?.completed_at)}
                  </td>
                  {/* งานที่ยังไม่จบต้องเห็นว่าเดินมากี่วันแล้ว ไม่ใช่ขีดว่าง และถ้าเลยกำหนด
                      ต้องบอกตรงนี้ว่าเกินไปเท่าไร — ไม่งั้นหน้ารายการบอก "เกิน 5 วัน"
                      แต่เปิดเข้ามาแล้วหาไม่เจอว่าเกินตรงไหน */}
                  <td className={`px-3 py-2 whitespace-nowrap ${muted ? "text-gray-300" : "text-gray-700"}`}>
                    {instance?.completed_at
                      ? durationText(instance.started_at, instance.completed_at)
                      : instance?.started_at && result !== "cancelled"
                      ? <span className="text-gray-500">{durationText(instance.started_at, new Date().toISOString())} <span className="text-gray-400">(ยังไม่จบ)</span></span>
                      : "—"}
                    {(result === "breached" || result === "late") && overdueText(instance) && (
                      <div className={`font-semibold ${result === "late" ? "text-rose-600" : "text-red-600"}`}>
                        เกิน {overdueText(instance)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded border px-1.5 py-0.5 text-xxs font-bold whitespace-nowrap ${RESULT[result].chip}`}>
                      {RESULT[result].label}
                    </span>
                  </td>
                  <td className={`px-3 py-2 ${muted ? "text-gray-300" : "text-gray-600"}`}>
                    {instance?.owner_name || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
