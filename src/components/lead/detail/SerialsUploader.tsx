"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { compressSlipFile } from "@/lib/utils/compress-slip";
import { useDialog } from "@/components/ui/Dialog";
import {
  INVERTER_BRANDS, INVERTER_KW_SIZES,
  BATTERY_BRANDS, BATTERY_KWH_SIZES,
  PANEL_BRANDS,
} from "@/lib/constants/survey-options";

// Tab body for the "Serials" tab on the lead detail page.
//
// Layout: three tree-text groups (Inverter / Battery / Solar Panel), each
// listing the serials already captured for that type, with a single [+ เพิ่ม]
// button that opens an AddDeviceModal. The modal accepts a typed serial OR
// an OCR-scanned photo. Save → PUT /api/leads/<id>/devices (replace-all per
// type), reload to reflect canonical ids/timestamps.

type DeviceType = "inverters" | "batteries" | "panels";

// Reuses the survey-options catalogue so adding/removing a brand is one edit
// in src/lib/constants/survey-options.ts, not three.
const BRAND_SUGGESTIONS: Record<DeviceType, readonly string[]> = {
  inverters: INVERTER_BRANDS,
  batteries: BATTERY_BRANDS,
  panels:    PANEL_BRANDS,
};
// Spec quick-pick sizes for the kw/kwh dropdown on step 2. Panels have no
// spec column so they don't appear here.
const SPEC_SUGGESTIONS: Partial<Record<DeviceType, readonly number[]>> = {
  inverters: INVERTER_KW_SIZES,
  batteries: BATTERY_KWH_SIZES,
};

interface BaseDevice {
  brand: string | null;
  serial_no: string | null;
}
interface Inverter extends BaseDevice { kw: number | null; }
interface Battery  extends BaseDevice { kwh: number | null; }
type    Panel    = BaseDevice;

interface Props {
  leadId: number;
  /** When true, hide × buttons + disable "+ เพิ่ม" — used after the warranty
   * has been issued so the captured serials get locked into the cert. */
  locked?: boolean;
}

