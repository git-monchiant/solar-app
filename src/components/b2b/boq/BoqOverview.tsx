"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { formatNumber, formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import { perWp, type AddonMode, type CalcResult } from "@/lib/b2b/boq-calc";
import { omSummary, type OmParams } from "@/lib/b2b/boq-om";
import type { BoqHeader, BoqLine, BoqRevision } from "@/lib/b2b/boq";
import type { B2bCategory } from "@/lib/b2b/materials";
import BoqSummary from "./BoqSummary";
import type { CategoryFlags } from "./BoqCategorySection";

/** บาทเต็มจำนวน — formatTHB ค่าเริ่มต้นไม่ปัดเศษ (แสดงทศนิยมได้ถึง 3 ตำแหน่ง) */
const thb0 = (n: number) => formatTHB(Math.round(n));

// แท็บ "ภาพรวม" ของหน้าทำ BOQ (แผน 20261016-04 แบบ A+B) — dashboard: ตัวเลขหลัก · ต้องจัดการ · สัดส่วนต้นทุน · ต้นทุนเรียงหมวด · ข้อมูลใบ
// ตารางสรุปแบบไฟล์ Excel (BoqSummary เดิม) อยู่ท้าย พับไว้ · ตัวเลขทั้งหมดมาจาก calcBoq ชุดเดียวกับแท็บรายการ

export type BoqAlert = { key: string; cat: number | null; tone: "red" | "amber" | "gray" | "blue"; text: string };

/** สัดส่วนต้นทุน: สีผูกกับหมวด (ไม่ใช่ลำดับ) — categorical slot 1–5 ตรวจ validate_palette.js แล้ว (adjacent CVD ≥ 9.1)
 *  เรียงตามลำดับ slot คงที่ (คู่สีติดกันตามที่ตรวจ) · สีอ่อน 3 ตัวต่ำกว่า 3:1 ⇒ ตัวเลขอยู่ใน legend เสมอ */
const SLOTS: { cat: number; color: string }[] = [
  { cat: 1, color: "#2a78d6" }, { cat: 2, color: "#eb6834" }, { cat: 3, color: "#1baf7a" }, { cat: 17, color: "#eda100" }, { cat: 18, color: "#e87ba4" },
];
const OTHER = "#c4c9d1";
const TONE: Record<BoqAlert["tone"], string> = { red: "bg-red-500", amber: "bg-amber-400", gray: "bg-gray-400", blue: "bg-blue-500" };

