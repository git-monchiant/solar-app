"use client";
import { BoltIcon, CheckIcon, ChevronLeftIcon, ClockIcon, DocumentIcon, LineIcon, PhoneIcon, UserIcon, XIcon } from "@/components/ui/icons";

import { apiFetch } from "@/lib/api";
import { stripThaiTitle, houseNumberOrNull } from "@/lib/utils/name";
import { useEffect, useState, use, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import ActivityTimeline from "@/components/lead/detail/ActivityTimeline";
import SerialsUploader from "@/components/lead/detail/SerialsUploader";
import PhotosTab from "@/components/lead/detail/PhotosTab";
import AddActivityModal, { ActivityType } from "@/components/lead/detail/AddActivityModal";
import AssignOwnerButton from "@/components/lead/AssignOwnerButton";
import LostModal from "@/components/lead/detail/LostModal";
import ProfileModal from "@/components/lead/detail/ProfileModal";
import LinePickerModal from "@/components/modal/LinePickerModal";
import { getSourceStyle } from "@/lib/source-tag";
import { Activity } from "@/components/lead/detail/ActivityItem";
import PreSurveyStep from "@/components/lead/detail/steps/PreSurveyStep";
import PreSurveyForm, { type PreSurveyFormHandle, DECISION_FACTORS } from "@/components/lead/detail/steps/PreSurveyForm";
import ModalBase from "@/components/ui/ModalBase";
import Dropdown from "@/components/ui/Dropdown";
import NumberStepper from "@/components/ui/NumberStepper";
import SurveyStep from "@/components/lead/detail/steps/SurveyStep";
import QuoteStep from "@/components/lead/detail/steps/QuoteStep";
import OrderStep from "@/components/lead/detail/steps/OrderStep";
import InstallStep from "@/components/lead/detail/steps/InstallStep";
import WarrantyStep from "@/components/lead/detail/steps/WarrantyStep";
import GridTieStep from "@/components/lead/detail/steps/GridTieStep";
import type { Lead, Package, CardStateKind } from "@/components/lead/detail/steps/types";
import { useDialog } from "@/components/ui/Dialog";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { formatThaiDate as formatDate, formatThaiTime, formatNumber } from "@/lib/utils/formatters";
import { INFO_LABELS, PRIMARY_REASON_LABEL } from "@/lib/constants/info-labels";
import FallbackImage from "@/components/ui/FallbackImage";

const formatAcUnits = (s: string | null): string | null => {
  if (!s) return null;
  const parts = s.split(",").map(p => {
    const [btu, count] = p.split(":").map(Number);
    return !isNaN(btu) && count > 0 ? `${formatNumber(btu)} BTU × ${count}` : null;
  }).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
};

const formatList = (s: string | null, labels: Record<string, string>): string | null => {
  if (!s) return null;
  return s.split(",").filter(Boolean).map(v => labels[v] || v).join(" · ");
};

const otherOrLabel = (v: string | null, labels: Record<string, string>): string | null => {
  if (!v) return null;
  if (v.startsWith("other:")) return v.slice(6) || null;
  return labels[v] || v;
};

// Questionnaire (PreSurveyForm §1-§8) label maps. Codes MUST stay in sync
// with the option arrays in PreSurveyForm.tsx — when the form picker shows
// "เคย", the DB stores "yes", and the info tab needs to render "เคย" back.
// Keep this map sorted by section so it's easy to diff against the form.
const Q_LABELS: Record<string, Record<string, string>> = {
  // §1 House + occupants
  houseAge:           { lt5: "ต่ำกว่า 5 ปี", "5_10": "5-10 ปี", "10_20": "10-20 ปี", gt20: "มากกว่า 20 ปี" },
  // §2 Bill + meter
  meterSize:          { "15_45": "15(45) A", "30_100": "30(100) A", unknown: "ไม่ทราบ" },
  // §3 Lifestyle
  yesNoLifestyle:     { yes: "ใช่", no: "ไม่ใช่" },                                            // home_at_daytime, work_at_home
  daytimeOccupants:   { family: "ทั้งครอบครัว", elderly: "ผู้สูงอายุ", kids: "เด็กเล็ก", pets: "สัตว์เลี้ยง" },
  businessType:       { online_live: "ขายของ Online / Live", online_edu: "เรียน Online", retail: "ค้าขาย" },
  workDaysPerWeek:    { "1_2": "1-2 วัน/สัปดาห์", "3_5": "3-5 วัน/สัปดาห์", daily: "ทุกวัน" },
  evChargePeriod:     { day: "กลางวัน", night: "กลางคืน" },
  // §4 Future plans
  yesNoConsidering:   { yes: "มี", no: "ไม่มี", considering: "กำลังพิจารณา" },                  // future_ev, future_ev_charger
  yesNoBin:           { yes: "มี", no: "ไม่มี" },                                              // future_extend_home, future_more_members, future_smart_home
  yesNoMaybe:         { yes: "มี", no: "ไม่มี", maybe: "ยังไม่แน่ใจ" },                          // future_battery
  // §5 Energy security
  outagePriorities:   { ac: "แอร์", lights: "ไฟส่องสว่าง", internet: "Internet", cctv: "กล้องวงจรปิด", fridge: "ตู้เย็น", ev_charger: "EV Charger", gate: "ระบบประตูรั้ว", ups: "ระบบสำรองฉุกเฉิน" },
  billRiseAction:     { now: "ลดค่าไฟทันที", longterm: "ควบคุมค่าใช้จ่ายระยะยาว", prepare: "เตรียมบ้านประหยัดพลังงาน" },
  // §6 Home health
  everNever:          { yes: "เคย", no: "ไม่เคย" },                                            // had_roof_leak, did_roof_repair, etc.
  // §7 Future energy posture
  ableOrNot:          { yes: "ได้", no: "ไม่ได้" },                                            // self_generates, blackout_resilient
  evReady:            { ready: "พร้อม", not_yet: "ยังไม่พร้อม", unsure: "ไม่แน่ใจ" },
  usageTrend:         { more: "มากขึ้น", same: "เท่าเดิม", less: "น้อยลง" },
  // §8 Decision making
  decisionTimeline:   { "1-3m": "ภายใน 1-3 เดือน", "6m": "ภายใน 6 เดือน", "1y+": "มากกว่า 1 ปี" },
};

// Decode a single coded value to its form label. Handles the "other"/"other:..."
// free-text pattern PreSurveyForm uses across every chip group.
const qLabel = (v: string | null | undefined, kind: keyof typeof Q_LABELS): string | null => {
  if (!v) return null;
  if (typeof v === "string" && v.startsWith("other:")) return v.slice(6) || "อื่นๆ";
  if (v === "other") return "อื่นๆ";
  const map = Q_LABELS[kind] || {};
  return map[v] || v;
};

// Decode a comma-separated multi-select (daytime_occupants, outage_priorities)
// into "label1, label2, อื่นๆ: free text".
const qCsvLabel = (csv: string | null | undefined, kind: keyof typeof Q_LABELS): string | null => {
  if (!csv) return null;
  const parts = csv.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map(p => qLabel(p, kind)).filter(Boolean).join(", ");
};

// Convert a Q_LABELS map (code -> Thai label) into an ordered dropdown
// options list. Insertion order is preserved, matching the picker order in
// PreSurveyForm.
const optsFromQ = (kind: keyof typeof Q_LABELS): { value: string; label: string }[] =>
  Object.entries(Q_LABELS[kind]).map(([value, label]) => ({ value, label }));
// Same for the INFO_LABELS maps (residence, roofShape, peakUsage,
// electricalPhase). Those live on lead.pre_* and don't share the Q_LABELS map.
const optsFromInfo = (m: Record<string, string>): { value: string; label: string }[] =>
  Object.entries(m).map(([value, label]) => ({ value, label }));

// §8 Decision Factors: JSON like { factor_key: number, other: { score, text } }.
// Render as "ชื่อปัจจัย: ★★★☆☆" style so reviewers see priorities at a glance.
const DECISION_FACTOR_LABEL: Record<string, string> = {
  price:       "ราคา",
  reputation:  "ชื่อเสียงบริษัท",
  warranty:    "การรับประกัน",
  quality:     "คุณภาพอุปกรณ์",
  experience:  "ประสบการณ์",
  speed:       "ความรวดเร็ว",
  service:     "บริการหลังการขาย",
};
const formatDecisionFactors = (json: string | null): string | null => {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as Record<string, number | { score?: number; text?: string }>;
    const parts: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (key === "other") {
        const o = val as { score?: number; text?: string };
        if (o?.text && o.score) parts.push(`${o.text}: ${"★".repeat(o.score)}${"☆".repeat(5 - o.score)}`);
        continue;
      }
      if (typeof val === "number" && val > 0) {
        parts.push(`${DECISION_FACTOR_LABEL[key] || key}: ${"★".repeat(val)}${"☆".repeat(5 - val)}`);
      }
    }
    return parts.length ? parts.join(" · ") : null;
  } catch { return null; }
};