export default function SerialsUploader({ leadId, locked = false }: Props) {
  const dialog = useDialog();
  const [inverters, setInverters] = useState<Inverter[]>([]);
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [panels,    setPanels]    = useState<Panel[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [openModal, setOpenModal] = useState<DeviceType | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/api/leads/${leadId}/devices`) as {
        inverters: Inverter[]; batteries: Battery[]; panels: Panel[];
      };
      setInverters(d.inverters ?? []);
      setBatteries(d.batteries ?? []);
      setPanels(d.panels ?? []);
    } catch (e) { console.error("load devices failed:", e); }
    finally { setLoading(false); }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const saveType = async (type: DeviceType, items: BaseDevice[]) => {
    try {
      const res = await apiFetch(`/api/leads/${leadId}/devices`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, items }),
      }) as { items: BaseDevice[] };
      if (type === "inverters") setInverters(res.items as Inverter[]);
      if (type === "batteries") setBatteries(res.items as Battery[]);
      if (type === "panels")    setPanels(res.items as Panel[]);
    } catch (e) { console.error("save devices failed:", e); }
  };

  // Batch-friendly add. Modal always passes an array (length 1 for the single
  // case, N for a multi-SN scan). One PUT per call regardless of count so we
  // don't race the state setter — looping per-item with `inverters` from the
  // closure caused every call to overwrite the previous on the server.
  const onAdd = async (type: DeviceType, items: BaseDevice[]): Promise<{ added: number; dupes: number; reason?: string }> => {
    const list: BaseDevice[] =
      type === "inverters" ? inverters :
      type === "batteries" ? batteries :
                              panels;
    const existing = new Set(list.map(d => d.serial_no?.toLowerCase()).filter((x): x is string => !!x));
    const seenInBatch = new Set<string>();
    const fresh: BaseDevice[] = [];
    let dupes = 0;
    for (const it of items) {
      const key = it.serial_no?.toLowerCase() || "";
      if (key && (existing.has(key) || seenInBatch.has(key))) { dupes++; continue; }
      if (key) seenInBatch.add(key);
      fresh.push(it);
    }
    if (fresh.length === 0) {
      // Stay open so user can see what's wrong and re-scan / type a new SN.
      return { added: 0, dupes, reason: `Serial ${dupes > 1 ? "ทั้ง " + dupes + " ตัว" : ""}มีอยู่แล้ว` };
    }
    await saveType(type, [...list, ...fresh]);
    // Always close on a successful insert — even with partial dupes the
    // success count IS persisted; leaving the dialog open made it feel like
    // nothing happened. Partial-dupe count is reported to the parent (the
    // tree will still show the bumped count).
    setOpenModal(null);
    return { added: fresh.length, dupes };
  };
  const onRemove = async (type: DeviceType, idx: number) => {
    const cur: BaseDevice[] =
      type === "inverters" ? inverters :
      type === "batteries" ? batteries :
                              panels;
    const target = cur[idx];
    // Confirm before deleting — accidental click on the × icon during a long
    // panel-SN list shouldn't silently drop a row that took OCR to capture.
    const ok = await dialog.confirm({
      title: "ลบรายการนี้?",
      message: target?.serial_no ? `Serial: ${target.serial_no}` : "ลบ row นี้ออกจากรายการ",
      variant: "danger",
      confirmText: "ลบ",
      cancelText: "ยกเลิก",
    });
    if (!ok) return;
    await saveType(type, cur.filter((_, i) => i !== idx));
  };

  if (loading) return (
    <div className="p-6 text-center">
      <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 space-y-5">
      {locked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          <span>ออกใบรับประกันแล้ว — รายการ Serial ถูก lock ห้ามแก้ไข</span>
        </div>
      )}
      {/* Stack on mobile (one column reads like a long form), spread to three
          equal columns on desktop where the page has the width to spare — the
          panel list especially can run 20+ rows so vertical real estate adds up. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 items-start">
        <TreeGroup
          type="inverters"
          title="Inverter"
          emoji="⚡"
          items={inverters}
          formatLine={(d) => {
            const i = d as Inverter;
            return [i.brand, i.kw != null ? `${i.kw} kW` : null, i.serial_no].filter(Boolean).join(" · ") || "—";
          }}
          onAddClick={() => setOpenModal("inverters")}
          onRemove={onRemove}
          locked={locked}
        />
        <TreeGroup
          type="panels"
          title="Solar Panel"
          emoji="☀️"
          items={panels}
          formatLine={(d) => [d.brand, d.serial_no].filter(Boolean).join(" · ") || "—"}
          onAddClick={() => setOpenModal("panels")}
          onRemove={onRemove}
          locked={locked}
        />
        <TreeGroup
          type="batteries"
          title="Battery"
          emoji="🔋"
          items={batteries}
          formatLine={(d) => {
            const b = d as Battery;
            return [b.brand, b.kwh != null ? `${b.kwh} kWh` : null, b.serial_no].filter(Boolean).join(" · ") || "—";
          }}
          onAddClick={() => setOpenModal("batteries")}
          onRemove={onRemove}
          locked={locked}
        />
      </div>

      {openModal && (
        <AddDeviceModal
          type={openModal}
          onCancel={() => setOpenModal(null)}
          onSave={(items) => onAdd(openModal, items)}
        />
      )}
    </div>
  );
}

interface TreeGroupProps {
  type: DeviceType;
  title: string;
  emoji: string;
  items: BaseDevice[];
  formatLine: (d: BaseDevice) => string;
  onAddClick: () => void;
  onRemove: (type: DeviceType, idx: number) => void;
  locked?: boolean;
}
function TreeGroup({ type, title, emoji, items, formatLine, onAddClick, onRemove, locked }: TreeGroupProps) {
  return (
    <section>
      <header className="flex items-center gap-2 mb-1">
        <span className="text-base">{emoji}</span>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400 font-mono tabular-nums">{items.length}</span>
      </header>
      {/* Tree-text indented under a soft left rail to mimic the timeline tab. */}
      <div className="pl-3 border-l border-gray-200 ml-2 space-y-1">
        {items.length === 0 && (
          <div className="text-xs text-gray-400 italic py-1">— ยังไม่มีรายการ —</div>
        )}
        {items.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-gray-300 select-none">{i === items.length - 1 ? "└" : "├"}</span>
            <span className="font-mono tabular-nums text-gray-400 shrink-0 w-7 text-right">{i + 1}.</span>
            <span className="font-mono tabular-nums text-gray-700 break-all">{formatLine(d)}</span>
            {/* × button hidden when locked (warranty issued) — captured SNs
                are now part of the cert, mutating them would invalidate it. */}
            {!locked && (
              <button
                type="button"
                onClick={() => onRemove(type, i)}
                className="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50"
                aria-label="ลบ"
                title="ลบ"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        {!locked && <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark mt-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          เพิ่ม {title}
        </button>}
      </div>
    </section>
  );
}

interface ModalProps {
  type: DeviceType;
  onCancel: () => void;
  onSave: (items: Array<BaseDevice & { kw?: number | null; kwh?: number | null }>) => Promise<{ added: number; dupes: number; reason?: string }>;
}
// 3-step wizard: pick brand → fill specs (skipped for panels) → capture serial.
// "Step" here is a logical index, not a route — all rendered in the same modal
// shell so back/next feels instant and state is preserved between transitions.
function AddDeviceModal({ type, onCancel, onSave }: ModalProps) {
  const numLabel = type === "inverters" ? "kW" : type === "batteries" ? "kWh" : null;
  // One decision per step so each screen is a single tap when the value is in
  // the catalogue (auto-advance below). Panels skip the spec step.
  //   brand   — pick a brand chip
  //   spec    — pick kW / kWh (inverter & battery only)
  //   serial  — type SN or snap a photo
  //   confirm — review + บันทึก
  const steps: ("brand" | "spec" | "serial" | "confirm")[] = numLabel
    ? ["brand", "spec", "serial", "confirm"]
    : ["brand", "serial", "confirm"];
  const [stepIdx, setStepIdx] = useState(0);
  const step = steps[stepIdx];

  const [brand, setBrand] = useState("");
  const [num, setNum] = useState<string>("");
  const [serial, setSerial] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Photo upload result. `serials` may be 0 / 1 / N — multi-SN photos (panel
  // sheets, battery racks) drop into a batch-confirm UI; single-SN drop into
  // the textbox directly.
  const [ocrPreview, setOcrPreview] = useState<{ brand: string | null; num: number | null; serials: string[] } | null>(null);
  // For multi-SN batch, track which rows the user wants to keep. All start
  // checked; user can untick rows that look wrong before committing.
  const [batchPicks, setBatchPicks] = useState<boolean[]>([]);

  const next = () => {
    setError(null);
    setStepIdx(i => Math.min(i + 1, steps.length - 1));
  };
  const back = () => {
    setError(null);
    setStepIdx(i => Math.max(i - 1, 0));
  };

  // Pick the OCR endpoint that matches the device type:
  //   inverters → /api/ocr-serial          (single SN + brand + kw)
  //   batteries → /api/ocr-battery-serials (N SNs from one or many photos)
  //   panels    → /api/ocr-panel-serials   (N SNs, dedup'd)
  // The batch endpoints don't extract brand/spec; user picks those on steps
  // 1/2, then all the SNs from the photo share that brand+spec.
  const runOcr = async (file: File): Promise<{ brand: string | null; num: number | null; serials: string[] } | null> => {
    const compressed = await compressSlipFile(file);
    const fd = new FormData();
    fd.append("file", compressed);
    const up = await apiFetch("/api/upload", { method: "POST", body: fd }) as { url: string };
    let serials: string[] = [];
    let brand: string | null = null;
    let num: number | null = null;
    try {
      if (type === "inverters") {
        const ocr = await apiFetch("/api/ocr-serial", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: up.url }),
        }) as { serial: string | null; brand: string | null; kw: number | null };
        if (ocr.serial) serials = [ocr.serial.trim()];
        brand = ocr.brand;
        num = ocr.kw;
      } else {
        const endpoint = type === "batteries" ? "/api/ocr-battery-serials" : "/api/ocr-panel-serials";
        const ocr = await apiFetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: [up.url] }),
        }) as { serials: string[] };
        serials = (ocr.serials || []).map(s => s.trim()).filter(Boolean);
      }
    } finally {
      // Always drop the temp upload — text is what we persist, not the photo.
      fetch(`/api/upload?file=${encodeURIComponent(up.url)}`, {
        method: "DELETE", headers: { ...getUserIdHeader() },
      }).catch(() => {});
    }
    if (serials.length === 0 && !brand && num == null) return null;
    return { brand, num, serials };
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcrBusy(true);
    setError(null);
    setOcrPreview(null);
    setBatchPicks([]);
    try {
      const result = await runOcr(file);
      if (!result) { setError("อ่านข้อมูลไม่ออก ลองถ่ายใหม่ใกล้ๆ ฉลาก"); return; }
      // brand / spec auto-fill (single-photo OCR also reads them on inverter).
      if (result.brand)  setBrand(result.brand);
      if (result.num != null) setNum(String(result.num));
      // 1 SN → fill the textbox like before.
      // N SNs → leave textbox alone; the batch UI takes over.
      if (result.serials.length === 1) setSerial(result.serials[0]);
      else if (result.serials.length > 1) setBatchPicks(result.serials.map(() => true));
      setOcrPreview(result);
      if (result.serials.length === 0 && step === "serial") {
        setError("อ่าน Serial ไม่ออก ลองถ่ายใหม่ใกล้ๆ ตัวเลข");
      }
    } catch (e) {
      console.error("OCR failed:", e);
      setError("เกิดข้อผิดพลาด ลองอีกครั้ง");
    } finally {
      setOcrBusy(false);
    }
  };

  // Multi-SN commit — one PUT for the whole picked set; parent does the
  // dedupe + state update. Loops here would race the state setter and let
  // each PUT overwrite the previous (the API replaces the full per-type list).
  const submitBatch = async () => {
    if (!ocrPreview) return;
    const picks = ocrPreview.serials.filter((_, i) => batchPicks[i]);
    if (picks.length === 0) { setError("ยังไม่ได้เลือก serial"); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave(picks.map(buildPayload));
      if (result.added === 0) setError(result.reason || `Serial ทั้งหมดมีอยู่แล้ว (${result.dupes} ซ้ำ)`);
      else if (result.dupes > 0) setError(`เพิ่ม ${result.added} รายการ · ข้ามที่ซ้ำ ${result.dupes} รายการ`);
    } finally {
      setSaving(false);
    }
  };

  // Build one payload from current form state — used by both single and batch
  // commit paths (batch maps over SNs and stamps each with the same payload).
  const buildPayload = (sn: string): BaseDevice & { kw?: number | null; kwh?: number | null } => {
    const numVal = num.trim() ? parseFloat(num) : null;
    const p: BaseDevice & { kw?: number | null; kwh?: number | null } = {
      brand: brand.trim() || null,
      serial_no: sn.trim(),
    };
    if (type === "inverters") p.kw = Number.isFinite(numVal as number) ? numVal : null;
    if (type === "batteries") p.kwh = Number.isFinite(numVal as number) ? numVal : null;
    return p;
  };

  const submit = async () => {
    if (!serial.trim()) { setError("ใส่ Serial หรือถ่ายรูปก่อน"); return; }
    setSaving(true);
    setError(null);
    try {
      const result = await onSave([buildPayload(serial)]);
      if (result.added === 0) setError(result.reason || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const title = type === "inverters" ? "Inverter" : type === "batteries" ? "Battery" : "Solar Panel";
  const fileInputId = `serial-photo-${type}`;

  // Step gate. brand required; spec optional; SN required before review.
  const canNext = step === "brand"
    ? brand.trim().length > 0
    : step === "spec"
    ? true
    : step === "serial"
    ? serial.trim().length > 0
    : false;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      {/* Sizing: comfortably wide on tablet/desktop but full-width on phone;
          minimums keep the dialog from "popping" between steps as content
          changes; maximums + flex column let the body scroll instead of
          pushing the footer off-screen on long content. */}
      <div className="relative w-full min-w-[320px] max-w-2xl min-h-[480px] max-h-[90vh] bg-white rounded-xl shadow-xl overflow-hidden flex flex-col">
        <header className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
          <h3 className="text-sm font-bold text-gray-900 truncate">เพิ่ม {title} Serial</h3>
          {/* Step pills — visual progress indicator */}
          <div className="flex items-center gap-1 ml-auto">
            {steps.map((_, i) => (
              <span key={i}
                className={`w-2 h-2 rounded-full transition-colors ${i === stepIdx ? "bg-primary" : i < stepIdx ? "bg-primary/40" : "bg-gray-200"}`} />
            ))}
            <span className="ml-2 text-[11px] font-mono text-gray-400 tabular-nums">{stepIdx + 1}/{steps.length}</span>
          </div>
          <button type="button" onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none" aria-label="ปิด">×</button>
        </header>

        <div className="p-5 space-y-3 min-h-[260px] flex-1 overflow-y-auto">
          {/* STEP — brand. Big chip grid; tap-to-advance for the common case.
              "พิมพ์เอง" input is always visible — modal is tall enough to
              afford the real estate, and surfacing it lifts the cognitive
              load of remembering to expand a collapse. */}
          {step === "brand" && (
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-800">เลือก Brand</h4>
              <div className="grid grid-cols-2 gap-2">
                {BRAND_SUGGESTIONS[type].map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => { setBrand(b); next(); }}
                    className={`h-16 px-4 rounded-xl border-2 text-base font-bold transition-colors ${
                      brand === b
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-gray-800 border-gray-200 hover:border-primary/50 hover:bg-primary/5"}`}>
                    {b}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">หรือพิมพ์ brand อื่น</label>
                <input
                  type="text"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="พิมพ์ brand"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* STEP — spec (kw / kwh). Same chip-grid pattern, optional. */}
          {step === "spec" && numLabel && (
            <div className="space-y-4">
              <h4 className="text-base font-bold text-gray-800">เลือกขนาด ({numLabel})</h4>
              <div className="grid grid-cols-2 gap-2">
                {(SPEC_SUGGESTIONS[type] ?? []).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => { setNum(String(v)); next(); }}
                    className={`h-16 px-4 rounded-xl border-2 text-base font-bold transition-colors font-mono tabular-nums ${
                      num === String(v)
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-gray-800 border-gray-200 hover:border-primary/50 hover:bg-primary/5"}`}>
                    {v} {numLabel}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">หรือพิมพ์ขนาดอื่น</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={num}
                  onChange={e => setNum(e.target.value)}
                  placeholder={numLabel}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
              <button type="button" onClick={next}
                className="w-full h-10 rounded-lg text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300">
                ข้าม (ไม่ระบุขนาด)
              </button>
            </div>
          )}

          {/* STEP 2 — Serial: type it OR scan the label. */}
          {step === "serial" && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1">
                  Serial Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={serial}
                  onChange={e => setSerial(e.target.value)}
                  placeholder="พิมพ์เลข SN หรือถ่ายรูปด้านล่าง"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">หรือ</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <input id={fileInputId} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={pickPhoto} disabled={ocrBusy} />
              <label htmlFor={fileInputId}
                className={`w-full h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                  ocrBusy
                    ? "bg-gray-100 text-gray-400 cursor-wait"
                    : "bg-white border border-primary text-primary hover:bg-primary/5"}`}>
                {ocrBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    กำลังอ่าน Serial...
                  </>
                ) : (
                  <>📷 ถ่ายรูป + อ่าน SN</>
                )}
              </label>
              {/* Recap card. Single-SN: same shape as the legacy preview.
                  Multi-SN: tickable list — user can drop bad reads before
                  the batch commit, all picks share the brand/spec above. */}
              {ocrPreview && ocrPreview.serials.length <= 1 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">อ่านได้จากรูป</div>
                  <PreviewRow label="Brand" value={ocrPreview.brand} />
                  {numLabel && <PreviewRow label={numLabel} value={ocrPreview.num != null ? String(ocrPreview.num) : null} />}
                  <PreviewRow label="Serial" value={ocrPreview.serials[0] ?? null} mono />
                </div>
              )}
              {ocrPreview && ocrPreview.serials.length > 1 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-end">
                    <button type="button"
                      onClick={() => setBatchPicks(ocrPreview.serials.map(() => batchPicks.every(Boolean) ? false : true))}
                      className="text-xs text-emerald-700 hover:text-emerald-900 underline">
                      {batchPicks.every(Boolean) ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1">
                    {ocrPreview.serials.map((sn, i) => (
                      <label key={i} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-emerald-100/40 cursor-pointer">
                        <input type="checkbox" checked={!!batchPicks[i]}
                          onChange={e => setBatchPicks(prev => prev.map((v, idx) => idx === i ? e.target.checked : v))}
                          className="w-4 h-4 accent-emerald-600" />
                        {/* Row number prefix — matches the tree view in the
                            main Serials list, makes ticking the 17th-of-20 row
                            unambiguous. */}
                        <span className="text-sm font-mono tabular-nums text-gray-400 shrink-0 w-7 text-right">{i + 1}.</span>
                        <span className="text-sm font-mono tabular-nums text-gray-800 break-all">{sn}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">จะถูกเพิ่มทีละแถวพร้อม Brand · {numLabel || "—"} ที่เลือกไว้</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3 — confirmation page; nothing to edit, just save. */}
          {step === "confirm" && (
            <div className="space-y-3">
              <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                ตรวจสอบข้อมูลก่อนบันทึก
              </div>
              <div className="rounded-lg border border-gray-200 p-4 space-y-2 bg-gray-50">
                <PreviewRow label="Brand" value={brand.trim() || null} />
                {numLabel && <PreviewRow label={numLabel} value={num.trim() ? num.trim() : null} />}
                <PreviewRow label="Serial" value={serial.trim() || null} mono />
              </div>
              <p className="text-xs text-gray-500">กดย้อนกลับเพื่อแก้ไข หรือกด "บันทึก" เพื่อเพิ่มในรายการ</p>
            </div>
          )}

          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>

        <footer className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
          {stepIdx > 0 ? (
            <button type="button" onClick={back} disabled={saving || ocrBusy}
              className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
              ← ย้อนกลับ
            </button>
          ) : (
            <button type="button" onClick={onCancel}
              className="h-10 px-4 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">
              ยกเลิก
            </button>
          )}
          {(() => {
            // Multi-SN batch detected on the serial step → short-circuit straight
            // to a "บันทึก N รายการ" commit so user doesn't have to step through
            // a confirm screen they can't really edit anyway.
            const isBatch = step === "serial" && ocrPreview && ocrPreview.serials.length > 1;
            if (isBatch) {
              const pickedN = batchPicks.filter(Boolean).length;
              return (
                <button type="button" onClick={submitBatch} disabled={saving || ocrBusy || pickedN === 0}
                  className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? "กำลังบันทึก..." : `บันทึก ${pickedN} รายการ`}
                </button>
              );
            }
            if (step === "confirm") {
              return (
                <button type="button" onClick={submit} disabled={saving || ocrBusy}
                  className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              );
            }
            return (
              <button type="button" onClick={next} disabled={!canNext}
                className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
                ถัดไป →
              </button>
            );
          })()}
        </footer>
      </div>
    </div>
  );
}

// Row in the OCR confirmation list. Greyed when value is missing so the user
// can see which fields they'll need to fill in by hand on the next step.
function PreviewRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-14 shrink-0 text-gray-500">{label}</span>
      <span className={`flex-1 ${value ? "text-gray-900 font-semibold" : "text-gray-400 italic"} ${mono ? "font-mono tabular-nums break-all" : ""}`}>
        {value || "— ไม่เจอ —"}
      </span>
    </div>
  );
}