export default function BoqOverview({ h, calc, categories, lines, margin, onMargin, readOnly, alerts, flags, onGo, revisions, onRev, om,
  addonIds, addonModes, onMode, changedCount, onApplyAll }: {
  h: BoqHeader;
  calc: CalcResult;
  categories: B2bCategory[];
  lines: BoqLine[];
  margin: string;
  onMargin: (v: string) => void;
  readOnly: boolean;
  alerts: BoqAlert[];
  flags: (categoryId: number) => CategoryFlags;
  onGo: (categoryId: number) => void;
  revisions: BoqRevision[];
  onRev: (id: number) => void;
  om: OmParams | null;
  addonIds: number[];
  addonModes: Record<number, AddonMode>;
  onMode: (categoryId: number, mode: AddonMode) => void;
  changedCount: number;
  onApplyAll: () => void;
}) {
  const [tableOpen, setTableOpen] = useState(false);
  const cap = calc.capacity_wp;
  const sub = calc.subtotal;
  const wp = (n: number) => (cap > 0 ? perWp(n, cap).toFixed(2) : "—");
  const name = new Map(categories.map((c) => [c.id, c.name]));
  // แผง: บรรทัดหมวด 1 ที่มีวัตต์ — รุ่นเดียวบอกรุ่น
  const panels = lines.filter((l) => l.category_id === 1 && l.spec_watt);
  const panelQty = panels.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const panelModels = [...new Set(panels.map((l) => l.model ?? l.name))];

  // สัดส่วนต้นทุน = ต้นทุนก่อน VAT (หมวดมาตรฐาน + ส่วนเพิ่มที่รวม) · ไม่รวมทางเลือก
  const costOf = (id: number) => {
    const r = calc.categories[id];
    return r && r.mode !== "optional" ? r.cost : 0;
  };
  const pct = (n: number) => (sub.cost > 0 ? (n / sub.cost) * 100 : 0);
  // หมวดประจำ slot ที่เล็กกว่า 1% รวมเข้า "อื่นๆ" — แถบบางจนมองไม่เห็นแต่กิน legend (สีของหมวดอื่นไม่เปลี่ยนตาม)
  const segs = SLOTS.map((s) => ({ ...s, label: `${s.cat}. ${name.get(s.cat) ?? ""}`, cost: costOf(s.cat) })).filter((s) => s.cost > 0 && pct(s.cost) >= 1);
  const shown = new Set(segs.map((s) => s.cat));
  const others = Object.values(calc.categories).filter((r) => !shown.has(r.id) && r.mode !== "optional" && r.cost > 0);
  const otherCost = others.reduce((s, r) => s + r.cost, 0);
  if (otherCost > 0) segs.push({ cat: 0, color: OTHER, label: `อื่นๆ (${others.length} หมวด)`, cost: otherCost });

  const ranked = Object.values(calc.categories).filter((r) => r.lines > 0 && r.mode !== "optional").sort((a, b) => b.cost - a.cost);
  const maxCost = Math.max(1, ...ranked.map((r) => r.cost));

  const card = "rounded-xl border border-gray-200 bg-white";
  const rankGrid = "grid grid-cols-[24px_minmax(0,1fr)_96px] items-center gap-x-3 px-2 md:grid-cols-[24px_minmax(0,200px)_1fr_96px_96px_48px]";
  const kLabel = "text-xs text-gray-500";
  const kValue = "text-2xl font-bold leading-tight text-gray-900 tabular-nums";

  return (
    <div className="space-y-4">
      {/* ── ตัวเลขหลัก ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.35fr_1fr_1fr_1.15fr_1.4fr]">
        <div className="relative col-span-2 overflow-hidden rounded-xl bg-gradient-to-br from-teal-600 to-primary p-4 text-white lg:col-span-1">
          <div className="text-xs text-white/85">ราคาขาย (ก่อน VAT)</div>
          <div className="mt-0.5 text-3xl font-bold leading-tight tabular-nums">{formatTHB(sub.sale, { decimals: 2 })}</div>
          <div className="text-xs text-white/85 tabular-nums">รวม VAT {h.vat_pct}% {formatTHB(calc.grand.sale, { decimals: 2 })}</div>
          {calc.addon_optional.sale > 0 && <div className="text-xs text-white/85 tabular-nums">ทางเลือก (ไม่รวม) +{thb0(calc.addon_optional.sale)}</div>}
          <span className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10" />
        </div>
        <div className={`${card} p-4`}>
          <div className={kLabel}>ขนาดระบบ</div>
          <div className={kValue}>{formatNumber(Math.round((cap / 1000) * 100) / 100)} <span className="text-sm font-medium text-gray-500">kWp</span></div>
          <div className="text-xs text-gray-500">{panelQty > 0 ? `${formatNumber(panelQty)} แผง${panelModels.length === 1 ? ` · ${panelModels[0]}` : ""}` : "ยังไม่มีแผงในหมวด 1"}</div>
        </div>
        <div className={`${card} p-4`}>
          <div className={kLabel}>ราคาต่อวัตต์ (บาท/Wp)</div>
          <div className="mt-0.5 flex gap-5">
            <div><div className="text-xxs text-gray-400">ขาย</div><div className={kValue}>{wp(sub.sale)}</div></div>
            <div><div className="text-xxs text-gray-400">ต้นทุน</div><div className={kValue}>{wp(sub.cost)}</div></div>
          </div>
        </div>
        <div className={`${card} p-4`}>
          <div className={kLabel}>กำไร</div>
          <div className={`${kValue} text-emerald-600`}>{thb0(sub.sale - sub.cost)}</div>
          <label className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-500" title="Margin = % ของราคาขาย">
            Margin
            <input type="number" step="0.01" min={0} max={99} disabled={readOnly} value={margin} onChange={(e) => onMargin(e.target.value)}
              className="h-8 w-20 rounded-lg border border-gray-200 bg-white px-2 text-right text-sm font-bold tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50" />
            %
          </label>
        </div>
        <div className={`col-span-2 rounded-xl border p-4 lg:col-span-1 ${alerts.length ? "border-amber-200 bg-amber-50/40" : "border-gray-200 bg-white"}`}>
          <div className="flex items-center gap-2">
            <span className={kLabel}>ต้องจัดการ</span>
            {alerts.length > 0 && <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-800">{alerts.length}</span>}
          </div>
          {alerts.length === 0 ? (
            <div className="mt-2 text-sm font-medium text-emerald-600">✓ ไม่มีรายการที่ต้องจัดการ</div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {alerts.map((a) => (
                <li key={a.key}>
                  <button type="button" onClick={() => a.cat != null && onGo(a.cat)} style={{ minHeight: 0 }} title={a.text}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm text-gray-700 hover:bg-white">
                    <i className={`h-2 w-2 shrink-0 rounded-full ${TONE[a.tone]}`} />
                    <span className="min-w-0 flex-1 truncate">{a.text}</span>
                    {a.cat != null && <span className="text-xs font-semibold text-primary">ไป ›</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!readOnly && changedCount > 0 && (
            <button type="button" onClick={onApplyAll} style={{ minHeight: 0 }} className="mt-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-200">
              ใช้ราคาใหม่ใน Master ทั้งหมด ({changedCount})
            </button>
          )}
        </div>
      </div>

      {/* ── สัดส่วนต้นทุน ── */}
      {segs.length > 0 && (
        <div className={`${card} px-4 py-3`}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-sm font-bold text-gray-900">สัดส่วนต้นทุน</h3>
            <span className="text-xs text-gray-400 tabular-nums">ต้นทุนรวม {thb0(sub.cost)} · ไม่รวมส่วนเพิ่มแบบทางเลือก</span>
          </div>
          <div className="flex h-4 overflow-hidden rounded bg-gray-100">
            {segs.map((s) => (
              <button key={s.cat} type="button" onClick={() => s.cat && onGo(s.cat)} style={{ width: `${pct(s.cost)}%`, background: s.color, minHeight: 0 }}
                title={`${s.label} · ${thb0(s.cost)} · ${pct(s.cost).toFixed(1)}%`}
                className="h-full border-r-2 border-white last:border-r-0 hover:brightness-95" />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-700">
            {segs.map((s) => (
              <span key={s.cat} className="inline-flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                {s.label}
                <span className="text-gray-400 tabular-nums">{thb0(s.cost)} · {pct(s.cost).toFixed(1)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] lg:items-start">
        {/* ── ต้นทุนเรียงหมวด ── */}
        <div className={card}>
          <div className="flex flex-wrap items-baseline gap-x-2 border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">ยอดแยกตามหมวด</h3>
            <span className="text-xs text-gray-400">เรียงตามต้นทุนจากมากไปน้อย · กดเพื่อไปแก้รายการ</span>
          </div>
          {ranked.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีรายการในใบนี้</p>
          ) : (
            <div className="px-2 py-2">
              {/* หัวคอลัมน์ — แถบ/สัดส่วนคิดจากต้นทุน · ตัวเลขทั้งต้นทุนและราคาขาย (เดิมหัวการ์ดบอก "ต้นทุน" แต่ตัวเลขเป็นราคาขาย) */}
              <div className={`${rankGrid} pb-1 text-xxs font-semibold text-gray-400`}>
                <span /><span>หมวด</span><span className="max-md:hidden" />
                <span className="max-md:hidden text-right">ต้นทุน</span><span className="text-right">ราคาขาย</span><span className="max-md:hidden text-right">สัดส่วน</span>
              </div>
              {ranked.map((r) => {
                const f = flags(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => onGo(r.id)} style={{ minHeight: 0 }}
                    className={`${rankGrid} w-full rounded-lg py-1.5 text-left hover:bg-gray-50`}>
                    <span className="text-right text-xs font-bold text-gray-400">{r.id}</span>
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-gray-700">
                      <span className="truncate">{name.get(r.id)}</span>
                      {f.pending > 0 && <span className="shrink-0 rounded-full bg-red-50 px-1.5 text-xxs font-semibold text-red-600">รอราคา</span>}
                      {f.changed > 0 && <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-xxs font-semibold text-amber-800">ราคาเปลี่ยน</span>}
                    </span>
                    <span className="max-md:hidden h-3 overflow-hidden rounded bg-gray-100">
                      <span className="block h-full rounded bg-sky-500" style={{ width: `${((r.cost / maxCost) * 100).toFixed(1)}%` }} />
                    </span>
                    <span className="max-md:hidden text-right text-sm tabular-nums text-gray-500">{thb0(r.cost)}</span>
                    <span className="text-right text-sm font-medium tabular-nums text-gray-800">{thb0(r.sale)}</span>
                    <span className="max-md:hidden text-right text-xs tabular-nums text-gray-400">{pct(r.cost).toFixed(1)}%</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── ข้อมูลใบ ── */}
        <div className={card}>
          <div className="flex items-center border-b border-gray-100 px-4 py-3">
            <h3 className="text-sm font-bold text-gray-900">ข้อมูลใบ</h3>
            {h.project_id != null && <Link href={`/b2b/projects/${h.project_id}`} className="ml-auto text-xs font-semibold text-primary hover:underline">ชื่อ · ลูกค้า · ที่ตั้ง แก้ในหน้าโครงการ</Link>}
          </div>
          <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 px-4 py-3 text-sm">
            <dt className="text-gray-500">ตัวเลือก</dt><dd className="font-medium text-gray-900">{h.option_label || "—"}</dd>
            <dt className="text-gray-500">โครงการ</dt>
            <dd className="text-gray-800">{h.project_id != null ? <Link href={`/b2b/projects/${h.project_id}`} className="text-primary hover:underline">{h.project_code} · {h.project_name}</Link> : h.project_name}</dd>
            <dt className="text-gray-500">ลูกค้า</dt><dd className="text-gray-800">{h.customer_name || "—"}</dd>
            <dt className="text-gray-500">ที่ตั้ง</dt>
            <dd className="text-gray-800">
              {h.location || "—"}
              {h.latitude != null && h.longitude != null && (
                <> · <a href={`https://www.google.com/maps?q=${h.latitude},${h.longitude}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">แผนที่</a></>
              )}
            </dd>
            <dt className="text-gray-500">Revision</dt>
            <dd className="flex flex-wrap gap-1.5">
              {revisions.map((r) => (
                <button key={r.id} type="button" onClick={() => r.id !== h.id && onRev(r.id)} style={{ minHeight: 0 }}
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.id === h.id ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  Rev {r.revision}{r.is_latest ? " ล่าสุด" : ""}
                </button>
              ))}
            </dd>
            <dt className="text-gray-500">ใบเสนอราคา</dt><dd className="text-gray-800">{h.locked_by_quote ? `${h.locked_by_quote} (ส่งอนุมัติแล้ว)` : "ยังไม่มีใบที่ส่งอนุมัติ"}</dd>
            <dt className="text-gray-500">O&amp;M</dt><dd className="text-gray-800">{om ? omSummary(om) : "ยังไม่ใช้ช่องตั้งค่า"}</dd>
            <dt className="text-gray-500">บันทึกล่าสุด</dt>
            <dd className="text-gray-800">{formatThaiDate(h.updated_at, { time: true })}{h.updated_by_name ? ` · ${h.updated_by_name}` : ""}<span className="text-gray-400"> · สร้าง {formatThaiDate(h.created_at)}</span></dd>
          </dl>
        </div>
      </div>

      {/* ── ตารางสรุปแบบไฟล์ Excel (เดิม) ── */}
      <div className={`${card} overflow-hidden`}>
        <button type="button" onClick={() => setTableOpen((v) => !v)} style={{ minHeight: 0 }} aria-expanded={tableOpen}
          className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
          <ChevronRightIcon className={`h-4 w-4 text-gray-400 transition-transform ${tableOpen ? "rotate-90" : ""}`} strokeWidth={2.5} />
          <h3 className="text-sm font-bold text-gray-900">ตารางสรุปแบบไฟล์ Excel</h3>
          <span className="text-xs text-gray-400">ทุกหมวด · บาท/Wp · ค่าวัสดุ / ค่าแรง / VAT / รวมสุทธิ</span>
        </button>
        {tableOpen && (
          <div className="border-t border-gray-100">
            <BoqSummary categories={categories} calc={calc} addonIds={addonIds} addonModes={addonModes} readOnly={readOnly} vatPct={h.vat_pct}
              onMode={onMode} onJump={onGo} />
          </div>
        )}
      </div>
    </div>
  );
}