function InfoSection({
  id,
  title,
  filled,
  total,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  filled: number;
  total: number;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-2 px-1 py-1.5 hover:bg-gray-50 rounded transition-colors text-left"
        style={{ minHeight: 0 }}
      >
        <svg
          className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-semibold text-gray-700 flex-1 truncate">{title}</span>
        <span className={`text-xxs font-mono tabular-nums shrink-0 ${filled === 0 ? "text-gray-300" : filled === total ? "text-emerald-600" : "text-gray-400"}`}>
          {filled}/{total}
        </span>
      </button>
      {open && (
        <div className="ml-1.5 pl-3 border-l border-gray-200 mt-0.5 mb-1">
          {children}
        </div>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value == null || value === "" || value === false;
  return (
    <div className="flex items-baseline gap-3 py-1 text-sm">
      <span className="text-gray-500 shrink-0 min-w-[7.5rem]">{label}</span>
      <span className={`flex-1 ${empty ? "text-gray-300 italic" : "font-medium text-gray-800 whitespace-pre-wrap"}`}>
        {empty ? "—" : value}
      </span>
    </div>
  );
}

const isFilled = (v: unknown) => v != null && v !== "" && v !== false;

// Editable card for the PreSurvey questionnaire tree — swaps the read-only
// value for a matching input (Dropdown / number / multi-chip / read-only)
// based on `kind`. Every change fires the parent's `onCommit` immediately,
// which debounces + PATCHes the lead row. The `readonly` kind is the escape
// hatch for values we don't yet know how to edit inline (stars / JSON).
type QCellKind = "dropdown" | "number" | "stepper" | "multi_csv" | "text" | "factors" | "bill_range" | "ac_split" | "readonly";
interface QCellProps {
  label: string;
  kind: QCellKind;
  /** Raw value from lead row (not the formatted display). */
  value: string | number | null | undefined;
  /** For dropdown / multi_csv — [{value, label}] in display order. */
  options?: { value: string; label: string }[];
  /** Suffix shown after number inputs, e.g. "คน" / "บาท" — cosmetic only. */
  suffix?: string;
  /** Red asterisk after the label — marks required questionnaire fields
   * so the info tab matches the workflow form's visual affordance. */
  required?: boolean;
  /** Enables the "อื่นๆ ระบุ..." free-text input on dropdown kind — text
   * gets tucked onto the code as `other:<free text>` (same pattern the
   * PreSurveyForm uses everywhere). */
  allowOther?: boolean;
  /** Optional icon rendered on the left inside every chip button (dropdown
   * kind only). Used for questions where a symbol helps parse the option
   * at a glance — e.g. a clock next to each time-range chip. */
  chipIcon?: React.ReactNode;
  /** Fallback display for `readonly` kind (already-formatted string). */
  readonlyDisplay?: React.ReactNode;
  /** Called with the new raw value; parent handles the PATCH + refresh. */
  onCommit: (next: string | number | null) => void;
}
function EditableQCell({ label, kind, value, options, suffix, required, allowOther, chipIcon, readonlyDisplay, onCommit }: QCellProps) {
  const currentStr = value == null ? "" : String(value);
  // Chip button — exact mirror of PreSurveyForm.chipBtn so the info tab
  // reads as the same questionnaire the customer answers in the workflow.
  const chip = (selected: boolean) =>
    `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
      selected
        ? "bg-active text-white border-active shadow-sm shadow-active/20"
        : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
    }`;
  // For steppers, tuck the unit into the label so the input row shows only
  // the − / value / + control (no trailing "คน" clutter). Other kinds keep
  // suffix as an inline chip beside the input.
  const inlineSuffix = kind !== "stepper";
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {!inlineSuffix && suffix && (
          <span className="ml-1 text-gray-400 font-normal">({suffix})</span>
        )}
      </label>
      {kind === "dropdown" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {(options ?? []).map((opt) => {
              // "other" is active whenever the current value is either
              // literally "other" OR the "other:<free text>" form — same
              // affordance PreSurveyForm uses.
              const isOtherOpt = opt.value === "other";
              const active = isOtherOpt ? currentStr.startsWith("other") : currentStr === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onCommit(active ? null : opt.value)}
                  className={`${chip(active)} ${chipIcon ? "inline-flex items-center justify-start gap-1.5" : ""}`}
                >
                  {chipIcon && <span className="shrink-0">{chipIcon}</span>}
                  {opt.label}
                </button>
              );
            })}
          </div>
          {allowOther && currentStr.startsWith("other") && (
            <input
              type="text"
              placeholder="ระบุ..."
              defaultValue={currentStr.startsWith("other:") ? currentStr.slice(6) : ""}
              onBlur={e => {
                const t = e.target.value.trim();
                onCommit(t ? `other:${t}` : "other");
              }}
              className="w-full mt-2 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active"
            />
          )}
        </>
      )}
      {kind === "number" && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {/* Number input with suffix tucked INSIDE (absolute-positioned on
              the right edge) — no separate "บาท / คน" chip beside it. */}
          <div className="col-span-2 relative">
            <input
              type="number"
              inputMode="numeric"
              defaultValue={currentStr}
              onBlur={(e) => {
                const v = e.target.value.trim();
                onCommit(v === "" ? null : Number(v));
              }}
              className={`w-full h-8 pl-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-active ${suffix ? "pr-12" : "pr-3"}`}
            />
            {suffix && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium pointer-events-none">
                {suffix}
              </span>
            )}
          </div>
        </div>
      )}
      {kind === "stepper" && (
        <NumberStepper
          value={typeof value === "number" ? value : (currentStr === "" ? null : Number(currentStr))}
          onChange={(v) => onCommit(v)}
        />
      )}
      {kind === "multi_csv" && (
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {(options ?? []).map((opt) => {
            const set = new Set(currentStr.split(",").map((s) => s.trim()).filter(Boolean));
            const active = set.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (active) set.delete(opt.value); else set.add(opt.value);
                  onCommit(set.size ? Array.from(set).join(",") : null);
                }}
                className={chip(active)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      {kind === "text" && (
        <input
          type="text"
          defaultValue={currentStr}
          onBlur={(e) => onCommit(e.target.value.trim() || null)}
          className="w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-active"
        />
      )}
      {kind === "factors" && (() => {
        // Decision-factor scores live in one JSON blob:
        //   { <factor_key>: 1..5, other: { score, text } }
        // Every button click rewrites the whole blob so we can PATCH the
        // single `decision_factors` column in one shot.
        type F = Record<string, number> & { other?: { score?: number; text?: string } };
        let parsed: F = {};
        if (currentStr) {
          try { parsed = JSON.parse(currentStr) as F; } catch { parsed = {}; }
        }
        const setScore = (key: string, score: number) => {
          const next: F = { ...parsed };
          const cur = (next as Record<string, unknown>)[key];
          if (cur === score) delete (next as Record<string, unknown>)[key]; else (next as Record<string, unknown>)[key] = score;
          const hasAny = DECISION_FACTORS.some(f => typeof (next as Record<string, number>)[f.key] === "number") || (next.other && (next.other.score || next.other.text));
          onCommit(hasAny ? JSON.stringify(next) : null);
        };
        const setOtherScore = (score: number) => {
          const next: F = { ...parsed };
          const cur = next.other?.score;
          const nextOther: { score?: number; text?: string } = { ...(next.other || {}) };
          if (cur === score) delete nextOther.score; else nextOther.score = score;
          if (nextOther.score == null && !nextOther.text) delete next.other;
          else next.other = nextOther;
          const hasAny = DECISION_FACTORS.some(f => typeof (next as Record<string, number>)[f.key] === "number") || (next.other && (next.other.score || next.other.text));
          onCommit(hasAny ? JSON.stringify(next) : null);
        };
        const setOtherText = (text: string) => {
          const next: F = { ...parsed };
          const nextOther: { score?: number; text?: string } = { ...(next.other || {}) };
          if (text.trim()) nextOther.text = text.trim(); else delete nextOther.text;
          if (nextOther.score == null && !nextOther.text) delete next.other;
          else next.other = nextOther;
          const hasAny = DECISION_FACTORS.some(f => typeof (next as Record<string, number>)[f.key] === "number") || (next.other && (next.other.score || next.other.text));
          onCommit(hasAny ? JSON.stringify(next) : null);
        };
        return (
          <div className="space-y-3">
            {DECISION_FACTORS.map((f, i) => {
              const score = (parsed as Record<string, number>)[f.key];
              return (
                <div key={f.key} className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center">
                  <label className="text-xs text-gray-700 md:col-span-3">
                    <span className="font-mono tabular-nums text-gray-400 mr-1.5">{i + 1}.</span>
                    {f.label}
                  </label>
                  {/* Score row anchored to col 4/7 so the 1-5 buttons align
                      with the rest of the questionnaire's 7-col grid. Uses
                      an inner grid of 5 equal columns so every button
                      stretches to fill its cell (easier to tap). */}
                  <div className="md:col-span-4 grid grid-cols-5 gap-1.5">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} type="button" onClick={() => setScore(f.key, n)}
                        className={`h-11 rounded-lg border text-base font-semibold transition-all ${score === n ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200 hover:border-active/40"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2 items-center pt-2 border-t border-gray-100">
              <div className="md:col-span-3 flex items-center gap-1.5">
                <span className="font-mono tabular-nums text-gray-400 text-xs">{DECISION_FACTORS.length + 1}.</span>
                <input type="text" placeholder="อื่นๆ ระบุ..." defaultValue={parsed.other?.text || ""}
                  onBlur={e => setOtherText(e.target.value)}
                  className="flex-1 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
              </div>
              <div className="md:col-span-4 grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setOtherScore(n)}
                    className={`h-11 rounded-lg border text-base font-semibold transition-all ${parsed.other?.score === n ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200 hover:border-active/40"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
      {kind === "bill_range" && (() => {
        // Number input + 5 read-only range chips that auto-tick the bucket
        // the typed value falls into — mirrors PreSurveyForm's "ค่าไฟต่อเดือน"
        // row (input col-span-1, chips col-span-1 each = 6/7 used).
        const bill = typeof value === "number" ? value : (currentStr === "" ? null : Number(currentStr));
        const ranges = [
          { key: "lt2k",  label: "< 2,000",       test: (b: number) => b < 2000 },
          { key: "2k4k",  label: "2,000-4,000",   test: (b: number) => b >= 2000 && b < 4000 },
          { key: "4k6k",  label: "4,000-6,000",   test: (b: number) => b >= 4000 && b < 6000 },
          { key: "6k10k", label: "6,000-10,000",  test: (b: number) => b >= 6000 && b <= 10000 },
          { key: "gt10k", label: "> 10,000",      test: (b: number) => b > 10000 },
        ] as const;
        return (
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            <div className="relative col-span-2 md:col-span-2">
              <input
                type="number"
                inputMode="numeric"
                defaultValue={currentStr}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  onCommit(v === "" ? null : Number(v));
                }}
                className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-active"
                placeholder="เช่น 3,500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">บาท</span>
            </div>
            {ranges.map(r => {
              const active = bill != null && r.test(bill);
              return (
                <div key={r.key}
                  className={`col-span-1 md:col-span-1 h-8 px-2 rounded-lg border flex items-center gap-1.5 text-xs select-none ${
                    active ? "border-active bg-active-light text-active" : "border-gray-200 bg-gray-50 text-gray-400"
                  }`}>
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                    active ? "border-active bg-active text-white" : "border-gray-300 bg-white"
                  }`}>
                    {active && (
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate">{r.label}</span>
                </div>
              );
            })}
          </div>
        );
      })()}
      {kind === "ac_split" && (() => {
        // JSON blob: { day: {"9000": 3, ...}, night: {...} } — one +/- row
        // per BTU tier per period. Layout: 2 cards (day / night) at
        // col-span-2 each in the 7-col grid, so 4/7 total.
        type AS = { day: Record<string, number>; night: Record<string, number> };
        const TIERS = [
          { key: "9000",    label: "9,000 BTU" },
          { key: "12000",   label: "12,000 BTU" },
          { key: "18000",   label: "18,000 BTU" },
          { key: "24000",   label: "24,000 BTU" },
          { key: "gt24000", label: ">24,000 BTU" },
        ] as const;
        const emptySplit = (): AS => ({
          day:   Object.fromEntries(TIERS.map(t => [t.key, 0])),
          night: Object.fromEntries(TIERS.map(t => [t.key, 0])),
        });
        const parsed: AS = emptySplit();
        if (currentStr) {
          try {
            const p = JSON.parse(currentStr) as Partial<AS>;
            if (p.day)   for (const k of Object.keys(p.day))   if (k in parsed.day)   parsed.day[k]   = p.day[k]   || 0;
            if (p.night) for (const k of Object.keys(p.night)) if (k in parsed.night) parsed.night[k] = p.night[k] || 0;
          } catch { /* keep empty */ }
        }
        const setCount = (period: "day" | "night", tier: string, next: number) => {
          const clamped = Math.max(0, next);
          const nextSplit: AS = {
            day:   { ...parsed.day },
            night: { ...parsed.night },
          };
          nextSplit[period][tier] = clamped;
          const hasAny = TIERS.some(t => (nextSplit.day[t.key] || 0) > 0 || (nextSplit.night[t.key] || 0) > 0);
          onCommit(hasAny ? JSON.stringify(nextSplit) : null);
        };
        return (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {(["day", "night"] as const).map(period => (
              <div key={period} className="md:col-span-2 rounded-lg border border-gray-200 bg-white/50 p-3">
                <div className="block text-xs text-gray-500 mb-1.5">
                  ช่วง{period === "day" ? "กลางวัน" : "กลางคืน"}
                </div>
                <div className="space-y-2">
                  {TIERS.map(t => {
                    const v = parsed[period][t.key] || 0;
                    return (
                      <div key={t.key} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-700">{t.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => setCount(period, t.key, v - 1)} disabled={v === 0} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold flex items-center justify-center hover:border-active/40 hover:text-active disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
                          <span className="w-7 text-center text-sm font-mono tabular-nums text-gray-800">{v}</span>
                          <button type="button" onClick={() => setCount(period, t.key, v + 1)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold flex items-center justify-center hover:border-active/40 hover:text-active transition-colors">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
      {kind === "readonly" && (
        <div className={`text-sm leading-snug ${readonlyDisplay ? "font-medium text-gray-800" : "text-gray-400 italic"}`}>
          {readonlyDisplay || "—"}
        </div>
      )}
    </div>
  );
}

// Section-title icon set — same mapping PreSurveyForm uses so the info tab
// tree carries the same visual anchors (star for the top question, user for
// profile, bolt for bills, document for lifestyle/future).
function qSectionIcon(id: string) {
  const wrap = "w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0";
  if (id === "q1") return <span className={wrap}><UserIcon className="w-4 h-4" /></span>;
  if (id === "q2") return <span className={wrap}><BoltIcon className="w-4 h-4" strokeWidth={1.8} /></span>;
  return <span className={wrap}><DocumentIcon className="w-4 h-4" /></span>;
}

const STEP_ORDER = ["pre_survey", "survey", "quote", "order", "install", "warranty", "gridtie"];

const STEP_TEAMS: Record<number, string> = {
  0: "SMARTIFY",
  1: "SOLAR",
  2: "SOLAR",
  3: "SMARTIFY",
  4: "SOLAR",
  5: "SOLAR",
  6: "SOLAR",
};

function stepIndex(status: string) {
  if (status === "closed") return STEP_ORDER.length;
  // Strip pre_survey-NN substep so the main step still maps correctly.
  const main = status.split('-')[0];
  return STEP_ORDER.indexOf(main);
}

// Top-level stable component: children keep the same React tree position across
// fullscreen toggles, so in-progress form state (textareas, inputs) is preserved.
// Fullscreen is CSS-only (position:fixed) — no portal, no duplication.
function StepCard({
  stepIdx,
  state,
  title,
  doneTitle,
  icon,
  lead,
  isMobile,
  fullscreen,
  setFullscreen,
  onHeaderClick,
  children,
}: {
  stepIdx: number;
  state: CardStateKind;
  title: string;
  doneTitle?: string;
  icon: string;
  lead: Lead;
  isMobile: boolean;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  onHeaderClick?: () => void;
  children: React.ReactNode;
}) {
  const stepNum = String(stepIdx + 1).padStart(2, "0");
  const team = STEP_TEAMS[stepIdx];

  const container = state === "active"
    ? "bg-active-light border border-active shadow-sm shadow-active/10 ring-1 ring-active/20"
    : state === "done"
    ? "bg-white border border-gray-300"
    : "bg-gray-50 border border-dashed border-gray-200 pointer-events-none";

  const iconBox = state === "active"
    ? "bg-active text-white"
    : state === "done"
    ? "bg-emerald-500 text-white"
    : "bg-white text-gray-300 ring-1 ring-inset ring-gray-200";

  const inlineClick = fullscreen
    ? undefined
    : state === "active" && isMobile
      ? () => setFullscreen(true)
      : onHeaderClick;
  const headerClickable = !!inlineClick;

  const header = (
    <div
      className={`flex items-center gap-3 px-5 py-4 ${headerClickable ? "cursor-pointer" : ""}`}
      onClick={inlineClick}
    >
      <div className={`w-10 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBox}`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold tracking-wider uppercase leading-none ${state === "locked" ? "text-gray-300" : "text-gray-400"}`}>
          Step {stepNum} · {team}
        </div>
        <div className={`text-base font-bold leading-tight tracking-tight mt-1 ${state === "locked" ? "text-gray-400" : "text-gray-900"}`}>
          {state === "done" && doneTitle ? doneTitle : title}
        </div>
      </div>
      {state === "active" && (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFullscreen(!fullscreen); }}
            aria-label={fullscreen ? "ปิดเต็มจอ" : "เปิดเต็มจอ"}
            className="md:hidden w-7 h-7 rounded-md text-gray-500 hover:text-active hover:bg-active/5 flex items-center justify-center transition-colors"
            title={fullscreen ? "ปิดเต็มจอ" : "เปิดเต็มจอ"}
            style={{ minHeight: 0 }}
          >
            {fullscreen ? (
              <XIcon className="w-4 h-4" strokeWidth={2} />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-active">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-active opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-active" />
            </span>
            Active
          </span>
        </div>
      )}
      {state === "done" && (() => {
        const paidStep =
          (stepIdx === 0 && (lead.payment_confirmed || lead.pre_slip_url)) ||
          (stepIdx === 3 && lead.order_before_paid) ||
          (stepIdx === 4 && lead.order_after_paid);
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider shrink-0 ${paidStep ? "text-blue-600" : "text-teal-600"}`}>
            ✓ {paidStep ? "Paid" : "Done"}
          </span>
        );
      })()}
    </div>
  );

  const rootCls = fullscreen
    ? "fixed inset-0 z-[9999] bg-white flex flex-col safe-top"
    : `group relative rounded-2xl overflow-hidden transition-all ${container}`;
  const bodyCls = fullscreen
    ? "flex-1 overflow-y-auto p-4 safe-bottom"
    : "px-5 pb-5 pt-3 border-t border-gray-100";
  const headerWrapCls = fullscreen ? "shrink-0 border-b border-gray-100" : "";

  return (
    <div id={`step-${stepIdx}`} data-step-active={state === "active" ? "" : undefined} className={rootCls}>
      <div className={headerWrapCls}>{header}</div>
      {state !== "locked" && <div className={bodyCls}>{children}</div>}
    </div>
  );
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") === "1";
  const dialog = useDialog();
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  type TimelinePayment = { id: number; step_no: number; slip_field: string; amount: number; confirmed_at: string | null; confirmed_by_name: string | null; submitted_at: string | null; submitted_by_name: string | null };
  const [paymentRows, setPaymentRows] = useState<TimelinePayment[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingLead, setLoadingLead] = useState(true);
  const [loadingAct, setLoadingAct] = useState(true);
  const [modalType, setModalType] = useState<ActivityType | null>(null);
  const [showLostModal, setShowLostModal] = useState(false);
  const [tab, setTab] = useState<"info" | "workflow" | "timeline" | "serials" | "photos" | "log">("workflow");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    contact: true, address: true, interest: true, usage: true, system: true, finance: true, source: true, note: true,
    // PreSurvey tree — every section expanded by default so reviewers see
    // every question + answer at first glance without clicking through.
    q_tree: true,
    "q_tree.q1": true, "q_tree.q2": true, "q_tree.q3": true, "q_tree.q4": true,
    "q_tree.q5": true, "q_tree.q6": true, "q_tree.q7": true, "q_tree.q8": true,
  });
  const toggleSection = (id: string) => setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  const [showLineModal, setShowLineModal] = useState(false);
  // Info-tab "แก้ไข" for the PreSurvey questionnaire — opens a modal wrapping
  // the same PreSurveyForm used in the workflow tab so the two views stay in
  // sync. Save on close via flushSave() → PATCH → refresh().
  const [editQuestionnaireOpen, setEditQuestionnaireOpen] = useState(false);
  const editQFormRef = useRef<PreSurveyFormHandle>(null);
  const [showUnmapLine, setShowUnmapLine] = useState(false);
  const [unmapping, setUnmapping] = useState(false);
  // Which step is expanded to full-screen on mobile (null = none).
  const [fullscreenStep, setFullscreenStep] = useState<number | null>(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    if (fullscreenStep === null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [fullscreenStep]);
  useEffect(() => {
    if (!lead) return;
    const name = stripThaiTitle(lead.full_name);
    const prev = document.title;
    const hn = houseNumberOrNull(lead.house_number);
    document.title = hn ? `${hn} - ${name}` : name;
    return () => { document.title = prev; };
  }, [lead]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [preSurveyExpanded, setPreSurveyExpanded] = useState(false);
  const [surveyExpanded, setSurveyExpanded] = useState(false);
  const [quoteExpanded, setQuoteExpanded] = useState(false);
  const [orderExpanded, setOrderExpanded] = useState(false);
  const [installExpanded, setInstallExpanded] = useState(false);
  const [warrantyExpanded, setWarrantyExpanded] = useState(false);
  const [gridTieExpanded, setGridTieExpanded] = useState(false);
  // Focus-mode step selector. When ?focus=1, we hide all step cards except
  // the one at `focusedStep` — user picks a different step via the small
  // numbered nav rendered above the cards. Defaults to null so the initial
  // "current step" pick lands via the currentStep effect below (needs lead
  // to be loaded first).
  const [focusedStep, setFocusedStep] = useState<number | null>(null);
  const [forceActiveStep, setForceActiveStep] = useState<number | null>(null);
  useEffect(() => {
    if (!lead || typeof window === "undefined") return;
    const key = `leadFocusStep_${lead.id}`;
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    localStorage.removeItem(key);
    const forceKey = `leadForceActiveStep_${lead.id}`;
    const forceRaw = localStorage.getItem(forceKey);
    if (forceRaw !== null) localStorage.removeItem(forceKey);
    const step = parseInt(raw, 10);
    if (!Number.isInteger(step) || step < 0 || step > 6) return;
    const forceStep = forceRaw !== null ? parseInt(forceRaw, 10) : null;
    if (tab !== "workflow") setTab("workflow");
    if (focus) setFocusedStep(step);
    if (forceStep !== null && Number.isInteger(forceStep) && forceStep >= 0 && forceStep <= 6) {
      setForceActiveStep(forceStep);
    }
    if (step === 0) setPreSurveyExpanded(true);
    if (step === 1) setSurveyExpanded(true);
    if (step === 2) setQuoteExpanded(true);
    if (step === 3) setOrderExpanded(true);
    if (step === 4) setInstallExpanded(true);
    if (step === 5) setWarrantyExpanded(true);
    if (step === 6) setGridTieExpanded(true);
    window.setTimeout(() => {
      document.getElementById(`step-${step}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
  }, [focus, lead, tab]);
  useEffect(() => {
    if (!lead || typeof window === "undefined") return;
    const onForceActiveStep = (event: Event) => {
      const detail = (event as CustomEvent<{ leadId?: number; step?: number }>).detail;
      if (!detail || detail.leadId !== lead.id) return;
      const step = detail.step;
      if (!Number.isInteger(step) || step == null || step < 0 || step > 6) return;
      if (tab !== "workflow") setTab("workflow");
      if (focus) setFocusedStep(step);
      setForceActiveStep(step);
      if (step === 3) setOrderExpanded(true);
      window.setTimeout(() => {
        document.getElementById(`step-${step}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    };
    window.addEventListener("lead-force-active-step", onForceActiveStep);
    return () => window.removeEventListener("lead-force-active-step", onForceActiveStep);
  }, [focus, lead, tab]);
  // Focus mode: whenever a done step lands as the visible card, expand it
  // by default. Users flipping through step cards in focus mode almost
  // always want to see the details right away instead of clicking the
  // header to unfold. The setter for the matching step is called only when
  // it isn't already expanded so we don't fight user-toggled state.
  useEffect(() => {
    if (!focus || focusedStep == null) return;
    const setters: Array<[boolean, (v: boolean) => void]> = [
      [preSurveyExpanded, setPreSurveyExpanded],
      [surveyExpanded,    setSurveyExpanded],
      [quoteExpanded,     setQuoteExpanded],
      [orderExpanded,     setOrderExpanded],
      [installExpanded,   setInstallExpanded],
      [warrantyExpanded,  setWarrantyExpanded],
      [gridTieExpanded,   setGridTieExpanded],
    ];
    const [cur, setCur] = setters[focusedStep] ?? [];
    if (setCur && !cur) setCur(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, focusedStep]);

  const fetchLead = useCallback(() => {
    return apiFetch(`/api/leads/${id}`)
      .then(setLead)
      .catch((e: unknown) => {
        // 404 = deleted lead — fall through to "Not found" UI silently.
        const msg = e instanceof Error ? e.message : String(e);
        if (!/API error: 404/.test(msg)) console.error(e);
      })
      .finally(() => setLoadingLead(false));
  }, [id]);
  // Background refresh — every time a form autosave triggers refresh(), we
  // re-fetch activities silently so the right panel stays current without
  // flashing the "loading…" placeholder. The skeleton only shows on the
  // very first fetch (initial mount, before any data has loaded).
  const activitiesEverLoaded = useRef(false);
  const fetchActivities = useCallback(() => {
    if (!activitiesEverLoaded.current) setLoadingAct(true);
    return apiFetch(`/api/leads/${id}/activities`)
      .then((rs: Activity[]) => {
        setActivities(rs);
        activitiesEverLoaded.current = true;
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/API error: 404/.test(msg)) console.error(e);
      })
      .finally(() => setLoadingAct(false));
  }, [id]);

  useEffect(() => {
    fetchLead();
    fetchActivities();
    apiFetch("/api/packages").then(setPackages).catch(console.error);
    apiFetch(`/api/payments?lead_id=${id}`).then((rs: TimelinePayment[]) => setPaymentRows(rs || [])).catch(console.error);
  }, [fetchLead, fetchActivities, id]);

  const refresh = useCallback(() => {
    return Promise.all([fetchLead(), fetchActivities()]);
  }, [fetchLead, fetchActivities]);

  // Inline edit for the PreSurvey questionnaire tree — PATCHes a single
  // field on the lead row, then re-fetches so the tree reflects the new
  // value. Debounced ~300ms so tapping several chips in a row batches the
  // network work without stacking.
  const patchTimer = useRef<NodeJS.Timeout | null>(null);
  const patchQueue = useRef<Record<string, string | number | null>>({});
  const flushPatch = useCallback(async () => {
    const payload = patchQueue.current;
    patchQueue.current = {};
    if (Object.keys(payload).length === 0) return;
    try {
      await apiFetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      refresh();
    } catch (e) {
      console.error("questionnaire patch failed:", e);
    }
  }, [id, refresh]);
  const updateLeadField = useCallback((field: string, value: string | number | null) => {
    patchQueue.current[field] = value;
    if (patchTimer.current) clearTimeout(patchTimer.current);
    patchTimer.current = setTimeout(() => flushPatch(), 300);
  }, [flushPatch]);

  // Refresh lead data whenever fullscreen card closes so the underlying
  // inline card reflects edits made inside the portal.
  const prevFullscreenStep = useRef<number | null>(null);
  useEffect(() => {
    if (prevFullscreenStep.current !== null && fullscreenStep === null) {
      refresh();
    }
    prevFullscreenStep.current = fullscreenStep;
  }, [fullscreenStep, refresh]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active step when lead loads — works on both Workflow + Info tabs.
  // Mobile users especially need this so they don't have to scroll past 5 done steps
  // every time they open a lead.
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!lead || hasScrolled.current) return;
    if (tab !== "info" && tab !== "workflow") return;
    const t = setTimeout(() => {
      const el = document.querySelector("[data-step-active]") as HTMLElement | null;
      if (el) {
        hasScrolled.current = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [lead, tab]);

  if (loadingLead) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!lead) return <div className="text-center py-12 text-gray-500">Not found</div>;

  const isLost = lead.status === "lost" || lead.status === "returned";
  // Recognise both the short code ("upgrade") and the legacy long Thai
  // labels ("Upgrade", "ลูกค้าเดิมต้องการ Upgrade/Battery") so old data
  // imported before the standardisation still flags correctly.
  const isUpgrade = lead.customer_type === "upgrade" || lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  // pre_survey is only "done" if we've actually moved past it into a real
  // downstream step. Terminal states (lost/returned) don't imply completion —
  // the lead was exited before finishing.
  const hasPreSurveyDone = STEP_ORDER.indexOf(lead.status.split('-')[0]) > 0 || lead.status === "closed";
  const currentStep = stepIndex(lead.status);
  const visibleStep = focus ? (focusedStep ?? currentStep) : null;

  const cardState = (stepIdx: number): CardStateKind => {
    if (isLost) return "locked";
    if (forceActiveStep === stepIdx) return "active";
    if (stepIdx === 0) return hasPreSurveyDone ? "done" : "active";
    // Install (idx 4) + Warranty (idx 5) open simultaneously — but only
    // BEFORE install is signed off. Once install_completed_at is set,
    // Install collapses to its done view so the user clearly sees that
    // ยืนยันส่งมอบงาน worked; Warranty stays active for cert work.
    const installDone = !!lead.install_completed_at;
    if (stepIdx === 4 && installDone) return "done";
    if ((stepIdx === 4 || stepIdx === 5) && (currentStep === 4 || currentStep === 5)) return "active";
    // Grid-Tie (idx 6, ขอขนานไฟ) runs in parallel with install/warranty —
    // the utility request happens alongside the install job in the field,
    // not after warranty is signed off. Keep it workable from the install
    // phase onward instead of locked until status flips to 'gridtie'.
    // "ปิดงาน" (status → closed) is what marks it done.
    if (stepIdx === 6) {
      if (lead.status === "closed") return "done";
      if (currentStep >= 4) return "active";
    }
    if (stepIdx < currentStep) return "done";
    if (stepIdx === currentStep) return "active";
    return "locked";
  };

  const stepProps = (stepIdx: number) => ({
    stepIdx,
    state: cardState(stepIdx),
    lead: lead!,
    isMobile,
    fullscreen: fullscreenStep === stepIdx,
    setFullscreen: (v: boolean) => setFullscreenStep(v ? stepIdx : null),
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header — subtle primary tint */}
      <div className="bg-gradient-to-b from-primary via-primary/50 to-white safe-top sticky top-0 z-10">
        {/* Top row: back + name + call */}
        <div className="pl-3 pr-5 pt-3 flex items-center gap-2">
          {focus ? (
            <button type="button" onClick={() => setShowProfileModal(true)}
              title={`Grade ${lead.customer_grade || "-"}`}
              className={`w-11 h-11 rounded-full hover:opacity-80 transition-colors shrink-0 flex items-center justify-center ${
                lead.customer_grade === "A" ? "text-emerald-600" :
                lead.customer_grade === "B" ? "text-sky-600" :
                lead.customer_grade === "C" ? "text-amber-500" :
                lead.customer_grade === "D" ? "text-orange-500" :
                lead.customer_grade === "E" ? "text-gray-500" :
                lead.customer_grade === "F" ? "text-red-600" :
                "text-gray-600"
              }`}
              style={{ minHeight: 0 }}>
              <svg className="w-9 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          ) : (
            <button type="button" onClick={() => window.history.back()} className="p-2 rounded-full text-gray-600 hover:bg-gray-200 transition-colors shrink-0" style={{ minHeight: 0 }}>
              <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-1">
            <h1 className="text-2xl font-bold tracking-tight leading-tight text-gray-900 truncate">
              {(() => {
                const hn = houseNumberOrNull(lead.house_number);
                const nm = stripThaiTitle(lead.full_name);
                return hn ? `${hn} - ${nm}` : nm;
              })()}
            </h1>
            {!focus && (
              <button type="button" onClick={() => setShowProfileModal(true)} className="shrink-0 w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-primary transition-colors" style={{ minHeight: 0 }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}
          </div>
          {/* LINE link button — connected: open unmap modal; not connected: open picker */}
          <button
            type="button"
            onClick={() => {
              if (lead.line_id) setShowUnmapLine(true);
              else setShowLineModal(true);
            }}
            title={lead.line_id ? "คลิกเพื่อยกเลิกการเชื่อม LINE" : "เชื่อมกับ LINE ลูกค้า"}
            style={{ minHeight: 0 }}
            className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center active:scale-95 transition-all ${
              lead.line_id
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 hover:bg-emerald-600"
                : "bg-white text-gray-500 shadow border border-gray-200 hover:border-active/40 hover:text-active"
            }`}
          >
            <LineIcon className="w-5 h-5" />
          </button>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="shrink-0 w-11 h-11 rounded-full bg-primary text-white shadow-lg shadow-primary/40 flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all"
              aria-label="โทร"
            >
              <PhoneIcon className="w-5 h-5" width="20" height="20" />
            </a>
          )}
        </div>

        {/* Meta — order: project (under name), source/upgrade badges, phone */}
        <div className="px-5 pb-3 pt-1 space-y-1">
          {(lead.project_name || lead.installation_address || lead.contact_date) && (
            <div className="text-xs text-gray-600 leading-tight flex items-center gap-1.5 min-w-0">
              <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">
                {lead.installation_address && <span className="font-bold text-gray-900">{lead.installation_address}</span>}
                {lead.installation_address && lead.project_name && <span className="text-gray-300"> · </span>}
                {lead.project_name}
                {lead.contact_date && (() => {
                  const aging = Math.floor((Date.now() - new Date(lead.contact_date).getTime()) / 86400000);
                  const toneText = aging >= 14 ? "text-red-600" : aging >= 7 ? "text-amber-600" : "text-emerald-600";
                  return (
                    <>
                      <span className="text-gray-300 mx-1.5">·</span>
                      ติดต่อ {formatDate(lead.contact_date)}
                      {aging > 0 && <span className={`ml-1 font-semibold ${toneText}`}>({aging} วัน)</span>}
                    </>
                  );
                })()}
              </span>
            </div>
          )}
          <div className="text-xs text-gray-600 leading-tight flex items-center gap-1.5 flex-wrap">
            {lead.phone && (
              <>
                <PhoneIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="font-mono tabular-nums">{lead.phone}</span>
                <span className="text-gray-300">·</span>
              </>
            )}
            {lead.source && (
              <span className="inline-flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                {getSourceStyle(lead.source).label}
              </span>
            )}
            {isUpgrade && (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-purple-600">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                  Scale Up
                </span>
              </>
            )}
          </div>
        </div>

        {/* Tabs row + (desktop) left step-nav header + Activity Log header,
            all column-aligned with the panels below. */}
        <div className="flex">
        {/* Left step-nav header (desktop only) — always visible */}
        <div className="hidden md:flex w-20 border-r border-gray-200 px-2 items-center justify-center py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <span className="text-[10px]">Steps</span>
        </div>
        <div className="flex-1 flex px-5 gap-1 min-w-0">
          <button
            onClick={() => {
              setTab("workflow");
              // Scroll to the current step so the user lands on what they're
              // actively working on instead of the top of the (sometimes long)
              // step list. Deferred a frame so the workflow tab renders first.
              requestAnimationFrame(() => {
                document.getElementById(`step-${currentStep}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }}
            title={`Workflow (${lead.customer_grade || "-"})`}
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${tab === "workflow" ? "px-4 text-active border-active" : "px-3 md:px-4 text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 6h16.5" />
            </svg>
            <span className={tab === "workflow" ? "" : "hidden md:inline"}>
              Workflow (
              <span className={
                lead.customer_grade === "A" ? "text-emerald-600" :
                lead.customer_grade === "B" ? "text-sky-600" :
                lead.customer_grade === "C" ? "text-amber-500" :
                lead.customer_grade === "D" ? "text-orange-500" :
                lead.customer_grade === "E" ? "text-gray-500" :
                lead.customer_grade === "F" ? "text-red-600" :
                "text-gray-400"
              }>{lead.customer_grade || "-"}</span>
              )
            </span>
          </button>
          <button
            onClick={() => setTab("info")}
            title="Info"
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${tab === "info" ? "px-4 text-active border-active" : "px-3 md:px-4 text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <span className={tab === "info" ? "" : "hidden md:inline"}>Customer Info</span>
          </button>
          <button
            onClick={() => setTab("serials")}
            title="Equipment - Serial"
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${tab === "serials" ? "px-4 text-active border-active" : "px-3 md:px-4 text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 7.5l16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0012 6.75zM7.5 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span className={tab === "serials" ? "" : "hidden md:inline"}>
              <span className="md:hidden">Equipment</span>
              <span className="hidden md:inline">Equipment - Serial</span>
            </span>
          </button>
          <button
            onClick={() => setTab("photos")}
            title="Photos"
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${tab === "photos" ? "px-4 text-active border-active" : "px-3 md:px-4 text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <span className={tab === "photos" ? "" : "hidden md:inline"}>Photos</span>
          </button>
          <button
            onClick={() => setTab("timeline")}
            title="Timeline"
            className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${tab === "timeline" ? "px-4 text-active border-active" : "px-3 md:px-4 text-gray-500 border-transparent hover:text-gray-700"}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
            </svg>
            <span className={tab === "timeline" ? "" : "hidden md:inline"}>Timeline</span>
          </button>
          {/* Activity Log tab removed on mobile — desktop still shows the log
              in the right side panel. On desktop the tab itself never existed. */}
          {/* Desktop quick actions — sit in the sticky tab bar so they stay
              reachable while scrolling. Mobile keeps the bottom footer. */}
          {(tab === "info" || tab === "workflow") && !isLost && (
            <div className="ml-auto hidden md:flex items-center gap-2 pb-2 self-end">
              <button
                type="button"
                onClick={() => setModalType("follow_up")}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <ClockIcon className="w-4 h-4" strokeWidth={2} />
                Follow-up
              </button>
              <button
                type="button"
                onClick={() => setModalType("note")}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold border border-gray-200 hover:bg-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                Note
              </button>
            </div>
          )}
        </div>
        {/* Right column header (desktop only) — aligns with the right panel */}
        <div className="hidden md:flex w-80 border-l border-gray-200 px-4 items-center py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 gap-1.5">
          <ClockIcon className="w-4 h-4" strokeWidth={2} />
          Activity Log <span className="ml-1 text-gray-400 normal-case">{activities.length}</span>
        </div>
        </div>
      </div>

      {/* Content + desktop side panels (left step nav, right activity log) */}
      <div className="flex-1 flex min-h-0">
      {/* Left step navigator (desktop only) — click to scroll to a step */}
      {(() => {
        const STEPS_NAV = [
          { idx: 0, label: "Pre-Survey" },
          { idx: 1, label: "Survey" },
          { idx: 2, label: "Quote" },
          { idx: 3, label: "Order" },
          { idx: 4, label: "Install" },
          { idx: 5, label: "Warranty" },
          { idx: 6, label: "Grid-Tie" },
        ];
        const goto = (i: number) => {
          // Make sure the workflow tab is active before scrolling — clicking a
          // step from the Info/Timeline/Photos/Serials/Log tab would otherwise
          // scroll to a hidden element.
          if (tab !== "workflow") setTab("workflow");
          // In focus mode the step cards are hidden except for `focusedStep`;
          // clicking a step here reveals it instead of scrolling.
          if (focus) {
            setFocusedStep(i);
            return;
          }
          // Defer the scroll one frame so the workflow tab actually renders
          // before scrollIntoView tries to find the step element.
          requestAnimationFrame(() => {
            const el = document.getElementById(`step-${i}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        };
        return (
          <aside className="hidden md:flex w-20 border-r border-gray-200 bg-gray-50/40 flex-col py-3 px-1.5 gap-1.5">
            {STEPS_NAV.map(s => {
              const st = cardState(s.idx);
              // In focus mode the button's "selected" state follows the
              // focused step (which card is being shown), not the workflow
              // state — otherwise clicking a done step wouldn't highlight
              // even though its card is now the visible one.
              const isFocused = focus && visibleStep === s.idx;
              const isActive = !focus && st === "active";
              const isDone = st === "done";
              const isLocked = st === "locked";
              // Purple outline on the *actual* current workflow step — kept
              // visible even when the user is focused on a different card
              // so they can always see "where the lead really is".
              const isCurrent = st === "active";
              // Focus mode lets you inspect any step including locked
              // (upcoming) ones — the point of the mode is to isolate the
              // current one but not deny navigation.
              const clickDisabled = !focus && isLocked;
              const base = "flex flex-col items-center gap-0.5 py-2 rounded-lg transition-colors";
              // Current-workflow-step marker: purple text + purple thick
              // border. Applies only when the button is not already the
              // focused card (which uses bg-active/white text) — so a
              // single visual language: solid purple = you're looking at
              // it, hollow purple = this is what needs work.
              const isCurrentAccent = isCurrent && !isFocused && !isActive;
              return (
                <button
                  key={s.idx}
                  type="button"
                  onClick={() => goto(s.idx)}
                  disabled={clickDisabled}
                  className={`${base} ${
                    isFocused
                      ? "bg-active text-white"
                      : isActive
                      ? "bg-active text-white"
                      : isCurrentAccent
                      ? "bg-white text-active border-2 border-active hover:bg-active/5"
                      : isDone
                      ? "bg-white text-gray-700 border border-gray-200 hover:border-active hover:text-active"
                      : focus
                      ? "bg-white text-gray-500 border border-gray-200 hover:border-active hover:text-active"
                      : "text-gray-300 cursor-not-allowed"
                  }`}
                >
                  <span className="text-xxs font-bold tabular-nums leading-none">{String(s.idx + 1).padStart(2, "0")}</span>
                  <span className="text-[10px] font-semibold leading-tight text-center px-1">{s.label}</span>
                  {isDone && (
                    <CheckIcon className="w-3 h-3 text-emerald-500" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </aside>
        );
      })()}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-4 relative min-w-0" style={{ overscrollBehaviorY: "contain" }}>
        <div>
        {tab === "info" ? (
          <div className="p-4 space-y-3">
            {/* Top panel — classification chips for sales: กลุ่มลูกค้า + grade.
                Both are PATCH'd straight to the lead row; the API accepts
                `customer_group` and `customer_grade` keys (migration 051).
                Visual emphasis: gradient background, primary accent border,
                shadow, and a header strip — this is the highest-priority block
                in the Info tab so it should look distinct from the regular
                info sections below. */}
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* Header strip — star + Thai/English title + helper subtitle */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-500 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l2.6 7.6L22 10l-6 4.4 2.4 7.6L12 17.8 5.6 22 8 14.4 2 10l7.4-.4L12 2z" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-800 leading-tight">จัดเกรดลูกค้า</div>
                  <div className="text-[11px] text-gray-500 leading-tight">Customer Priority — กลุ่ม + ระดับความสนใจ</div>
                </div>
              </div>
              <div className="px-4 py-3 space-y-3">
              <div>
                {/* Header row: กลุ่มลูกค้า label left, Mark-as-Lost compact
                    button right (moved from the bottom of the tab so it's
                    visible without scrolling). Hidden when the lead is
                    already lost / past a terminal step, same rules as the
                    original placement. */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">กลุ่มลูกค้า</div>
                  {!isLost && lead.status !== "install" && lead.status !== "warranty" && lead.status !== "gridtie" && lead.status !== "closed" && (
                    <button
                      type="button"
                      onClick={() => setShowLostModal(true)}
                      className="text-xs font-semibold text-red-400 hover:text-red-600 hover:underline"
                    >
                      Mark as Lost
                    </button>
                  )}
                </div>
                {/* 7-col grid — every chip is 1/7 (col-span-1). Row leaves
                    the remaining cols empty on the right, matching how
                    PreSurveyForm handles short lists. */}
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {([
                    { v: "general", label: "ลูกค้าทั่วไป",                                     span: "col-span-1 md:col-span-1" },
                    { v: "sena",    label: "ลูกค้าเสนา",                                       span: "col-span-1 md:col-span-1" },
                    { v: "sme",     label: "SME (อาคารพาณิชย์/สำนักงาน/ร้านอาหาร)",             span: "col-span-2 md:col-span-2" },
                  ] as const).map(opt => {
                    const active = lead.customer_group === opt.v;
                    const span = opt.span;
                    return (
                      <button key={opt.v} type="button"
                        onClick={() => {
                          apiFetch(`/api/leads/${lead.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ customer_group: active ? null : opt.v }),
                          }).then(() => refresh()).catch(console.error);
                        }}
                        className={`${span} h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${
                          active ? "bg-active text-white border-active"
                                 : "bg-white text-gray-600 border-gray-200 hover:border-active/40"
                        }`}>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1.5">Grade</div>
                {/* Grades A-E follow the Solar Retail Lead Segmentation framework
                    (see tmp-files PDF). Short title under each letter + full
                    description in title= so a hover/long-press surfaces the
                    sales playbook. F is omitted — the framework only defines
                    A-E. */}
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {([
                    { g: "-", title: "ยังไม่จัดเกรด",       color: "text-gray-400",    desc: "ยังไม่จัดเกรด — ค่า default ก่อนเซลส์ประเมิน" },
                    { g: "A", title: "พร้อมซื้อทันที", color: "text-emerald-600", desc: "ลักษณะ: ขอราคา, ขอให้เข้า Survey, ส่งบิลค่าไฟ, ถามวันติดตั้ง, กระตือรือร้น\nเป้าหมาย: feedback ภายใน 5 นาที\nการปฏิบัติ: โทรหาลูกค้า, นัด Survey, ส่ง Company Profile, รีวิวผลงาน, ติดตาม Day1/Day3/Day7\nKPI: Response Time, Survey Rate, Close Rate" },
                    { g: "B", title: "อยู่ระหว่างเปรียบเทียบ", color: "text-sky-600",     desc: "ลักษณะ: ขอใบเสนอราคาหลายบริษัท, เปรียบเทียบอุปกรณ์และราคา, มีความรู้ระดับหนึ่ง, พูดถึง spec/ยี่ห้อ/การรับประกัน\nสิ่งที่ลูกค้าต้องการ: ความมั่นใจ มากกว่าราคาถูกที่สุด\nการปฏิบัติ: ส่ง Case Study, Warranty, QC Process Guarantee, Reference Site, รีวิวลูกค้าเก่า, ความเป็นเสนา developer 40 ปี ติดตั้ง Solar 15 ปี\nKPI: Quotation Acceptance, Win Rate" },
                    { g: "C", title: "พิจารณาความคุ้มค่า", color: "text-amber-500",   desc: "ลักษณะ: ถามคืนทุน, ขนาดระบบ, Battery จำเป็นหรือไม่\nสิ่งที่ลูกค้าต้องการ: ความเข้าใจ\nการปฏิบัติ: ส่ง ROI Calculator, Simulation, FAQ, วิดีโออธิบาย, เปรียบเทียบ 3/5/7 kW, เน้นว่าคุ้มค่า ลดค่าใช้จ่ายตั้งแต่เดือนแรก\nข้อควรระวัง: ไม่เร่งปิดการขาย ให้ข้อมูลเพียงพอแล้วให้เขาตัดสินใจ" },
                    { g: "D", title: "สนใจแต่ยังไม่พร้อม", color: "text-orange-500",  desc: "ลักษณะ: วางแผนสร้างบ้าน, รอเงิน, รอเปลี่ยนหลังคา, รอซื้อ EV\nการปฏิบัติ: Add LINE, ส่ง Monthly Newsletter, โปรโมชั่นประจำเดือน, ส่ง Case Study/Review, บันทึกช่วงที่จะซื้อแล้วติดตาม (nurturing)\nKPI: Re-Engagement Rate" },
                    { g: "E", title: "หาข้อมูลทั่วไป",       color: "text-gray-500",    desc: "ลักษณะ: อยากรู้เรื่อง Solar, Net Metering, Battery\nการปฏิบัติ: Blog, Video, LINE OA, Email Automation\nข้อควรระวัง: ไม่ควรโทรขายทันที แต่ติดตามเดือนละครั้ง" },
                    { g: "F", title: "ไม่สนใจ",                color: "text-red-600",     desc: "ลักษณะ: ไม่สนใจสินค้า / ไม่ตอบสนอง / ปฏิเสธ\nการปฏิบัติ: ปิดเคส ไม่ติดตามต่อ" },
                  ] as const).map(opt => {
                    // "-" represents the default/unassigned state. Active when
                    // the stored grade is null. Click sends customer_grade=null
                    // explicitly (clears any prior selection).
                    const isDefault = opt.g === "-";
                    const active = isDefault ? !lead.customer_grade : lead.customer_grade === opt.g;
                    return (
                      <button key={opt.g} type="button"
                        title={`เกรด ${opt.g}: ${opt.title}\n\n${opt.desc}`}
                        onClick={() => {
                          const next = isDefault ? null : (active ? null : opt.g);
                          apiFetch(`/api/leads/${lead.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ customer_grade: next }),
                          }).then(() => refresh()).catch(console.error);
                        }}
                        className={`col-span-1 md:col-span-1 flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg border transition-all min-h-[56px] ${
                          active ? "bg-active text-white border-active"
                                 : "bg-white border-gray-200 hover:border-active/40"
                        }`}>
                        <span className={`text-base font-bold leading-none ${active ? "" : opt.color}`}>{opt.g}</span>
                        <span className={`text-xs font-medium leading-tight text-center ${active ? "opacity-90" : "text-gray-500"}`}>{opt.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* ระยะเวลาในการตัดสินใจ — moved from §8 questionnaire to the
                  top panel because it drives the sales-priority conversation
                  more than the other §8 factors. Same chip pattern as the
                  grade grid above. "อื่นๆ" opens an inline free-text input. */}
              <div>
                <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1.5">ระยะเวลาในการตัดสินใจ</div>
                {/* 7-col grid — every chip is 1/7 (col-span-1). Row leaves
                    the remaining 3 cols empty on the right. */}
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {([
                    { v: "1-3m",  label: "ภายใน 1-3 เดือน", span: "col-span-1 md:col-span-1" },
                    { v: "6m",    label: "ภายใน 6 เดือน",   span: "col-span-1 md:col-span-1" },
                    { v: "1y+",   label: "มากกว่า 1 ปี",     span: "col-span-1 md:col-span-1" },
                    { v: "other", label: "อื่นๆ",             span: "col-span-1 md:col-span-1" },
                  ] as const).map(opt => {
                    const cur = lead.decision_timeline || "";
                    const active = opt.v === "other" ? cur.startsWith("other") : cur === opt.v;
                    return (
                      <button key={opt.v} type="button"
                        onClick={() => {
                          const next = opt.v === "other"
                            ? (active ? null : "other")
                            : (active ? null : opt.v);
                          apiFetch(`/api/leads/${lead.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ decision_timeline: next }),
                          }).then(() => refresh()).catch(console.error);
                        }}
                        className={`${opt.span} h-8 px-3 rounded-lg text-xs font-semibold border transition-all ${
                          active ? "bg-active text-white border-active"
                                 : "bg-white text-gray-600 border-gray-200 hover:border-active/40"
                        }`}>
                        {opt.label}
                      </button>
                    );
                  })}
                  {lead.decision_timeline?.startsWith("other") && (
                    <input type="text" placeholder="ระบุ..."
                      defaultValue={lead.decision_timeline.startsWith("other:") ? lead.decision_timeline.slice(6) : ""}
                      onBlur={e => {
                        const t = e.target.value.trim();
                        apiFetch(`/api/leads/${lead.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ decision_timeline: t ? `other:${t}` : "other" }),
                        }).then(() => refresh()).catch(console.error);
                      }}
                      className="col-span-2 md:col-span-3 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
                  )}
                </div>
              </div>
              </div>
            </div>
            {(() => {
              const pkgIds = lead.interested_package_ids
                ? lead.interested_package_ids.split(",").map(s => parseInt(s)).filter(n => !isNaN(n))
                : lead.interested_package_id ? [lead.interested_package_id] : [];
              const pkgNames = pkgIds.map(id => packages.find(p => p.id === id)?.name).filter(Boolean) as string[];

              const lineStatus = lead.line_id
                ? `${lead.line_display_name || "(ไม่มีชื่อ)"} · เชื่อมแล้ว`
                : null;
              // Row shape — every entry has label + display value. The
              // questionnaire (q1..q8) sections additionally carry
              // field/kind/raw/options metadata so the tree can render an
              // editable cell; other sections leave those undefined.
              type SectionRow = {
                label: string;
                value: React.ReactNode | null;
                field?: string;
                kind?: QCellKind;
                raw?: string | number | null;
                options?: { value: string; label: string }[];
                suffix?: string;
                required?: boolean;
                allowOther?: boolean;
                chipIcon?: React.ReactNode;
              };
              // Clock icon reused by the peak-usage row (rendered on the left
              // of each time-range chip).
              const clockIcon = (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              );
              // Roof/house icon for the ทรงหลังคา chips.
              const roofIcon = (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10h14V10" />
                </svg>
              );
              const sections: { id: string; title: string; rows: SectionRow[] }[] = [
                {
                  id: "contact",
                  title: "ติดต่อ",
                  rows: [
                    { label: "LINE", value: lineStatus },
                  ],
                },
                {
                  id: "address",
                  title: "ที่อยู่ติดตั้ง",
                  rows: [
                    { label: "บ้านเลขที่", value: lead.house_number },
                    { label: "โครงการ", value: lead.project_name },
                    { label: "ที่อยู่", value: lead.installation_address },
                  ],
                },
                {
                  id: "interest",
                  title: "ความสนใจของลูกค้า",
                  rows: [
                    { label: "ความสนใจ", value: lead.customer_interest },
                    // ความต้องการ — multi-line free text synced from seeker.
                    // The "เหตุผลที่สนใจ:" line carries raw codes (save_bill, has_ev, …)
                    // which mean nothing to readers; map each known code to its
                    // Thai label so it matches what the seeker page shows on
                    // the picker chips.
                    {
                      label: "ความต้องการ",
                      value: lead.requirement
                        ? lead.requirement.replace(
                            /\b(save_bill|sell_back|tax_deduction|daytime_usage|pet_ac|elderly_care|has_ev|environment|home_business|other)\b/g,
                            (code) => PRIMARY_REASON_LABEL[code] || code,
                          )
                        : lead.requirement,
                    },
                    { label: "เหตุผลที่สนใจ", value: otherOrLabel(lead.pre_primary_reason, INFO_LABELS.primaryReason) },
                    { label: "แพ็คเกจที่สนใจ", value: pkgNames.length ? pkgNames.join(" · ") : null },
                  ],
                },
                {
                  id: "usage",
                  title: "ลักษณะการใช้ไฟ",
                  rows: [
                    { label: "ค่าไฟ / เดือน", value: lead.pre_monthly_bill ? `${formatNumber(lead.pre_monthly_bill)} บาท` : null },
                    { label: "ช่วงเวลาใช้ไฟ", value: lead.pre_peak_usage ? INFO_LABELS.peakUsage[lead.pre_peak_usage] : null },
                    { label: "ระบบไฟฟ้า", value: lead.pre_electrical_phase ? INFO_LABELS.electricalPhase[lead.pre_electrical_phase] : null },
                    { label: "แอร์", value: formatAcUnits(lead.pre_ac_units) },
                    { label: "เครื่องใช้พิเศษ", value: formatList(lead.pre_appliances, INFO_LABELS.appliances) },
                  ],
                },
                {
                  id: "system",
                  title: "ระบบที่ต้องการ",
                  rows: [
                    { label: "ต้องการแบตเตอรี่", value: lead.pre_wants_battery ? INFO_LABELS.battery[lead.pre_wants_battery] : null },
                    { label: "ทรงหลังคา", value: lead.pre_roof_shape ? INFO_LABELS.roofShape[lead.pre_roof_shape] : null },
                    { label: "ประเภทที่อยู่", value: otherOrLabel(lead.pre_residence_type, INFO_LABELS.residence) },
                  ],
                },
                {
                  id: "finance",
                  title: "การเงิน",
                  rows: [
                    { label: "วิธีชำระ", value: lead.payment_type ? INFO_LABELS.payment[lead.payment_type] || lead.payment_type : null },
                    { label: "สถานะบ้าน", value: lead.home_loan_status },
                  ],
                },
                {
                  id: "source",
                  title: "ที่มา / Lead Seeker",
                  rows: [
                    { label: "แหล่งที่มา", value: lead.source ? INFO_LABELS.source[lead.source] || lead.source : null },
                    { label: "ประเภทลูกค้า", value: lead.customer_type },
                    { label: "Lead Seeker Type", value: lead.seeker_type },
                    { label: "ชื่อ Lead Seeker", value: lead.seeker_name },
                    { label: "หมายเหตุโครงการ", value: lead.project_note },
                  ],
                },
                {
                  id: "note",
                  title: "หมายเหตุ",
                  rows: [
                    { label: "โน้ต", value: lead.note },
                  ],
                },
                // Questionnaire (PreSurvey §1-§8). Row shape carries edit
                // metadata (field / kind / options / suffix) so the tree can
                // render an inline editor per cell — see EditableQCell above.
                // `value` is the FORMATTED display value (kept for the flat
                // sections rendering the same list below). Editable cells go
                // through `raw` + `kind` + `field` instead.
                {
                  id: "q1",
                  title: "แบบสอบถาม · บ้าน + ผู้อยู่อาศัย",
                  rows: [
                    { label: "ประเภทบ้าน", value: otherOrLabel(lead.pre_residence_type, INFO_LABELS.residence), field: "pre_residence_type", kind: "dropdown" as QCellKind, options: [...optsFromInfo(INFO_LABELS.residence), { value: "other", label: "อื่นๆ" }], raw: lead.pre_residence_type ?? "", required: true, allowOther: true },
                    { label: "ทรงหลังคา", value: lead.pre_roof_shape ? INFO_LABELS.roofShape[lead.pre_roof_shape] : null, field: "pre_roof_shape", kind: "dropdown" as QCellKind, options: [...optsFromInfo(INFO_LABELS.roofShape), { value: "other", label: "อื่นๆ" }], raw: lead.pre_roof_shape ?? "", allowOther: true, chipIcon: roofIcon },
                    { label: "อายุบ้าน", value: qLabel(lead.house_age, "houseAge"), field: "house_age", kind: "dropdown" as QCellKind, options: optsFromQ("houseAge"), raw: lead.house_age ?? "" },
                    { label: "ผู้อยู่อาศัยรวม", value: lead.occupant_total != null ? `${lead.occupant_total} คน` : null, field: "occupant_total", kind: "stepper" as QCellKind, suffix: "คน", raw: lead.occupant_total ?? "" },
                    { label: "ผู้สูงอายุ", value: lead.occupant_elderly != null ? `${lead.occupant_elderly} คน` : null, field: "occupant_elderly", kind: "stepper" as QCellKind, suffix: "คน", raw: lead.occupant_elderly ?? "" },
                    { label: "เด็ก", value: lead.occupant_kids != null ? `${lead.occupant_kids} คน` : null, field: "occupant_kids", kind: "stepper" as QCellKind, suffix: "คน", raw: lead.occupant_kids ?? "" },
                    { label: "สัตว์เลี้ยง", value: lead.occupant_pets != null ? `${lead.occupant_pets} ตัว` : null, field: "occupant_pets", kind: "stepper" as QCellKind, suffix: "ตัว", raw: lead.occupant_pets ?? "" },
                  ],
                },
                {
                  id: "q2",
                  title: "แบบสอบถาม · ค่าไฟ + มิเตอร์",
                  rows: [
                    // Bill + 5 range indicator chips (auto-tick on typed value).
                    { label: "ค่าไฟต่อเดือน", value: lead.pre_monthly_bill ? `${formatNumber(lead.pre_monthly_bill)} บาท` : null, field: "pre_monthly_bill", kind: "bill_range" as QCellKind, suffix: "บาท", raw: lead.pre_monthly_bill ?? "", required: true },
                    { label: "ค่าไฟสูงสุดที่เคยจ่าย", value: lead.monthly_bill_max ? `${formatNumber(Number(lead.monthly_bill_max))} บาท` : null, field: "monthly_bill_max", kind: "number" as QCellKind, suffix: "บาท", raw: lead.monthly_bill_max ?? "" },
                    // peak_usage — only the 4 time-range codes the form
                    // currently offers. Legacy day/night/both codes are
                    // dropped from the picker (they still render on the
                    // old flat sections below via INFO_LABELS).
                    { label: "ช่วงเวลาที่ใช้ไฟสูงสุด", value: lead.pre_peak_usage ? INFO_LABELS.peakUsage[lead.pre_peak_usage] : null, field: "pre_peak_usage", kind: "dropdown" as QCellKind, options: [
                      { value: "morning",   label: "06.00-12.00" },
                      { value: "afternoon", label: "12.00-18.00" },
                      { value: "evening",   label: "18.00-24.00" },
                      { value: "all_day",   label: "ตลอดวัน" },
                    ], raw: lead.pre_peak_usage ?? "", required: true, chipIcon: clockIcon },
                    { label: "ระบบไฟปัจจุบัน", value: lead.pre_electrical_phase ? INFO_LABELS.electricalPhase[lead.pre_electrical_phase] : null, field: "pre_electrical_phase", kind: "dropdown" as QCellKind, options: optsFromInfo(INFO_LABELS.electricalPhase), raw: lead.pre_electrical_phase ?? "", required: true },
                    { label: "ขนาดมิเตอร์", value: qLabel(lead.meter_size, "meterSize"), field: "meter_size", kind: "dropdown" as QCellKind, options: [...optsFromQ("meterSize"), { value: "other", label: "อื่นๆ" }], raw: lead.meter_size ?? "", allowOther: true },
                  ],
                },
                {
                  id: "q3",
                  title: "แบบสอบถาม · ไลฟ์สไตล์",
                  rows: [
                    { label: "อยู่บ้านช่วงกลางวัน", value: qLabel(lead.home_at_daytime, "yesNoLifestyle"), field: "home_at_daytime", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoLifestyle"), raw: lead.home_at_daytime ?? "" },
                    { label: "ผู้อยู่กลางวัน", value: qCsvLabel(lead.daytime_occupants, "daytimeOccupants"), field: "daytime_occupants", kind: "multi_csv" as QCellKind, options: optsFromQ("daytimeOccupants"), raw: lead.daytime_occupants ?? "" },
                    { label: "ทำงานที่บ้าน", value: qLabel(lead.work_at_home, "yesNoLifestyle"), field: "work_at_home", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoLifestyle"), raw: lead.work_at_home ?? "" },
                    { label: "ประเภทธุรกิจ", value: qLabel(lead.business_type, "businessType"), field: "business_type", kind: "dropdown" as QCellKind, options: optsFromQ("businessType"), raw: lead.business_type ?? "" },
                    { label: "วันทำงาน/สัปดาห์", value: qLabel(lead.work_days_per_week, "workDaysPerWeek"), field: "work_days_per_week", kind: "dropdown" as QCellKind, options: optsFromQ("workDaysPerWeek"), raw: lead.work_days_per_week ?? "" },
                    { label: "จำนวนแอร์ (แยกช่วงเวลา)", value: null, field: "ac_split", kind: "ac_split" as QCellKind, raw: lead.ac_split ?? "" },
                    { label: "ช่วงชาร์จ EV", value: qLabel(lead.ev_charge_period, "evChargePeriod"), field: "ev_charge_period", kind: "dropdown" as QCellKind, options: optsFromQ("evChargePeriod"), raw: lead.ev_charge_period ?? "" },
                  ],
                },
                {
                  id: "q4",
                  title: "แบบสอบถาม · แผนอนาคต",
                  rows: [
                    { label: "ซื้อ EV อนาคต", value: qLabel(lead.future_ev, "yesNoConsidering"), field: "future_ev", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoConsidering"), raw: lead.future_ev ?? "" },
                    { label: "ติด EV Charger", value: qLabel(lead.future_ev_charger, "yesNoConsidering"), field: "future_ev_charger", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoConsidering"), raw: lead.future_ev_charger ?? "" },
                    { label: "ต่อเติมบ้าน", value: qLabel(lead.future_extend_home, "yesNoBin"), field: "future_extend_home", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoBin"), raw: lead.future_extend_home ?? "" },
                    { label: "สมาชิกเพิ่ม", value: qLabel(lead.future_more_members, "yesNoBin"), field: "future_more_members", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoBin"), raw: lead.future_more_members ?? "" },
                    { label: "Smart Home", value: qLabel(lead.future_smart_home, "yesNoBin"), field: "future_smart_home", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoBin"), raw: lead.future_smart_home ?? "" },
                    { label: "แบตในอนาคต", value: qLabel(lead.future_battery, "yesNoMaybe"), field: "future_battery", kind: "dropdown" as QCellKind, options: optsFromQ("yesNoMaybe"), raw: lead.future_battery ?? "" },
                  ],
                },
                {
                  id: "q5",
                  title: "แบบสอบถาม · พลังงานสำรอง",
                  rows: [
                    { label: "ลำดับความสำคัญตอนไฟดับ", value: qCsvLabel(lead.outage_priorities, "outagePriorities"), field: "outage_priorities", kind: "multi_csv" as QCellKind, options: optsFromQ("outagePriorities"), raw: lead.outage_priorities ?? "" },
                    { label: "เมื่อค่าไฟขึ้น", value: qLabel(lead.bill_rise_action, "billRiseAction"), field: "bill_rise_action", kind: "dropdown" as QCellKind, options: optsFromQ("billRiseAction"), raw: lead.bill_rise_action ?? "" },
                  ],
                },
                {
                  id: "q6",
                  title: "แบบสอบถาม · สุขภาพบ้าน",
                  rows: [
                    { label: "หลังคารั่ว", value: qLabel(lead.had_roof_leak, "everNever"), field: "had_roof_leak", kind: "dropdown" as QCellKind, options: optsFromQ("everNever"), raw: lead.had_roof_leak ?? "" },
                    { label: "ซ่อมหลังคา", value: qLabel(lead.did_roof_repair, "everNever"), field: "did_roof_repair", kind: "dropdown" as QCellKind, options: optsFromQ("everNever"), raw: lead.did_roof_repair ?? "" },
                    { label: "ปัญหาไฟฟ้า", value: qLabel(lead.had_electrical_issue, "everNever"), field: "had_electrical_issue", kind: "dropdown" as QCellKind, options: optsFromQ("everNever"), raw: lead.had_electrical_issue ?? "" },
                    { label: "เปลี่ยน Panel", value: qLabel(lead.did_panel_replacement, "everNever"), field: "did_panel_replacement", kind: "dropdown" as QCellKind, options: optsFromQ("everNever"), raw: lead.did_panel_replacement ?? "" },
                  ],
                },
                {
                  id: "q7",
                  title: "แบบสอบถาม · พลังงานในอนาคต",
                  rows: [
                    { label: "ผลิตไฟใช้เอง", value: qLabel(lead.self_generates, "ableOrNot"), field: "self_generates", kind: "dropdown" as QCellKind, options: optsFromQ("ableOrNot"), raw: lead.self_generates ?? "" },
                    { label: "พร้อมรองรับ EV", value: qLabel(lead.ev_ready, "evReady"), field: "ev_ready", kind: "dropdown" as QCellKind, options: optsFromQ("evReady"), raw: lead.ev_ready ?? "" },
                    { label: "Blackout Resilience", value: qLabel(lead.blackout_resilient, "ableOrNot"), field: "blackout_resilient", kind: "dropdown" as QCellKind, options: optsFromQ("ableOrNot"), raw: lead.blackout_resilient ?? "" },
                    { label: "แนวโน้มใช้ไฟ", value: qLabel(lead.future_usage_trend, "usageTrend"), field: "future_usage_trend", kind: "dropdown" as QCellKind, options: optsFromQ("usageTrend"), raw: lead.future_usage_trend ?? "" },
                  ],
                },
                {
                  id: "q8",
                  title: "แบบสอบถาม · ปัจจัยตัดสินใจ",
                  rows: [
                    // ระยะเวลาตัดสินใจ moved to the top grade panel; only
                    // "คะแนนปัจจัย" remains in §8 so it doesn't appear twice.
                    { label: "คะแนนปัจจัย", value: formatDecisionFactors(lead.decision_factors), field: "decision_factors", kind: "factors" as QCellKind, raw: lead.decision_factors ?? "" },
                  ],
                },
              ];
              // The questionnaire sections feed only the q_tree below — strip
              // them from the flat list so they don't show twice.
              const flatSections = sections.filter(s => !s.id.startsWith("q"));

              const created = activities.find(a => a.activity_type === "lead_created");
              const createdAt = created?.created_at ?? lead.created_at;
              const createdBy = created?.created_by_name ?? null;
              const createdAtFmt = createdAt
                ? formatDate(String(createdAt), { time: true })
                : null;
              // New 2-level tree wrapping the questionnaire — parent "แบบสอบถาม"
              // with q1-q8 nested as children. User wants this added on top
              // first; the flat q1-q8 sections below remain in place until the
              // two views can be merged.
              const qSections = sections.filter(s => s.id.startsWith("q"));
              const qFilled = qSections.reduce((sum, s) => sum + s.rows.filter(r => isFilled(r.value)).length, 0);
              const qTotal  = qSections.reduce((sum, s) => sum + s.rows.length, 0);

              return (
                <div className="space-y-1">
                  {/* PreSurvey questionnaire tree — shows every question even
                      when unanswered (per user spec: "default แสดงทุกข้อ แค่
                      ไม่มีคำตอบ"). InfoLine renders the empty placeholder so
                      reviewers can see at a glance what's still missing. */}
                  <InfoSection
                    id="q_tree"
                    title="แบบสอบถาม"
                    filled={qFilled}
                    total={qTotal}
                    open={!!openSections.q_tree}
                    onToggle={toggleSection}
                  >
                    {/* Edit button — opens the same PreSurveyForm used in the
                        workflow tab in a modal so the user can update answers
                        without switching tabs. */}
                    <div className="flex justify-end mb-1">
                      <button
                        type="button"
                        onClick={() => setEditQuestionnaireOpen(true)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-active hover:underline"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                        </svg>
                        แก้ไขแบบสอบถาม
                      </button>
                    </div>
                    {/* Section cards mirror PreSurveyForm: rounded card,
                        header strip with icon + title + filled count, then
                        a vertical stack of questions (label + chip grid).
                        No more nested InfoSection chevron — user wants the
                        info tab to look like the real questionnaire. */}
                    <div className="space-y-3">
                      {qSections.map(s => {
                        const filledRows = s.rows.filter(r => isFilled(r.value)).length;
                        const shortTitle = s.title.replace(/^แบบสอบถาม\s*·\s*/, "");
                        return (
                          <div key={s.id} className="rounded-lg bg-white/60 border border-active/15 p-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                              {qSectionIcon(s.id)}
                              <span className="flex-1 min-w-0 truncate">{shortTitle}</span>
                              <span className={`text-xxs font-mono tabular-nums shrink-0 ${filledRows === 0 ? "text-gray-300" : filledRows === s.rows.length ? "text-emerald-600" : "text-gray-400"}`}>
                                {filledRows}/{s.rows.length}
                              </span>
                            </div>
                            {/* Group consecutive `stepper` rows into one 4-col
                                grid so counters (occupants, elderly, kids,
                                pets) sit side-by-side instead of stacking —
                                mirrors PreSurveyForm's occupancy row. */}
                            <div className="space-y-3">
                              {(() => {
                                const out: React.ReactNode[] = [];
                                let group: typeof s.rows = [];
                                const flushGroup = (key: string) => {
                                  if (group.length === 0) return;
                                  out.push(
                                    <div key={key} className="grid grid-cols-2 md:grid-cols-7 gap-2">
                                      {group.map((r, i) => (
                                        <div key={i} className="col-span-1 md:col-span-1">
                                          <EditableQCell
                                            label={r.label}
                                            kind="stepper"
                                            value={r.raw}
                                            suffix={r.suffix}
                                            readonlyDisplay={r.value}
                                            onCommit={(next) => r.field && updateLeadField(r.field, next)}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  );
                                  group = [];
                                };
                                s.rows.forEach((r, i) => {
                                  if (r.kind === "stepper") {
                                    group.push(r);
                                  } else {
                                    flushGroup(`grp-${i}`);
                                    out.push(
                                      <EditableQCell
                                        key={i}
                                        label={r.label}
                                        kind={r.kind ?? "readonly"}
                                        value={r.raw}
                                        options={r.options}
                                        suffix={r.suffix}
                                        required={r.required}
                                        allowOther={r.allowOther}
                                        chipIcon={r.chipIcon}
                                        readonlyDisplay={r.value}
                                        onCommit={(next) => r.field && updateLeadField(r.field, next)}
                                      />
                                    );
                                  }
                                });
                                flushGroup("grp-end");
                                return out;
                              })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </InfoSection>

                  {(() => {
                    // Split the flat sections: contact + note stay at the
                    // top level; everything else lives inside a "Seeker Data"
                    // group so the reviewer can collapse the whole block.
                    const SEEKER_IDS = new Set(["address", "interest", "usage", "system", "finance", "source"]);
                    const seekerSections = flatSections.filter(s => SEEKER_IDS.has(s.id));
                    const otherSections  = flatSections.filter(s => !SEEKER_IDS.has(s.id));
                    const seekerFilled = seekerSections.reduce((sum, s) => sum + s.rows.filter(r => isFilled(r.value)).length, 0);
                    const seekerTotal  = seekerSections.reduce((sum, s) => sum + s.rows.length, 0);
                    const renderRows = (rows: SectionRow[]) => (
                      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 py-1">
                        {rows.map((r, i) => {
                          const long = ["โน้ต", "หมายเหตุโครงการ", "ที่อยู่ติดตั้ง", "เหตุผลที่สนใจ", "แพ็คเกจที่สนใจ", "ความต้องการ", "เครื่องใช้พิเศษ", "แอร์"].includes(r.label);
                          const span = long ? "col-span-2 md:col-span-3" : "col-span-1 md:col-span-2";
                          return (
                            <div key={i} className={`${span} min-w-0 rounded-lg bg-gray-50/70 border border-gray-100 px-3 py-2`}>
                              <div className="text-[10px] text-gray-400 leading-tight truncate">{r.label}</div>
                              <div className="text-sm leading-snug mt-0.5 font-semibold text-gray-800 break-words">
                                {r.value}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                    return (
                      <>
                        {/* Top-level sections (contact / note) */}
                        {otherSections.map(s => {
                          const rows = s.rows.filter(r => isFilled(r.value));
                          if (rows.length === 0) return null;
                          return (
                            <InfoSection
                              key={s.id}
                              id={s.id}
                              title={s.title}
                              filled={rows.length}
                              total={rows.length}
                              open={!!openSections[s.id]}
                              onToggle={toggleSection}
                            >
                              {renderRows(rows)}
                            </InfoSection>
                          );
                        })}
                        {/* Seeker Data group — nested InfoSection wrapping
                            address / interest / usage / system / finance /
                            source so they collapse as one unit. */}
                        <InfoSection
                          id="seeker_data"
                          title="Seeker Data"
                          filled={seekerFilled}
                          total={seekerTotal}
                          open={!!openSections.seeker_data}
                          onToggle={toggleSection}
                        >
                          {seekerSections.map(s => {
                            const rows = s.rows.filter(r => isFilled(r.value));
                            if (rows.length === 0) return null;
                            const childId = `seeker_data.${s.id}`;
                            return (
                              <InfoSection
                                key={childId}
                                id={childId}
                                title={s.title}
                                filled={rows.length}
                                total={rows.length}
                                open={!!openSections[childId]}
                                onToggle={toggleSection}
                              >
                                {renderRows(rows)}
                              </InfoSection>
                            );
                          })}
                        </InfoSection>
                      </>
                    );
                  })()}
                  {createdAtFmt && (
                    <div className="pt-3 mt-2 border-t border-gray-100 text-xs text-gray-400">
                      บันทึก{createdBy ? `โดย ${createdBy}` : ""} · {createdAtFmt}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : tab === "workflow" ? (
          <div className="p-4 space-y-3">
            {/* Latest Contact — ข้อมูลการติดต่อล่าสุด */}
            {(() => {
              // DB-first: every contact event lives in lead_activities (including register/walk-in)
              const latest = activities[0];
              const typeMap: Record<string, { label: string; color: string }> = {
                note: { label: "โน้ต", color: "bg-emerald-500" },
                call: { label: "โทร", color: "bg-emerald-500" },
                visit: { label: "เยี่ยม", color: "bg-emerald-500" },
                follow_up: { label: "ติดตาม", color: "bg-emerald-500" },
                lead_created: { label: "ลงทะเบียน", color: "bg-emerald-500" },
                status_change: { label: "สถานะ", color: "bg-emerald-500" },
                presurvey_doc_created: { label: "เปิดเลขเอกสาร", color: "bg-emerald-500" },
                sms_sent: { label: "ส่ง SMS", color: "bg-emerald-500" },
              };

              const headerParts = latest
                ? (() => {
                    const label = typeMap[latest.activity_type]?.label || "บันทึก";
                    const eventDate = latest.followup_date || latest.created_at;
                    const eventStr = formatDate(eventDate);
                    // Save time is always real (DB default GETDATE()) for new
                    // rows; legacy backdated rows show 12:00 — kept honest.
                    const saveStr = `${formatDate(latest.created_at)} ${formatThaiTime(latest.created_at)}`;
                    return { main: `${label} · ${eventStr}`, save: saveStr };
                  })()
                : null;
              // Structured follow-up outcome (e.g. "ติดต่อได้ - ลูกค้าไม่สะดวกคุย")
              // lives in `title`. Older auto-generated titles like "Called customer"
              // are filtered out so legacy data doesn't leak.
              const titleStr = latest?.title ?? "";
              const isOkTitle = titleStr.startsWith("ติดต่อได้");
              const isFailTitle = titleStr.startsWith("ติดต่อไม่ได้");
              const isOtherTitle = titleStr === "อื่นๆ";
              const structuredTitle = (isOkTitle || isFailTitle || isOtherTitle) ? titleStr : null;
              const bodyText = latest ? (latest.note || (!structuredTitle ? latest.title : null)) : null;
              const createdBy = latest?.created_by_name ?? null;
              const accentColor = latest
                ? (typeMap[latest.activity_type]?.color || "bg-gray-500") + " text-white"
                : "bg-gray-50 text-gray-400 ring-1 ring-inset ring-gray-200";
              const isEmpty = !bodyText && !structuredTitle;

              return (
                <div
                  onClick={() => setModalType("note")}
                  className="md:hidden relative w-full text-left rounded-2xl bg-white border border-gray-300 hover:border-gray-400 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-8 rounded-xl flex items-center justify-center shrink-0 ${accentColor}`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.28 3.238.37 1.083.088 1.953.823 2.306 1.794l1.499 4.125 1.5-4.125c.353-.97 1.222-1.706 2.305-1.793a48.68 48.68 0 003.238-.371c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 leading-none">Latest Contact</div>
                        {!isEmpty && headerParts && (
                          <>
                            <div className="text-sm font-semibold text-gray-900 mt-1">
                              {headerParts.main}
                              <span className="hidden md:inline text-xs font-normal text-gray-400"> · บันทึกวันที่ {headerParts.save}</span>
                            </div>
                            <div className="md:hidden text-xs font-normal text-gray-400 mt-0.5">บันทึกวันที่ {headerParts.save}</div>
                          </>
                        )}
                        {isEmpty && <div className="text-sm text-gray-400 mt-1">ยังไม่มีการติดต่อ · แตะเพื่อเพิ่ม</div>}
                      </div>
                      <span className="text-primary text-sm font-semibold shrink-0">+ เพิ่ม</span>
                    </div>
                    {!isEmpty && (
                      <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap mt-3 pt-3 border-t border-gray-100">
                        {structuredTitle && (
                          <div className="mb-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                              isOkTitle
                                ? "bg-green-50 text-green-700 border-green-200"
                                : isFailTitle
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-gray-50 text-gray-600 border-gray-200"
                            }`}>{structuredTitle}</span>
                          </div>
                        )}
                        {bodyText}
                        {(() => {
                          // Pick the latest follow_up_date scheduled across activities,
                          // then check if anything was logged on/after that date.
                          const scheduled = activities.find(a => !!a.follow_up_date);
                          if (!scheduled || !scheduled.follow_up_date) return null;
                          const schedDate = new Date(String(scheduled.follow_up_date).slice(0, 10) + "T00:00:00");
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          // Was any follow_up activity logged on/after the scheduled date?
                          const fulfilled = activities.some(a => {
                            if (a.id === scheduled.id) return false;
                            const evt = new Date(String((a.followup_date || a.created_at)).slice(0, 10) + "T00:00:00");
                            return evt >= schedDate;
                          });
                          const isOverdue = !fulfilled && schedDate < today;
                          const isToday = !fulfilled && schedDate.getTime() === today.getTime();
                          const tone = fulfilled
                            ? "text-emerald-700"
                            : isOverdue ? "text-red-600" : isToday ? "text-amber-700" : "text-gray-600";
                          return (
                            <div className={`text-xs font-semibold mt-2 ${tone}`}>
                              นัดติดตามครั้งถัดไป {formatDate(scheduled.follow_up_date)}
                              {fulfilled
                                ? <span className="ml-1">✓ ติดตามแล้ว</span>
                                : isOverdue
                                  ? <span className="ml-1">(Overdue)</span>
                                  : isToday
                                    ? <span className="ml-1">· วันนี้</span>
                                    : null}
                            </div>
                          );
                        })()}
                        {createdBy && (
                          <div className="text-xs text-gray-400 mt-2">โดย {createdBy}</div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Footer — assignee in bottom-left + count in bottom-right, mirroring LeadCard */}
                  <div onClick={(e) => e.stopPropagation()} className="px-5 py-3 bg-gray-50 rounded-b-2xl flex items-center gap-2 text-xs text-gray-400">
                    <AssignOwnerButton
                      leadId={lead.id}
                      assignedUserId={lead.assigned_user_id}
                      assignedName={lead.assigned_name}
                      onChanged={refresh}
                    />
                    {(lead.assigned_username || lead.assigned_name) && (
                      <span className="font-semibold text-gray-700 uppercase tracking-wider">
                        {lead.assigned_name || lead.assigned_username}
                      </span>
                    )}
                    {(() => {
                      const CONTACT_TYPES = new Set(["call", "visit", "follow_up", "loan_followup"]);
                      const n = activities.filter(a => CONTACT_TYPES.has(a.activity_type)).length;
                      return n > 0 ? (
                        <span className="ml-auto text-xs font-semibold text-gray-600">ติดตาม {n} ครั้ง</span>
                      ) : null;
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* Step 01: Pre-Survey */}
            {(!focus || visibleStep === 0) && (
              <StepCard
                {...stepProps(0)}
                title="Pre-Survey"
                icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                onHeaderClick={cardState(0) === "done" ? () => setPreSurveyExpanded(!preSurveyExpanded) : undefined}
              >
                <PreSurveyStep lead={lead} state={cardState(0)} refresh={refresh} packages={packages} expanded={preSurveyExpanded} onToggle={() => setPreSurveyExpanded(!preSurveyExpanded)} />
              </StepCard>
            )}

            {/* Step 02: Survey */}
            {(!focus || visibleStep === 1) && (
              <StepCard
                {...stepProps(1)}
                title="Survey"
                doneTitle="Survey Done"
                icon="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                onHeaderClick={cardState(1) === "done" ? () => setSurveyExpanded(!surveyExpanded) : undefined}
              >
                <SurveyStep lead={lead} state={cardState(1)} refresh={refresh} onAddActivity={t => setModalType(t as ActivityType)} packages={packages} expanded={surveyExpanded} onToggle={() => setSurveyExpanded(!surveyExpanded)} />
              </StepCard>
            )}

            {/* Step 03: Quotation */}
            {(!focus || visibleStep === 2) && (
              <StepCard
                {...stepProps(2)}
                title="Quotation"
                doneTitle="Quotation Done"
                icon="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              >
                <QuoteStep lead={lead} state={cardState(2)} refresh={refresh} packages={packages} expanded={quoteExpanded} onToggle={() => setQuoteExpanded(!quoteExpanded)} />
              </StepCard>
            )}

            {/* Step 04: Purchased */}
            {(!focus || visibleStep === 3) && (
              <StepCard
                {...stepProps(3)}
                title="Approval & Payment"
                doneTitle="Approved & Paid"
                icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              >
                <OrderStep lead={lead} state={cardState(3)} refresh={refresh} expanded={orderExpanded} onToggle={() => setOrderExpanded(!orderExpanded)} />
              </StepCard>
            )}

            {/* Step 05: Installed */}
            {(!focus || visibleStep === 4) && (
              <StepCard
                {...stepProps(4)}
                title="Install"
                doneTitle="Install Done"
                icon="M11.42 15.17l-5.658-5.66a2.122 2.122 0 010-3l1.532-1.532a2.122 2.122 0 013 0L15.953 10.637a2.122 2.122 0 010 3l-1.532 1.532a2.122 2.122 0 01-3 0z"
              >
                <InstallStep lead={lead} state={cardState(4)} refresh={refresh} expanded={installExpanded} onToggle={() => setInstallExpanded(!installExpanded)} />
              </StepCard>
            )}

            {/* Step 06: Warranty */}
            {(!focus || visibleStep === 5) && (
              <StepCard
                {...stepProps(5)}
                title="Warranty"
                doneTitle="Warranty Issued"
                icon="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.333 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                onHeaderClick={cardState(5) === "done" ? () => setWarrantyExpanded(!warrantyExpanded) : undefined}
              >
                <WarrantyStep lead={lead} state={cardState(5)} refresh={refresh} packages={packages} expanded={warrantyExpanded} onToggle={() => setWarrantyExpanded(!warrantyExpanded)} />
              </StepCard>
            )}

            {/* Step 07: Grid-Tie (ขอขนานไฟ) */}
            {(!focus || visibleStep === 6) && (
              <StepCard
                {...stepProps(6)}
                title="ขอขนานไฟ"
                doneTitle="ขนานไฟสำเร็จ"
                icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                onHeaderClick={cardState(6) === "done" ? () => setGridTieExpanded(!gridTieExpanded) : undefined}
              >
                <GridTieStep lead={lead} state={cardState(6)} refresh={refresh} expanded={gridTieExpanded} onToggle={() => setGridTieExpanded(!gridTieExpanded)} />
              </StepCard>
            )}

            {/* Lost banner */}
            {isLost && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                <div className="text-sm font-bold text-red-700 mb-1">Closed Lost</div>
                {lead.lost_reason && <div className="text-xs text-red-600">{lead.lost_reason}</div>}
                {lead.revisit_date && (
                  <div className="text-xs text-red-600 mt-1">Revisit: {formatDate(lead.revisit_date)}</div>
                )}
                <button
                  onClick={() => setModalType("follow_up")}
                  className="mt-3 w-full h-8 rounded-lg text-xs font-semibold text-white bg-blue-500"
                >
                  Set Revisit Date
                </button>
              </div>
            )}

            {/* Lost action — moved to the top of the tab (next to the
                กลุ่มลูกค้า header) so it's visible without scrolling. */}
          </div>
        ) : tab === "timeline" ? (
          <div className="p-4">
            {(() => {
              // Group by step (Pre-Survey / Survey / Quotation / Order / Install
              // / Warranty / Cancelled). Each section uses the InfoSection layout
              // from the Info tab so the look is consistent; rows inside are
              // "what happened · when" bullets sorted earliest → latest.
              type Bullet = { date: string | null; label: string; sub?: string; tone?: "paid" | "pending"; slipPaymentId?: number };
              const fmtIfDate = (d: string | null | undefined) => d ? formatDate(d) : "—";

              const preSurveyRows: Bullet[] = [];
              if (lead.created_at) preSurveyRows.push({ date: lead.created_at, label: "ลงทะเบียน Lead" });
              if (lead.pre_booked_at) preSurveyRows.push({
                date: lead.pre_booked_at,
                label: "ออกใบจอง",
                sub: [lead.pre_doc_no && `เลขที่ ${lead.pre_doc_no}`, lead.pre_total_price && `ค่าจอง ${formatNumber(lead.pre_total_price)} ฿`].filter(Boolean).join(" · ") || undefined,
              });
              // Booking deposit — read step 1 (submitted) + step 2 (confirmed)
              // straight from the payment row; backfill migration 010 fills
              // these for legacy rows that only had the activity log.
              // ฟรีค่าสำรวจ takes priority: any stale pre_slip_url payment row
              // (from a previous "normal" attempt) is meaningless once the lead
              // is marked free, so we render a single "ฟรีค่าสำรวจ" entry
              // instead of confusing the user with the abandoned 1,000 ฿ row.
              if (lead.pre_survey_fee_type === "free") {
                preSurveyRows.push({
                  date: lead.pre_booked_at ?? null,
                  label: "ฟรีค่าสำรวจ",
                  sub: lead.pre_note || undefined,
                  tone: "paid",
                });
              } else {
                const prePay = paymentRows.find(p => p.slip_field === "pre_slip_url");
                if (prePay) {
                  const parts: string[] = [];
                  if (prePay.submitted_at) {
                    parts.push(`รับเงินโดย ${prePay.submitted_by_name || "—"} ${formatDate(prePay.submitted_at)} ${formatThaiTime(prePay.submitted_at)}`);
                  }
                  if (prePay.confirmed_at) {
                    parts.push(`ยืนยันรับเงินโดย ${prePay.confirmed_by_name || "—"} ${formatDate(prePay.confirmed_at)} ${formatThaiTime(prePay.confirmed_at)}`);
                  } else {
                    parts.push("รอบัญชียืนยัน");
                  }
                  preSurveyRows.push({
                    date: prePay.confirmed_at ?? prePay.submitted_at ?? lead.pre_booked_at ?? null,
                    label: `ชำระเงินจองสำรวจ${prePay.amount ? ` ${formatNumber(prePay.amount)} ฿` : ""}`,
                    sub: parts.length ? parts.join(" · ") : undefined,
                    tone: prePay.confirmed_at ? "paid" : "pending",
                    slipPaymentId: prePay.id,
                  });
                }
              }

              const surveyRows: Bullet[] = [];
              if (lead.survey_date) surveyRows.push({
                date: lead.survey_date,
                label: "นัดวันเข้าสำรวจ",
                sub: lead.survey_time_slot ? `ช่วงเวลา ${lead.survey_time_slot}` : undefined,
              });
              if (lead.survey_actual_date) surveyRows.push({
                date: lead.survey_actual_date,
                label: "เข้าสำรวจหน้างานจริง",
                sub: lead.survey_actual_by ? `โดย ${lead.survey_actual_by}` : undefined,
              });

              const quoteRows: Bullet[] = [];
              if (lead.quotation_sent_date) quoteRows.push({
                date: lead.quotation_sent_date,
                label: "ส่งใบเสนอราคา",
                sub: lead.quotation_amount ? `ยอด ${formatNumber(lead.quotation_amount)} ฿` : undefined,
              });

              const orderInstallments = (() => {
                try { return JSON.parse(lead.order_installments || "[]") as Array<{ due_date?: string; pct?: number; when?: string; method?: string }>; }
                catch { return []; }
              })();
              const orderRows: Bullet[] = orderInstallments.map((r, i) => {
                const pctStr = r.pct ? `${typeof r.pct === "number" ? r.pct.toFixed(0) : r.pct}%` : "";
                const methodStr = r.method ? `${r.method === "cc" ? "บัตรเครดิต" : r.method === "loan" ? "สินเชื่อ" : "โอน"}` : "";
                const pay = paymentRows.find(p => p.slip_field === `order_installment_${i}`);
                // Amount preference: confirmed payment row → computed from pct
                // × lead.order_total → null. Shown in label so it's visible
                // even with sub collapsed.
                const computedAmount = (typeof r.pct === "number" && lead.order_total)
                  ? Math.round((lead.order_total * r.pct) / 100)
                  : null;
                const amount = pay?.amount ?? computedAmount;
                const subParts: string[] = [];
                if (pctStr) subParts.push(pctStr);
                if (methodStr) subParts.push(methodStr);
                if (pay?.submitted_at) {
                  subParts.push(`รับเงินโดย ${pay.submitted_by_name || "—"} ${formatDate(pay.submitted_at)} ${formatThaiTime(pay.submitted_at)}`);
                }
                if (pay?.confirmed_at) {
                  subParts.push(`ยืนยันรับเงินโดย ${pay.confirmed_by_name || "—"} ${formatDate(pay.confirmed_at)} ${formatThaiTime(pay.confirmed_at)}`);
                } else if (pay) {
                  subParts.push("รอบัญชียืนยัน");
                }
                const bullet: Bullet = {
                  date: r.due_date || null,
                  label: `งวดที่ ${i + 1} ${r.when === "after" ? "(หลังติดตั้ง)" : "(ก่อนติดตั้ง)"}${amount != null ? ` · ${formatNumber(amount)} ฿` : ""}`,
                  sub: subParts.length ? subParts.join(" · ") : undefined,
                  tone: pay?.confirmed_at ? "paid" : "pending",
                  slipPaymentId: pay?.id,
                };
                return bullet;
              }).filter(b => b.date);

              const installRows: Bullet[] = [];
              if (lead.install_date) {
                const endStr = lead.install_date_end && lead.install_date_end !== lead.install_date
                  ? ` – ${formatDate(lead.install_date_end)}`
                  : "";
                installRows.push({ date: lead.install_date, label: `นัดวันติดตั้ง${endStr}` });
              }
              if (lead.install_completed_at) installRows.push({ date: lead.install_actual_date || lead.install_completed_at, label: "ติดตั้งเสร็จสิ้น" });

              const warrantyRows: Bullet[] = [];
              if (lead.warranty_issued_at) warrantyRows.push({ date: lead.warranty_issued_at, label: "ออกใบรับประกัน" });

              const lostRows: Bullet[] = [];
              if (isLost) {
                const lostAct = activities.find(a => a.activity_type === "status_change" && (a.new_status === "lost" || a.new_status === "returned"));
                lostRows.push({
                  date: lostAct?.created_at ?? null,
                  label: lead.status === "returned" ? "ส่งกลับ Seeker" : "ยกเลิก",
                  sub: lead.lost_reason || undefined,
                });
              }

              const sections = [
                { id: "tl-pre",    title: "Pre-Survey",   rows: preSurveyRows, tone: "text-sky-700",     dot: "bg-sky-500" },
                { id: "tl-survey", title: "Survey",       rows: surveyRows,    tone: "text-violet-700",  dot: "bg-violet-500" },
                { id: "tl-quote",  title: "Quotation",    rows: quoteRows,     tone: "text-orange-700",  dot: "bg-orange-500" },
                { id: "tl-order",  title: "Order · งวดชำระ", rows: orderRows,   tone: "text-emerald-700", dot: "bg-emerald-500" },
                { id: "tl-install", title: "Install",     rows: installRows,   tone: "text-amber-700",   dot: "bg-amber-500" },
                { id: "tl-warranty", title: "Warranty",   rows: warrantyRows,  tone: "text-teal-700",    dot: "bg-teal-500" },
                ...(isLost ? [{ id: "tl-lost", title: "ยกเลิก", rows: lostRows, tone: "text-red-700", dot: "bg-red-500" }] : []),
              ].filter(s => s.rows.length > 0);

              // Sort bullets within each section earliest → latest
              sections.forEach(s => s.rows.sort((a, b) => {
                const ta = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
                const tb = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
                return ta - tb;
              }));

              if (sections.length === 0) {
                return (
                  <div className="text-center py-16">
                    <div className="w-14 h-14 mx-auto rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
                      </svg>
                    </div>
                    <div className="text-sm font-semibold text-gray-700">ยังไม่มี milestone</div>
                  </div>
                );
              }
              return (
                <div className="space-y-3 rounded-2xl bg-white border border-gray-200 px-4 py-4">
                  {sections.map(s => (
                    <InfoSection
                      key={s.id}
                      id={s.id}
                      title={s.title}
                      filled={s.rows.length}
                      total={s.rows.length}
                      open={openSections[s.id] ?? true}
                      onToggle={toggleSection}
                    >
                      <ul className="space-y-2 py-1">
                        {s.rows.map((r, i) => {
                          const isPaid = r.tone === "paid";
                          const isPending = r.tone === "pending";
                          const dotCls = isPaid ? "bg-emerald-500" : isPending ? "bg-orange-500" : s.dot;
                          const labelCls = isPaid ? "text-emerald-700" : isPending ? "text-orange-700" : "text-gray-800";
                          const dateCls = isPaid ? "text-emerald-600" : isPending ? "text-orange-600" : "text-gray-500";
                          const subCls = isPaid ? "text-emerald-600" : isPending ? "text-orange-600" : "text-gray-500";
                          return (
                            <li key={i} className="flex items-start gap-2.5 text-sm">
                              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className={`font-semibold ${labelCls}`}>{r.label}</span>
                                  {isPending && (
                                    <span className="text-xxs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700">รอรับชำระ</span>
                                  )}
                                  <span className={`text-xs font-mono tabular-nums ${dateCls}`}>· {fmtIfDate(r.date)}</span>
                                </div>
                                {r.sub && <div className={`text-xs mt-0.5 ${subCls}`}>{r.sub}</div>}
                                {/* Slip thumbnail — `/api/payments/{id}` streams
                                    the first slot's blob; FallbackImage hides
                                    itself if there isn't one (404 / failed). */}
                                {r.slipPaymentId && (
                                  <div className="mt-1.5">
                                    <FallbackImage
                                      src={`/api/payments/${r.slipPaymentId}`}
                                      alt="สลิป"
                                      lightboxLabel={`สลิป ${r.label}`}
                                      className="w-20 h-20 object-cover rounded-md border border-gray-200 bg-gray-50 cursor-zoom-in"
                                      fallbackLabel=""
                                    />
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </InfoSection>
                  ))}
                </div>
              );
            })()}
          </div>
        ) : tab === "serials" ? (
          // Lock the Serials list only after the lead has moved PAST the
          // warranty step. While status === "warranty" the team is still
          // capturing SNs / re-running OCR — locking that early would force
          // them to flip status backwards to fix a single typo.
          <SerialsUploader leadId={lead.id} locked={lead.status === "gridtie" || lead.status === "closed"} />
        ) : tab === "photos" ? (
          <PhotosTab lead={lead as unknown as Record<string, unknown>} leadId={lead.id} />
        ) : (
          <div className="p-4 md:hidden">
            <ActivityTimeline activities={activities} loading={loadingAct} />
          </div>
        )}
        </div>
      </div>

      {/* Desktop right panel — Activity Log content (header is in the sticky
          page header above to align with the Workflow/Info tabs). */}
      <aside className="hidden md:flex w-80 border-l border-gray-200 bg-gray-50/30 flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-4">
          <ActivityTimeline activities={activities} loading={loadingAct} />
        </div>
      </aside>
      </div>

      {/* Footer quick actions — mobile only; desktop has buttons in the sticky tab bar. */}
      {(tab === "info" || tab === "workflow") && !isLost && (
        <div className="fixed left-0 right-0 md:hidden above-nav bg-white border-t border-gray-100 z-40 px-3 py-2 flex gap-2">
          <button
            onClick={() => setModalType("follow_up")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold active:bg-amber-100 transition-colors"
          >
            <ClockIcon className="w-4 h-4" strokeWidth={2} />
            Follow-up
          </button>
          <button
            onClick={() => setModalType("note")}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold active:bg-gray-200 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Note
          </button>
        </div>
      )}

      {modalType && (
        <AddActivityModal
          activityType={modalType}
          leadId={lead.id}
          leadPhone={lead.phone}
          canSendBack={!!lead.from_prospect && lead.status === "pre_survey" && !lead.payment_confirmed}
          onClose={() => setModalType(null)}
          onSaved={refresh}
        />
      )}
      {showLostModal && <LostModal leadId={lead.id} onClose={() => setShowLostModal(false)} onSaved={refresh} />}

      {/* PreSurvey questionnaire edit — reuses the workflow-tab form so both
          views stay in sync. Save closes and re-fetches; X-close flushes any
          pending edits (form has its own 600ms debounce). */}
      {editQuestionnaireOpen && (
        <ModalBase
          title={
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-active/10 text-active flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                </svg>
              </span>
              <span>แก้ไขแบบสอบถาม (PreSurvey)</span>
            </div>
          }
          onClose={async () => {
            try { await editQFormRef.current?.flushSave(); } catch { /* silent */ }
            setEditQuestionnaireOpen(false);
            refresh();
          }}
          size="2xl"
          footer={
            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  try { await editQFormRef.current?.flushSave(); } catch { /* silent */ }
                  setEditQuestionnaireOpen(false);
                  refresh();
                }}
                className="h-9 px-5 rounded-lg bg-active text-white font-semibold hover:brightness-110"
              >
                บันทึกและปิด
              </button>
            </div>
          }
        >
          {/* hideResidence=false so Customer Profile is editable too. hide the
              packages picker — that's owned by PreSurveyStep sub-step 1, not
              part of the questionnaire. */}
          <PreSurveyForm
            ref={editQFormRef}
            lead={lead}
            refresh={refresh}
            hidePackages
          />
        </ModalBase>
      )}

      {/* LINE map modal */}
      {showLineModal && (
        <LinePickerModal
          target={{ type: "lead", id: lead.id, label: lead.full_name }}
          onClose={() => setShowLineModal(false)}
          onLinked={() => refresh()}
        />
      )}

      {/* LINE unmap confirm modal */}
      {showUnmapLine && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !unmapping && setShowUnmapLine(false)} />
          <div className="relative bg-white rounded-2xl w-[85%] max-w-sm p-5 animate-slide-up text-center">
            <button
              type="button"
              onClick={() => !unmapping && setShowUnmapLine(false)}
              disabled={unmapping}
              className="absolute top-3 right-3 w-8 h-8 rounded-full text-gray-400 hover:bg-gray-100 flex items-center justify-center disabled:opacity-40"
              aria-label="ปิด"
              style={{ minHeight: 0 }}
            >
              ✕
            </button>
            <div className="text-base font-bold mb-3">ยกเลิกการเชื่อม LINE?</div>
            <div className="flex flex-col items-center gap-2 mb-3">
              {lead.line_picture_url ? (
                <img src={lead.line_picture_url} alt="" className="w-16 h-16 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                  <LineIcon className="w-7 h-7 text-emerald-600" />
                </div>
              )}
              <div className="text-sm font-bold text-gray-900">{lead.line_display_name || "LINE user"}</div>
              <div className="text-xs text-gray-400 font-mono break-all max-w-[200px] truncate">{lead.line_id}</div>
            </div>
            <div className="text-xs text-gray-500 mb-3">ลูกค้า: <span className="font-semibold text-gray-700">{lead.full_name}</span></div>
            <div className="text-xs text-gray-400 mb-3">หลังยกเลิก จะส่ง LINE ให้ลูกค้ารายนี้ไม่ได้จนกว่าจะเชื่อมใหม่</div>
            <button
              type="button"
              onClick={async () => {
                setUnmapping(true);
                try {
                  await apiFetch(`/api/leads/${lead.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ line_id: null }),
                  });
                  await refresh();
                  setShowUnmapLine(false);
                } catch (e) {
                  dialog.alert({ title: "ยกเลิกไม่สำเร็จ", message: e instanceof Error ? e.message : "เกิดข้อผิดพลาด", variant: "danger" });
                } finally {
                  setUnmapping(false);
                }
              }}
              disabled={unmapping}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {unmapping ? "กำลังยกเลิก…" : "ยกเลิกการเชื่อม"}
            </button>
          </div>
        </div>
      )}

      {showProfileModal && (
        <ProfileModal leadId={lead.id} onClose={() => setShowProfileModal(false)} onSaved={refresh} />
      )}
    </div>
  );
}
