"use client";

import type { ReactNode } from "react";
import { formatTHB } from "@/lib/utils/formatters";
import type { AddonMode, CalcResult } from "@/lib/b2b/boq-calc";
import type { B2bCategory } from "@/lib/b2b/materials";

/** บาทเต็มจำนวน — formatTHB ค่าเริ่มต้นไม่ปัดเศษ (แสดงทศนิยมได้ถึง 3 ตำแหน่ง) */
const thb0 = (n: number) => formatTHB(Math.round(n));

// แท็บ "ตั้งค่าใบ" ของหน้าทำ BOQ (แผน 20261016-04 แบบ A+B) — ชื่อตัวเลือก · Margin · VAT · ส่วนเพิ่มเติม รวม/ทางเลือก · ช่องตั้งค่า O&M
// ใบในโครงการ: ชื่อ/ลูกค้า/ที่ตั้ง/พิกัดมาจากโครงการ (แก้ในหน้าโครงการ) · ใบเก่าที่ไม่ผูกโครงการยังแก้ช่องเหล่านี้ได้ที่นี่

export type SettingsDraft = {
  option_label: string; project_name: string; customer_name: string; location: string; latitude: string; longitude: string; margin_pct: string;
};

export default function BoqSettings({ draft, onDraft, readOnly, linked, vatPct, calc, addons, addonModes, addonChoices, onMode, onAddAddon, onRemoveAddon, omPanel }: {
  draft: SettingsDraft;
  onDraft: (patch: Partial<SettingsDraft>) => void;
  readOnly: boolean;
  linked: boolean;
  vatPct: number;
  calc: CalcResult;
  /** หมวดเสริมที่อยู่ในใบ */
  addons: B2bCategory[];
  addonModes: Record<number, AddonMode>;
  addonChoices: B2bCategory[];
  onMode: (categoryId: number, mode: AddonMode) => void;
  onAddAddon: (c: B2bCategory) => void;
  /** เอาหมวดเสริมที่ยังไม่มีรายการออก */
  onRemoveAddon: (categoryId: number) => void;
  omPanel: ReactNode;
}) {
  const card = "rounded-xl border border-gray-200 bg-white";
  const head = "flex items-center gap-2 border-b border-gray-100 px-4 py-3";
  const field = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600";
  const label = "block text-xs font-semibold text-gray-500 mb-1";
  const seg = (on: boolean) => `px-3 py-1 text-xs font-semibold ${on ? "bg-gray-900 text-white" : "bg-white text-gray-500 hover:bg-gray-50"} disabled:cursor-not-allowed`;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className={card}>
        <div className={head}><h3 className="text-sm font-bold text-gray-900">ตัวเลือก &amp; กำไร</h3></div>
        <fieldset disabled={readOnly} className="grid gap-3 px-4 py-3 md:grid-cols-2">
          <div className="md:col-span-2"><label className={label}>ชื่อตัวเลือก (ขนาด / รุ่นแผง)</label>
            <input className={field} value={draft.option_label} onChange={(e) => onDraft({ option_label: e.target.value })} placeholder="เช่น 998.64 kWp · Jinko 730" /></div>
          <div><label className={label}>Margin (% ของราคาขาย)</label>
            <input type="number" step="0.01" min={0} max={99} className={`${field} text-right tabular-nums`} value={draft.margin_pct} onChange={(e) => onDraft({ margin_pct: e.target.value })} /></div>
          <div><label className={label}>VAT</label><div className={`${field} flex items-center bg-gray-50 text-gray-500`}>{vatPct}%</div></div>
          {!linked && (
            <>
              <div className="md:col-span-2"><label className={label}>Project <span className="text-red-500">*</span></label>
                <input className={field} value={draft.project_name} onChange={(e) => onDraft({ project_name: e.target.value })} /></div>
              <div><label className={label}>Customer</label>
                <input className={field} value={draft.customer_name} onChange={(e) => onDraft({ customer_name: e.target.value })} /></div>
              <div><label className={label}>Location</label>
                <input className={field} value={draft.location} onChange={(e) => onDraft({ location: e.target.value })} /></div>
              <div><label className={label}>Latitude</label>
                <input className={field} value={draft.latitude} onChange={(e) => onDraft({ latitude: e.target.value })} placeholder="13.xxxxxx" /></div>
              <div><label className={label}>Longitude</label>
                <input className={field} value={draft.longitude} onChange={(e) => onDraft({ longitude: e.target.value })} placeholder="100.xxxxxx" /></div>
            </>
          )}
        </fieldset>
        {linked && <p className="px-4 pb-3 text-xs text-gray-400">ชื่อโครงการ · ลูกค้า · ที่ตั้ง · พิกัด มาจากโครงการ — แก้ในหน้าโครงการ</p>}
      </div>

      <div className={card}>
        <div className={head}>
          <h3 className="text-sm font-bold text-gray-900">ส่วนเพิ่มเติม (Optional Add-on)</h3>
          <span className="text-xs text-gray-400">ใส่ราคาเองได้ · เลือกรวมในราคาหรือเสนอเป็นทางเลือก</span>
        </div>
        {addons.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">ยังไม่มีส่วนเพิ่มเติมในใบนี้</p>}
        {addons.map((c) => {
          const r = calc.categories[c.id];
          const mode = addonModes[c.id] ?? "included";
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-100 px-4 py-2.5 last:border-b-0">
              <span className="min-w-0 flex-1 text-sm text-gray-800"><b className="font-bold">{c.id}.</b> {c.name}</span>
              <span className="inline-flex overflow-hidden rounded-lg border border-gray-200">
                <button type="button" disabled={readOnly} onClick={() => onMode(c.id, "included")} style={{ minHeight: 0 }} className={seg(mode === "included")}>รวมในราคา</button>
                <button type="button" disabled={readOnly} onClick={() => onMode(c.id, "optional")} style={{ minHeight: 0 }} className={seg(mode === "optional")}>ทางเลือก</button>
              </span>
              <span className="w-28 text-right text-sm tabular-nums text-gray-600">{r?.lines ? thb0(r.sale) : "ยังไม่มีรายการ"}</span>
              {!readOnly && !r?.lines && (
                <button type="button" onClick={() => onRemoveAddon(c.id)} style={{ minHeight: 0 }} className="text-xs text-gray-400 hover:text-red-600">เอาออก</button>
              )}
            </div>
          );
        })}
        {!readOnly && addonChoices.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-gray-100 px-4 py-3">
            {addonChoices.map((c) => (
              <button key={c.id} type="button" onClick={() => onAddAddon(c)} style={{ minHeight: 0 }} title={c.name}
                className="max-w-full truncate rounded-full border border-dashed border-amber-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-50">+ {c.id}. {c.name}</button>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} overflow-hidden lg:col-span-2`}>
        <div className={head}>
          <h3 className="text-sm font-bold text-gray-900">ช่องตั้งค่า O&amp;M (หมวด 13)</h3>
          <span className="text-xs text-gray-400">จำนวนบรรทัดสูตรในหมวด 13 คิดจากช่องเหล่านี้</span>
        </div>
        {omPanel}
      </div>
    </div>
  );
}
