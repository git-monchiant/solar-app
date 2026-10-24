"use client";

// Appliance load questions for Customer Info — how many of each device and for
// how long, day vs night. Shared by PreSurveyForm and the lead info tab so the
// two surfaces ask the same questions the same way (same reason the AC card is
// duplicated in both). Wattage is never asked: computeLoad() supplies it.
//
// A blank box means "not answered", which is different from 0. "ไม่มี"
// stores qty 0; "ไม่ทราบ" stores { unknown: true } — both count as answered
// for the quotation submit gate, but only real numbers produce kWh. The one
// exception is a blank day/night period beside a filled one: that's 0.

import { useState, type ReactNode } from "react";
import { AC_TIERS } from "@/lib/customer-questionnaire";
import {
  computeLoad, defaultEvChargerKw, EV_CHARGER_KW_OPTIONS, LOAD_COVERAGE_WARN, LOAD_DEFAULT_KW, LOAD_DEVICES,
  loadBillCheck, parseLoadProfile, serializeLoadProfile,
  type LoadDeviceKey, type LoadEntry, type LoadProfile,
} from "@/lib/load-assumption";
import { formatTHB } from "@/lib/utils/formatters";

interface Props {
  profile: LoadProfile;
  acSplit: string | null | undefined;
  hasEv: boolean;
  evChargePeriod: string | null | undefined;
  // Meter decides the EV charger's default size (see defaultEvChargerKw).
  // Pass the surveyor's measured values when the lead has them.
  meterSize?: string | null;
  electricalPhase?: string | null;
  // Same bill the report's §3 compares against (questionnaire answer first,
  // then the survey form). No quotation yet, so the rate is the 5 ฿ default.
  monthlyBill?: number | null;
  onChange: (next: LoadProfile) => void;
}

