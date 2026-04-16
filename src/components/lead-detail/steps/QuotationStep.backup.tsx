"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps, Panel, Package } from "./types";

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

const INVERTER_GROUPS = [
  { phase: "1_phase", phaseLabel: "1-Phase", model: "SUN2000-L1", sizes: [3, 4, 5, 6] },
  { phase: "3_phase", phaseLabel: "3-Phase", model: "SUN2000-M1", sizes: [5, 6, 8, 10] },
];

interface Props extends StepCommonProps {
  packages: Package[];
}

export default function QuotationStep({ lead, state, refresh, packages: allPackages }: Props) {
  // Defaults: prefer survey_* values, otherwise derive from pre-survey package
  const prePkg = allPackages.find(p => p.id === lead.interested_package_id);
  const pkgPhase = prePkg?.phase === 3 ? "3_phase" : prePkg?.phase === 1 ? "1_phase" : null;
  const pkgInverter = prePkg?.inverter_brand && prePkg?.inverter_kw
    ? `${prePkg.phase === 3 ? "SUN2000-M1" : "SUN2000-L1"} ${prePkg.inverter_kw}kW`
    : null;
  const pkgBatteryKwh = prePkg?.has_battery ? Math.round(prePkg.battery_kwh) : prePkg ? 0 : null;

  const [phase, setPhase] = useState<string>(lead.survey_electrical_phase ?? lead.pre_electrical_phase ?? pkgPhase ?? "1_phase");
  const [inverter, setInverter] = useState<string>(lead.survey_inverter ?? pkgInverter ?? "");
  const [batteryKwh, setBatteryKwh] = useState<number | null>(
    lead.survey_battery_kwh ?? (lead.pre_wants_battery === "no" ? 0 : pkgBatteryKwh)
  );
  const [panels, setPanels] = useState<Panel[]>([]);
  const [panelId, setPanelId] = useState<number | "">(lead.survey_panel_id ?? "");
  const [panelCount, setPanelCount] = useState<number | "">(lead.survey_panel_count ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/panels").then((list: Panel[]) => {
      setPanels(list);
      // Pre-fill panel based on package (closest watt match) if nothing selected yet
      if (!panelId && prePkg?.panel_watt && list.length) {
        const match = list.reduce((best, p) => (
          Math.abs(p.watt - prePkg.panel_watt) < Math.abs(best.watt - prePkg.panel_watt) ? p : best
        ), list[0]);
        setPanelId(match.id);
        if (!panelCount && prePkg.solar_panels) setPanelCount(prePkg.solar_panels);
      }
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPanel = panels.find(p => p.id === panelId);
  const calcKwp = selectedPanel && typeof panelCount === "number" && panelCount > 0
    ? (selectedPanel.watt * panelCount) / 1000
    : 0;

  const inverterKw = (() => {
    const m = inverter.match(/(\d+)kW/);
    return m ? parseInt(m[1]) : 0;
  })();

  // Auto-save all selections (debounced)
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey_electrical_phase: phase || null,
          survey_inverter: inverter || null,
          survey_battery_kwh: batteryKwh,
          survey_wants_battery: batteryKwh === null ? null : batteryKwh === 0 ? "no" : "yes",
          survey_panel_id: panelId || null,
          survey_panel_count: typeof panelCount === "number" ? panelCount : null,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, inverter, batteryKwh, panelId, panelCount]);

  // Clear inverter if it doesn't match the new phase
  useEffect(() => {
    if (!inverter) return;
    const matchingGroup = INVERTER_GROUPS.find(g => g.phase === phase);
    const stillValid = matchingGroup && inverter.startsWith(matchingGroup.model);
    if (!stillValid) setInverter("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const markSent = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "purchased" }),
      });
      refresh();
    } finally {
      setSaving(false);
    }
  };

  if (state === "done") {
    return (
      <div className="text-sm">
        <span className="text-emerald-700 font-semibold">ส่งใบเสนอราคาแล้ว</span>
        {selectedPanel && typeof panelCount === "number" && (
          <span className="text-gray-500"> — {selectedPanel.brand} {selectedPanel.watt}W × {panelCount} ({calcKwp.toFixed(2)} kWp)</span>
        )}
      </div>
    );
  }

  if (state !== "active") return null;

  return (
    <div className="space-y-2">
      {/* Electrical phase */}
      <div className="rounded-lg bg-white/60 border border-active/15 p-3">
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">เลือกระบบไฟ</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "1_phase", label: "1 เฟส" },
            { value: "3_phase", label: "3 เฟส" },
          ].map(p => {
            const selected = phase === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPhase(p.value)}
                className={`h-10 px-3 rounded-lg text-[15px] font-semibold border transition-all ${
                  selected
                    ? "bg-active text-white border-active shadow-sm shadow-active/20"
                    : "bg-white text-gray-700 border-gray-200 hover:border-active/40"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inverter */}
      <div className="rounded-lg bg-white/60 border border-active/15 p-3">
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-3">เลือก Inverter</label>
        {!phase ? (
          <div className="text-xs text-gray-400 text-center py-3">เลือกระบบไฟก่อน</div>
        ) : (
          <div className="space-y-3">
            {INVERTER_GROUPS.filter(g => g.phase === phase).map(g => (
              <div key={g.phase}>
                <div className="text-xs font-semibold text-gray-600 mb-1.5">
                  {g.phaseLabel} <span className="text-gray-400 font-mono">· {g.model}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {g.sizes.map(kw => {
                    const value = `${g.model} ${kw}kW`;
                    const selected = inverter === value;
                    return (
                      <button
                        key={kw}
                        type="button"
                        onClick={() => setInverter(value)}
                        className={`h-10 rounded-lg text-[15px] font-bold font-mono tabular-nums border transition-all ${
                          selected
                            ? "bg-active text-white border-active shadow-sm shadow-active/20"
                            : "bg-white text-gray-700 border-gray-200 hover:border-active/40"
                        }`}
                      >
                        {kw}kW
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PV Module + count grid */}
      <div className="rounded-lg bg-white/60 border border-active/15 p-3">
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">เลือกแผง PV</label>
        <div className="grid grid-cols-3 gap-2">
          {panels.map(p => {
            const selected = panelId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPanelId(p.id)}
                className={`text-left rounded-lg p-2.5 border-2 transition-all ${
                  selected ? "border-active bg-active-light" : "border-gray-200 bg-white hover:border-active/40"
                }`}
              >
                <div className="text-sm font-bold text-gray-900 truncate">{p.brand}</div>
                {p.model && <div className="text-xs text-gray-500 truncate">{p.model}</div>}
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-base font-bold font-mono tabular-nums text-active">{p.watt}W</span>
                  {p.tier && <span className="text-[10px] text-gray-400">{p.tier}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {selectedPanel && inverterKw > 0 && (() => {
          const minCount = Math.max(1, Math.ceil((inverterKw * 0.80 * 1000) / selectedPanel.watt));
          const counts = Array.from({ length: 15 }, (_, i) => minCount + i);
          const tierClass = (dcAc: number) => {
            if (dcAc <= 0.85) return "bg-amber-100 border-amber-400 text-amber-800";
            if (dcAc <= 1.50) return "text-emerald-700 border-gray-200 bg-white";
            return "text-orange-500 border-gray-200 bg-white";
          };
          return (
            <div className="mt-3">
              <div className="text-xs text-gray-500 mb-2">
                จำนวนแผง <span className="font-semibold text-gray-700">{selectedPanel.brand} {selectedPanel.watt}W</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {counts.map(c => {
                  const kwp = (c * selectedPanel.watt) / 1000;
                  const dcAc = kwp / inverterKw;
                  const selected = panelCount === c;
                  const base = tierClass(dcAc);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setPanelCount(c)}
                      className={`flex flex-col items-center py-2 rounded-lg border-2 transition-all ${
                        selected ? "bg-active border-active text-white shadow-sm shadow-active/30" : base
                      }`}
                    >
                      <span className="text-base font-bold tabular-nums">{c}</span>
                      <span className={`text-[10px] ${selected ? "text-white/70" : "text-gray-400"}`}>แผง</span>
                      <span className={`text-xs font-bold tabular-nums mt-0.5 ${selected ? "text-white" : ""}`}>{kwp.toFixed(1)} kWp</span>
                      <span className={`text-[10px] tabular-nums mt-0.5 ${selected ? "text-white/80" : "opacity-70"}`}>DC:AC {dcAc.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
              {calcKwp > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-sm font-bold tabular-nums text-gray-900">
                    {calcKwp.toFixed(2)} kWp
                    <span className="ml-2 text-xs font-normal text-gray-500">ผลิตไฟ ~{Math.round(calcKwp * 4)} หน่วย/วัน</span>
                  </div>
                  <div className="text-xs font-semibold tabular-nums text-gray-600">
                    DC:AC {(calcKwp / inverterKw).toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
        {(!selectedPanel || inverterKw === 0) && calcKwp === 0 && (
          <div className="mt-2 text-xs text-gray-400 text-center py-2">เลือกแผงและ inverter เพื่อดูจำนวนแผงที่เหมาะสม</div>
        )}
      </div>

      {/* Battery */}
      <div className="rounded-lg bg-white/60 border border-active/15 p-3">
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">แบตเตอรี่</label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 0, label: "ไม่ต้องการ" },
            { value: 5, label: "5 kWh" },
            { value: 10, label: "10 kWh" },
            { value: 15, label: "15 kWh" },
          ].map(b => {
            const selected = batteryKwh === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => setBatteryKwh(b.value)}
                className={`h-10 px-2 rounded-lg text-[14px] font-semibold border transition-all ${
                  selected
                    ? "bg-active text-white border-active shadow-sm shadow-active/20"
                    : "bg-white text-gray-700 border-gray-200 hover:border-active/40"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Generate quotation */}
      <button
        onClick={markSent}
        disabled={saving || !inverter || !panelId || !panelCount}
        className="w-full h-11 mt-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? "…" : "ออกใบเสนอราคา"}
      </button>

      {(lead.package_name || lead.package_price) && (
        <div className="text-xs text-gray-400 text-center pt-1">
          แพ็คเกจ pre-survey: {lead.package_name} {lead.package_price ? `(${formatPrice(lead.package_price)} THB)` : ""}
        </div>
      )}
    </div>
  );
}
