"use client";

// Appliance load questions for Customer Info — how many of each device and for
// how long, day vs night. Shared by PreSurveyForm and the lead info tab so the
// two surfaces ask the same questions the same way (same reason the AC card is
// duplicated in both). Wattage is never asked: computeLoad() supplies it.
//
// null in a stepper means "not answered", which is different from 0. "ไม่มี"
// stores qty 0; "ไม่ทราบ" stores { unknown: true } — both count as answered
// for the quotation submit gate, but only real numbers produce kWh.

import { useState, type ReactNode } from "react";
import { AC_TIERS } from "@/lib/customer-questionnaire";
import {
  computeLoad, defaultEvChargerKw, EV_CHARGER_KW_OPTIONS, LOAD_DEFAULT_KW,
  parseLoadProfile, serializeLoadProfile,
  type LoadDeviceKey, type LoadEntry, type LoadProfile,
} from "@/lib/load-assumption";

interface Props {
  profile: LoadProfile;
  acSplit: string | null | undefined;
  hasEv: boolean;
  evChargePeriod: string | null | undefined;
  // Meter decides the EV charger's default size (see defaultEvChargerKw).
  // Pass the surveyor's measured values when the lead has them.
  meterSize?: string | null;
  electricalPhase?: string | null;
  onChange: (next: LoadProfile) => void;
}