const chipBtn = (selected: boolean) =>
  `h-7 px-2.5 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;
// Type sizes use the app scale (text-xxs/xs/sm are 16/18/20px on desktop —
// DB Heavent reads small). Never a literal text-[10px]: the first version did
// and the labels came out at half the size of every other question.
const watt = (kw: number) => (kw < 1 ? `${Math.round(kw * 1000)} W` : `${kw} kW`);

// Typed, not stepped — +/− taps were slow for anything past a handful (bulbs,
// minutes of hot water). Only digits and one dot get in; over `max` is saved
// as `max`. Each keystroke saves so the total below moves as you type, but the
// box shows the raw text until it loses focus — "1." or a box cleared mid-edit
// must not snap back to the saved number.
function NumInput({ label, value, onChange, max, disabled, warn }: {
  label: string; value: number | undefined; onChange: (v: number | undefined) => void; max: number; disabled?: boolean;
  /** the card was started and this is one of the blanks keeping it out of the total */
  warn?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const has = value !== undefined;
  const flag = warn && !has;
  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className={`text-xs mb-1 ${flag ? "text-amber-700 font-semibold" : "text-gray-500"}`}>{label}</div>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={draft ?? (has ? String(value) : "")}
        placeholder="–"
        title={`สูงสุด ${max}`}
        onFocus={e => setDraft(e.target.value)}
        onChange={e => {
          const t = e.target.value.trim();
          if (!/^\d*\.?\d*$/.test(t)) return;
          setDraft(t);
          if (t === "") onChange(undefined);
          else if (t !== ".") onChange(Math.min(max, Number(t)));
        }}
        onBlur={() => setDraft(null)}
        // Enter = done with this box; it must not submit a surrounding form.
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        className={`w-24 h-8 px-3 rounded-lg border bg-white text-sm font-mono tabular-nums text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-active ${flag ? "border-amber-400" : "border-gray-200"}`}
      />
    </div>
  );
}

export default function LoadProfileEditor({ profile, acSplit, hasEv, evChargePeriod, meterSize, electricalPhase, monthlyBill, onChange }: Props) {
  const set = (key: LoadDeviceKey, entry: LoadEntry | undefined) => {
    const next = { ...profile };
    if (entry) next[key] = entry; else delete next[key];
    onChange(next);
  };
  // Typing a number drops "ไม่ทราบ" — the customer evidently knew after all.
  // Clearing a box (undefined) removes the field, and the last one clears the
  // card back to untouched rather than leaving an empty entry flagged amber.
  const setField = (key: LoadDeviceKey, field: keyof LoadEntry, v: number | string | undefined) => {
    const { unknown: _unknown, ...rest } = profile[key] || {};
    void _unknown;
    const next: Record<string, unknown> = { ...rest, [field]: v };
    if (v === undefined) delete next[field];
    set(key, Object.keys(next).length ? next as LoadEntry : undefined);
  };
  const isNone = (key: LoadDeviceKey) => {
    const e = profile[key];
    return key === "washer" ? e?.loads_per_week === 0 : e?.qty === 0;
  };
  const toggleNone = (key: LoadDeviceKey) =>
    set(key, isNone(key) ? undefined : key === "washer" ? { loads_per_week: 0 } : { qty: 0 });
  const toggleUnknown = (key: LoadDeviceKey) => set(key, profile[key]?.unknown ? undefined : { unknown: true });

  const split = (() => {
    try { return acSplit ? JSON.parse(acSplit) as { day?: Record<string, number>; night?: Record<string, number> } : null; } catch { return null; }
  })();
  const acUnits = (period: "day" | "night") => AC_TIERS.reduce((a, t) => a + (Number(split?.[period]?.[t.key]) || 0), 0);
  const acDay = acUnits("day"), acNight = acUnits("night");

  const evDefaultKw = defaultEvChargerKw(meterSize, electricalPhase);
  const result = computeLoad({ load_profile: profile, ac_split: acSplit, appliances: hasEv ? "ev" : null, ev_charge_period: evChargePeriod, meter_size: meterSize, electrical_phase: electricalPhase });
  const fmt = (n: number | null) => (n ?? 0).toLocaleString("th-TH", { maximumFractionDigits: 1 });
  const billCheck = loadBillCheck(result, monthlyBill, null);
  const billPct = billCheck ? Math.round(billCheck.coverage * 100) : null;

  // A card that was started but has a blank left is "partial" in computeLoad
  // and silently drops out of the total — e.g. hours typed with no จำนวน.
  // Name the blanks on the card so the number not moving has a reason.
  // Untouched cards stay quiet; the quotation gate catches those. Mirrors
  // computeLoad: one period's hours is enough (the blank one counts as 0).
  const missing = (key: LoadDeviceKey): string[] => {
    const e = profile[key];
    if (!e || e.unknown || isNone(key)) return [];
    const need = (v: unknown, label: string) => (v === undefined ? [label] : []);
    const noHours = (day: unknown, night: unknown, label: string) => (day === undefined && night === undefined ? [label] : []);
    switch (key) {
      case "ac": return (acDay > 0 && e.day_h !== undefined) || (acNight > 0 && e.night_h !== undefined) ? [] : ["ชั่วโมง"];
      case "fridge": return need(e.qty, "จำนวน");
      case "water_heater": return [...need(e.qty, "จำนวน"), ...noHours(e.day_min, e.night_min, "นาที")];
      case "washer": return [...need(e.loads_per_week, "ครั้ง/สัปดาห์"), ...need(e.period, "ช่วงที่ซัก")];
      case "ev": return [
        ...need(e.sessions_per_week, "ครั้ง/สัปดาห์"), ...need(e.hours_per_session, "ชม. ต่อครั้ง"),
        ...(evChargePeriod === "day" || evChargePeriod === "night" ? [] : ["ช่วงชาร์จ (คำถามด้านบน)"]),
      ];
      default: return [...need(e.qty, "จำนวน"), ...noHours(e.day_h, e.night_h, "ชั่วโมง")];
    }
  };
  const incomplete = LOAD_DEVICES.filter(d => (d.key !== "ev" || hasEv) && missing(d.key).length > 0).map(d => d.label);
  const warnIf = (key: LoadDeviceKey) => missing(key).length > 0;

  const card = (key: LoadDeviceKey, title: string, hint: string, body: ReactNode, opts: { none?: boolean } = {}) => {
    const e = profile[key];
    const miss = missing(key);
    return (
      <div key={key} className={`rounded-lg border p-3 ${miss.length ? "border-amber-300 bg-amber-50/40" : "border-gray-200 bg-white/50"}`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-700">{title}</div>
            <div className="text-xxs text-gray-500">{hint}</div>
          </div>
          <div className="flex gap-1 shrink-0">
            {opts.none !== false && <button type="button" onClick={() => toggleNone(key)} className={chipBtn(isNone(key))}>ไม่มี</button>}
            <button type="button" onClick={() => toggleUnknown(key)} className={chipBtn(!!e?.unknown)}>ไม่ทราบ</button>
          </div>
        </div>
        {!e?.unknown && !isNone(key) && <div className="flex flex-wrap gap-x-4 gap-y-2">{body}</div>}
        {miss.length > 0 && (
          <div className="mt-2 text-xxs text-amber-800">
            ยังไม่นับในยอดรวม — ยังไม่ได้ใส่ <b>{miss.join(" · ")}</b>
          </div>
        )}
      </div>
    );
  };
  const qtyHours = (key: LoadDeviceKey, qtyLabel: string, minutes = false) => {
    const e = profile[key] || {};
    const miss = missing(key);
    // only the blanks that block the total light up — a lone blank period is 0
    const warnTime = miss.includes(minutes ? "นาที" : "ชั่วโมง");
    return (
      <>
        <NumInput label={qtyLabel} value={e.qty} max={200} warn={miss.includes("จำนวน")} onChange={v => setField(key, "qty", v)} />
        {minutes ? (
          <>
            <NumInput label="กลางวัน (นาทีรวม/วัน)" value={e.day_min} max={720} warn={warnTime} onChange={v => setField(key, "day_min", v)} />
            <NumInput label="กลางคืน (นาทีรวม/วัน)" value={e.night_min} max={720} warn={warnTime} onChange={v => setField(key, "night_min", v)} />
          </>
        ) : (
          <>
            <NumInput label="กลางวัน (ชม./วัน)" value={e.day_h} max={12} warn={warnTime} onChange={v => setField(key, "day_h", v)} />
            <NumInput label="กลางคืน (ชม./วัน)" value={e.night_h} max={12} warn={warnTime} onChange={v => setField(key, "night_h", v)} />
          </>
        )}
      </>
    );
  };

  const ev = profile.ev || {};
  const washer = profile.washer || {};
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {card("ac", "เครื่องปรับอากาศ — ชั่วโมงที่เปิดต่อเครื่อง",
          acDay + acNight > 0 ? `กลางวัน ${acDay} เครื่อง · กลางคืน ${acNight} เครื่อง (จากจำนวนแอร์ด้านบน)` : "ระบุจำนวนแอร์ด้านบนก่อน",
          acDay + acNight > 0 ? (
            <>
              <NumInput label="กลางวัน (ชม./วัน)" value={profile.ac?.day_h} max={12} disabled={acDay === 0} warn={warnIf("ac")} onChange={v => setField("ac", "day_h", v)} />
              <NumInput label="กลางคืน (ชม./วัน)" value={profile.ac?.night_h} max={12} disabled={acNight === 0} warn={warnIf("ac")} onChange={v => setField("ac", "night_h", v)} />
            </>
          ) : null,
          { none: false })}
        {card("fridge", "ตู้เย็น", `เปิด 24 ชม. · ≈${watt(LOAD_DEFAULT_KW.fridge)} เฉลี่ยต่อเครื่อง`,
          <NumInput label="จำนวน (เครื่อง)" value={profile.fridge?.qty} max={20} onChange={v => setField("fridge", "qty", v)} />)}
        {card("water_heater", "เครื่องทำน้ำอุ่น", `≈${watt(LOAD_DEFAULT_KW.water_heater)} ต่อเครื่อง · นับนาทีที่อาบน้ำอุ่นรวมทุกคนในบ้าน ไม่ต้องคูณจำนวนเครื่อง`, qtyHours("water_heater", "จำนวน (เครื่อง)", true))}
        {card("water_pump", "ปั๊มน้ำ", `≈${watt(LOAD_DEFAULT_KW.water_pump)} ต่อเครื่อง · นับเวลาที่มอเตอร์ทำงานจริง ไม่ใช่เวลาที่เปิดสวิตช์ไว้`, qtyHours("water_pump", "จำนวน (เครื่อง)"))}
        {card("washer", "เครื่องซักผ้า", `≈${watt(LOAD_DEFAULT_KW.washer)} · 1 ชม. ต่อครั้ง`, (
          <>
            <NumInput label="ซัก (ครั้ง/สัปดาห์)" value={washer.loads_per_week} max={28} warn={warnIf("washer")} onChange={v => setField("washer", "loads_per_week", v)} />
            <div>
              <div className={`text-xs mb-1 ${warnIf("washer") && !washer.period ? "text-amber-700 font-semibold" : "text-gray-500"}`}>ซักช่วงไหน</div>
              <div className="flex gap-1">
                {(["day", "night"] as const).map(p => (
                  <button key={p} type="button" onClick={() => setField("washer", "period", p)} className={chipBtn(washer.period === p)}>
                    {p === "day" ? "กลางวัน" : "กลางคืน"}
                  </button>
                ))}
              </div>
            </div>
          </>
        ))}
        {card("electronics", "ทีวี / เครื่องใช้ไฟฟ้าอิเล็กทรอนิกส์", `≈${watt(LOAD_DEFAULT_KW.electronics)} ต่อเครื่อง (ทีวี คอมพิวเตอร์ ฯลฯ)`, qtyHours("electronics", "จำนวน (เครื่อง)"))}
        {card("lighting", "หลอดไฟส่องสว่าง", `≈${watt(LOAD_DEFAULT_KW.lighting)} ต่อหลอด (LED) · นับโดยประมาณ`, qtyHours("lighting", "จำนวน (หลอด)"))}
        {hasEv && card("ev", "ที่ชาร์จรถ EV",
          `${evChargePeriod === "day" || evChargePeriod === "night"
            ? `ชาร์จช่วง${evChargePeriod === "day" ? "กลางวัน" : "กลางคืน"} (จากคำถามด้านบน)`
            : "ยังไม่ได้เลือกช่วงชาร์จด้านบน"} · นับเวลาที่ชาร์จจริงจนแบตเต็ม ไม่ใช่เวลาที่เสียบสายทิ้งไว้`,
          (
            <>
              <div>
                <div className="text-xs text-gray-500 mb-1">ขนาดที่ชาร์จ (ค่าเริ่มต้นตามมิเตอร์ {evDefaultKw} kW)</div>
                <div className="flex gap-1">
                  {EV_CHARGER_KW_OPTIONS.map(kw => (
                    <button key={kw} type="button" onClick={() => setField("ev", "charger_kw", kw)}
                      className={chipBtn((ev.charger_kw ?? evDefaultKw) === kw)}>{kw} kW</button>
                  ))}
                </div>
              </div>
              <NumInput label="ชาร์จ (ครั้ง/สัปดาห์)" value={ev.sessions_per_week} max={14} warn={warnIf("ev")} onChange={v => setField("ev", "sessions_per_week", v)} />
              <NumInput label="ครั้งละ (ชม.)" value={ev.hours_per_session} max={24} warn={warnIf("ev")} onChange={v => setField("ev", "hours_per_session", v)} />
            </>
          ),
          { none: false })}
      </div>
      <div className="rounded-lg border border-active/20 bg-active/5 px-3 py-2 text-xs text-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-active">ประมาณการใช้ไฟ</span>
        {result.dayKwh === null ? (
          <span className="text-gray-500">ยังคำนวณไม่ได้ — กรอกอย่างน้อย 1 รายการให้ครบ</span>
        ) : (
          <>
            <span>กลางวัน <b className="font-mono tabular-nums">{fmt(result.dayKwh)}</b> kWh/วัน</span>
            <span>กลางคืน <b className="font-mono tabular-nums">{fmt(result.nightKwh)}</b> kWh/วัน</span>
            {result.nightShare !== null && <span>ใช้ไฟกลางคืน <b className="font-mono tabular-nums">{Math.round(result.nightShare * 100)}%</b></span>}
            {billCheck?.complete && <span>≈ <b className="font-mono tabular-nums">{billPct}%</b> ของค่าไฟจริง</span>}
          </>
        )}
        {incomplete.length > 0 && <span className="font-semibold text-amber-800">ยังไม่นับ: {incomplete.join(", ")} (กรอกไม่ครบ)</span>}
        <span className="text-gray-500 ml-auto">คำนวณได้ {result.computedRows}/{result.totalRows} รายการ · ช่วงที่เว้นว่าง = ไม่ได้ใช้ · กำลังไฟใช้ค่ามาตรฐาน ไม่ต้องถามลูกค้า</span>
      </div>
      {/* Shown as soon as the total overshoots — more answers only add kWh,
          so an overshoot on a half-filled form is already real. */}
      {billCheck?.warn && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-0.5">
          <div className="font-semibold">
            ประมาณการใช้ไฟสูงกว่าค่าไฟจริงมาก ≈ {billPct}% (ค่าไฟ {formatTHB(Number(monthlyBill))} บาท/เดือน · เกณฑ์เตือน {Math.round(LOAD_COVERAGE_WARN * 100)}%)
          </div>
          {billCheck.top && <div>กินไฟมากสุด: {billCheck.top.label} {fmt(billCheck.top.kwh)} kWh/วัน</div>}
          <div>ทวนชั่วโมงกับลูกค้าอีกครั้ง — ชั่วโมง = เวลาที่เครื่องทำงานจริง ไม่ใช่เวลาที่เปิดสวิตช์หรือเสียบปลั๊กไว้</div>
        </div>
      )}
    </div>
  );
}

// Info-tab variant: the tab PATCHes through a debounced queue and only sees
// the saved value after refresh(), so a controlled editor would snap back
// between quick keystrokes. Keep the working copy locally.
// A saved value re-seeds it only when it isn't one this field sent: our own
// writes come back after every refresh (sometimes an older one, overtaken by
// the next keystroke) and must not reset the copy — nor remount the editor,
// which used to be keyed on the saved value and dropped focus mid-typing once
// the boxes became text inputs. Anything else (the questionnaire modal, the
// server dropping the EV row) is a real change from elsewhere.
export function LoadProfileField({ value, onCommit, ...rest }: Omit<Props, "profile" | "onChange"> & {
  value: string | null | undefined;
  onCommit: (json: string | null) => void;
}) {
  const saved = value ?? null;
  const [profile, setProfile] = useState<LoadProfile>(() => parseLoadProfile(value));
  // Writes still in flight, oldest first. Once the newest comes back they've
  // all landed, so the list collapses — an old value saved later from the
  // modal then counts as a change again.
  const [sent, setSent] = useState<(string | null)[]>(() => [saved]);
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    if (!sent.includes(saved)) setProfile(parseLoadProfile(saved));
    if (!sent.includes(saved) || sent[sent.length - 1] === saved) setSent([saved]);
  }
  return (
    <LoadProfileEditor
      {...rest}
      profile={profile}
      onChange={next => {
        const json = serializeLoadProfile(next);
        setProfile(next);
        setSent(prev => [...prev, json]);
        onCommit(json);
      }}
    />
  );
}