const chipBtn = (selected: boolean) =>
  `h-7 px-2.5 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;
const stepBtn = "w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold flex items-center justify-center hover:border-active/40 hover:text-active disabled:opacity-30 disabled:cursor-not-allowed transition-colors";
// Type sizes use the app scale (text-xxs/xs/sm are 16/18/20px on desktop —
// DB Heavent reads small). Never a literal text-[10px]: the first version did
// and the labels came out at half the size of every other question.
const watt = (kw: number) => (kw < 1 ? `${Math.round(kw * 1000)} W` : `${kw} kW`);

function Stepper({ label, value, onChange, step = 1, max, disabled }: {
  label: string; value: number | undefined; onChange: (v: number) => void; step?: number; max: number; disabled?: boolean;
}) {
  const has = value !== undefined;
  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-1">
        <button type="button" disabled={!has || value === 0} onClick={() => onChange(Math.max(0, (value ?? 0) - step))} className={stepBtn}>−</button>
        <span className={`w-10 text-center text-sm font-mono tabular-nums ${has ? "text-gray-800" : "text-gray-400"}`}>{has ? value : "–"}</span>
        <button type="button" disabled={has && value >= max} onClick={() => onChange(Math.min(max, has ? value + step : step))} className={stepBtn}>+</button>
      </div>
    </div>
  );
}

export default function LoadProfileEditor({ profile, acSplit, hasEv, evChargePeriod, meterSize, electricalPhase, onChange }: Props) {
  const set = (key: LoadDeviceKey, entry: LoadEntry | undefined) => {
    const next = { ...profile };
    if (entry) next[key] = entry; else delete next[key];
    onChange(next);
  };
  // Typing a number drops "ไม่ทราบ" — the customer evidently knew after all.
  const setField = (key: LoadDeviceKey, field: keyof LoadEntry, v: number | string) => {
    const { unknown: _unknown, ...rest } = profile[key] || {};
    void _unknown;
    set(key, { ...rest, [field]: v });
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

  const card = (key: LoadDeviceKey, title: string, hint: string, body: ReactNode, opts: { none?: boolean } = {}) => {
    const e = profile[key];
    return (
      <div key={key} className="rounded-lg border border-gray-200 bg-white/50 p-3">
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
      </div>
    );
  };
  const qtyHours = (key: LoadDeviceKey, qtyLabel: string, minutes = false) => {
    const e = profile[key] || {};
    return (
      <>
        <Stepper label={qtyLabel} value={e.qty} max={200} onChange={v => setField(key, "qty", v)} />
        {minutes ? (
          <>
            <Stepper label="กลางวัน (นาที/วัน)" value={e.day_min} step={10} max={720} onChange={v => setField(key, "day_min", v)} />
            <Stepper label="กลางคืน (นาที/วัน)" value={e.night_min} step={10} max={720} onChange={v => setField(key, "night_min", v)} />
          </>
        ) : (
          <>
            <Stepper label="กลางวัน (ชม./วัน)" value={e.day_h} max={12} onChange={v => setField(key, "day_h", v)} />
            <Stepper label="กลางคืน (ชม./วัน)" value={e.night_h} max={12} onChange={v => setField(key, "night_h", v)} />
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
              <Stepper label="กลางวัน (ชม./วัน)" value={profile.ac?.day_h} max={12} disabled={acDay === 0} onChange={v => setField("ac", "day_h", v)} />
              <Stepper label="กลางคืน (ชม./วัน)" value={profile.ac?.night_h} max={12} disabled={acNight === 0} onChange={v => setField("ac", "night_h", v)} />
            </>
          ) : null,
          { none: false })}
        {card("fridge", "ตู้เย็น", `เปิด 24 ชม. · ≈${watt(LOAD_DEFAULT_KW.fridge)} เฉลี่ยต่อเครื่อง`,
          <Stepper label="จำนวน (เครื่อง)" value={profile.fridge?.qty} max={20} onChange={v => setField("fridge", "qty", v)} />)}
        {card("water_heater", "เครื่องทำน้ำอุ่น", `≈${watt(LOAD_DEFAULT_KW.water_heater)} ต่อเครื่อง · ถามเวลาใช้รวมต่อวัน`, qtyHours("water_heater", "จำนวน (เครื่อง)", true))}
        {card("water_pump", "ปั๊มน้ำ", `≈${watt(LOAD_DEFAULT_KW.water_pump)} ต่อเครื่อง`, qtyHours("water_pump", "จำนวน (เครื่อง)"))}
        {card("washer", "เครื่องซักผ้า", `≈${watt(LOAD_DEFAULT_KW.washer)} · 1 ชม. ต่อครั้ง`, (
          <>
            <Stepper label="ซัก (ครั้ง/สัปดาห์)" value={washer.loads_per_week} max={28} onChange={v => setField("washer", "loads_per_week", v)} />
            <div>
              <div className="text-xs text-gray-500 mb-1">ซักช่วงไหน</div>
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
          evChargePeriod === "day" || evChargePeriod === "night"
            ? `ชาร์จช่วง${evChargePeriod === "day" ? "กลางวัน" : "กลางคืน"} (จากคำถามด้านบน)`
            : "ยังไม่ได้เลือกช่วงชาร์จด้านบน",
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
              <Stepper label="ชาร์จ (ครั้ง/สัปดาห์)" value={ev.sessions_per_week} max={14} onChange={v => setField("ev", "sessions_per_week", v)} />
              <Stepper label="ครั้งละ (ชม.)" value={ev.hours_per_session} max={24} onChange={v => setField("ev", "hours_per_session", v)} />
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
          </>
        )}
        <span className="text-gray-500 ml-auto">คำนวณได้ {result.computedRows}/{result.totalRows} รายการ · กำลังไฟใช้ค่ามาตรฐาน ไม่ต้องถามลูกค้า</span>
      </div>
    </div>
  );
}

// Info-tab variant: the tab PATCHes through a debounced queue and only sees
// the saved value after refresh(), so a controlled editor would snap back
// between quick taps. Keep the working copy locally. Mount it with
// key={savedValue} so a change saved elsewhere (the questionnaire modal)
// re-seeds it — no effect-driven syncing.
export function LoadProfileField({ value, onCommit, ...rest }: Omit<Props, "profile" | "onChange"> & {
  value: string | null | undefined;
  onCommit: (json: string | null) => void;
}) {
  const [profile, setProfile] = useState<LoadProfile>(() => parseLoadProfile(value));
  return (
    <LoadProfileEditor
      {...rest}
      profile={profile}
      onChange={next => {
        setProfile(next);
        onCommit(serializeLoadProfile(next));
      }}
    />
  );
}
