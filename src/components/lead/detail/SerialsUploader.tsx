"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
type MatchStatus = "matched" | "partial" | "unmatched" | "unreadable";
interface EvidencePhoto {
  url: string;
  brand: string | null;
  spec: number | null;
  detected_serials: string[];
  matched_serials: string[];
  boxes: Array<number[] | null>;
  match_status: MatchStatus;
  uploaded_at: string;
  uploaded_by: number;
}
type EvidencePhotos = Record<DeviceType, EvidencePhoto[]>;
const EMPTY_EVIDENCE: EvidencePhotos = { inverters: [], batteries: [], panels: [] };

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
  // Per-row capture photo — the OCR snapshot URL is stamped here so the tree
  // can render a thumbnail per device. Multi-SN photos (panel sheets, battery
  // racks) share the same URL across every serial they yielded.
  photo_url?: string | null;
  // Bounding box of THIS serial's sticker on photo_url, JSON-encoded
  // "[ymin,xmin,ymax,xmax]" with 0-1000 normalized coords (Gemini format).
  // Panels only for now — lets the UI draw a red rectangle pointing at the
  // exact sticker on the panel sheet photo.
  photo_box?: string | null;
}
interface Inverter extends BaseDevice { kw: number | null; }
interface Battery  extends BaseDevice { kwh: number | null; }
type    Panel    = BaseDevice;

interface Props {
  leadId: number;
  /** When true, hide × buttons + disable "+ เพิ่ม" — used after the warranty
   * has been issued so the captured serials get locked into the cert. */
  locked?: boolean;
  /** Filter which device groups to render. Default: all three. Used by
   * WarrantyStep subStep 2/3 to show only Battery or only Panel. */
  showTypes?: DeviceType[];
  /** When true, replace the "+ เพิ่ม" link with an inline quick-key row
   * (text input + add button + AI wizard button). Used in WarrantyStep so
   * users can type a Serial directly without going through the full wizard
   * — brand defaults to the last item's brand. */
  quickKey?: boolean;
  /** When set, the matching device group renders this many slot rows. Items
   * fill the first N rows; remaining rows are empty inputs ready for a
   * Serial. Used in WarrantyStep to show 20 panel / 5 battery slots so the
   * field tech can see how many more SNs are expected. */
  slotCounts?: Partial<Record<DeviceType, number>>;
  /** Desktop column count for the slot grid (column-major flow). Used for
   * panels which have 20 slots — splitting into 2 columns keeps the list
   * scrollable in a sane height. Mobile always stays 1 column. */
  slotColumns?: Partial<Record<DeviceType, number>>;
}

// Sort by serial_no (alphanumeric, case-insensitive). Items missing a serial
// fall to the end. Stable sort so re-arrangement on re-render is consistent.
function sortBySerial<T extends BaseDevice>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const sa = (a.serial_no || "").toLowerCase();
    const sb = (b.serial_no || "").toLowerCase();
    if (!sa && !sb) return 0;
    if (!sa) return 1;
    if (!sb) return -1;
    return sa.localeCompare(sb, undefined, { numeric: true });
  });
}

export default function SerialsUploader({ leadId, locked = false, showTypes, quickKey = false, slotCounts, slotColumns }: Props) {
  const dialog = useDialog();
  const [inverters, setInverters] = useState<Inverter[]>([]);
  const [batteries, setBatteries] = useState<Battery[]>([]);
  const [panels,    setPanels]    = useState<Panel[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [openModal, setOpenModal] = useState<DeviceType | null>(null);
  const [evidenceModal, setEvidenceModal] = useState<DeviceType | null>(null);
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhotos>(EMPTY_EVIDENCE);
  const [evidenceError, setEvidenceError] = useState<Partial<Record<DeviceType, string>>>({});

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/api/leads/${leadId}/devices`) as {
        inverters: Inverter[]; batteries: Battery[]; panels: Panel[];
        evidencePhotos?: EvidencePhotos;
      };
      setInverters(sortBySerial(d.inverters ?? []));
      setBatteries(sortBySerial(d.batteries ?? []));
      setPanels(sortBySerial(d.panels ?? []));
      setEvidencePhotos(d.evidencePhotos ?? EMPTY_EVIDENCE);
    } catch (e) { console.error("load devices failed:", e); }
    finally { setLoading(false); }
  }, [leadId]);
  useEffect(() => { load(); }, [load]);

  const saveEvidence = async (type: DeviceType, items: BaseDevice[]): Promise<{ added: number; dupes: number; reason?: string }> => {
    setEvidenceError(prev => ({ ...prev, [type]: undefined }));
    try {
      const first = items[0];
      const photoUrl = first?.photo_url;
      if (!photoUrl) return { added: 0, dupes: 0, reason: "กรุณาถ่ายรูปหลักฐานก่อนบันทึก" };
      const spec = type === "inverters"
        ? (first as Inverter).kw
        : type === "batteries"
        ? (first as Battery).kwh
        : null;
      const saved = await apiFetch(`/api/leads/${leadId}/devices`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          photo_url: photoUrl,
          brand: first.brand,
          spec,
          serials: items.map(item => item.serial_no).filter(Boolean),
          boxes: items.map(item => parseBox(item.photo_box)),
        }),
      }) as { evidencePhotos: EvidencePhotos };
      setEvidencePhotos(saved.evidencePhotos ?? EMPTY_EVIDENCE);
      setEvidenceModal(null);
      return { added: 1, dupes: 0 };
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : "อัปโหลดรูปไม่สำเร็จ";
      const message = rawMessage.includes("409") ? "พบ Serial ซ้ำ ไม่สามารถบันทึกได้" : rawMessage;
      setEvidenceError(prev => ({ ...prev, [type]: message }));
      return { added: 0, dupes: 0, reason: message };
    }
  };

  const deleteEvidence = async (type: DeviceType, photo: EvidencePhoto) => {
    const label = type === "inverters" ? "Inverter" : type === "panels" ? "Solar Panel" : "Battery";
    const ok = await dialog.confirm({
      title: `ลบรูปหลักฐาน ${label}?`,
      message: photo.detected_serials.length > 0
        ? `Serial: ${photo.detected_serials.join(", ")}`
        : "รูปนี้อ่าน Serial ไม่ได้",
      variant: "danger",
      confirmText: "ลบรูป",
      cancelText: "ยกเลิก",
    });
    if (!ok) return;
    try {
      const saved = await apiFetch(`/api/leads/${leadId}/devices`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, photo_url: photo.url }),
      }) as { evidencePhotos: EvidencePhotos; deletedUrl: string };
      setEvidencePhotos(saved.evidencePhotos ?? EMPTY_EVIDENCE);
      fetch(`/api/upload?file=${encodeURIComponent(saved.deletedUrl)}`, {
        method: "DELETE", headers: { ...getUserIdHeader() },
      }).catch(() => {});
    } catch (e) {
      setEvidenceError(prev => ({ ...prev, [type]: e instanceof Error ? e.message : "ลบรูปหลักฐานไม่สำเร็จ" }));
    }
  };

  const saveType = async (type: DeviceType, items: BaseDevice[]) => {
    try {
      const res = await apiFetch(`/api/leads/${leadId}/devices`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, items }),
      }) as { items: BaseDevice[] };
      if (type === "inverters") setInverters(sortBySerial(res.items as Inverter[]));
      if (type === "batteries") setBatteries(sortBySerial(res.items as Battery[]));
      if (type === "panels")    setPanels(sortBySerial(res.items as Panel[]));
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
  const onClearAll = async (type: DeviceType) => {
    const cur: BaseDevice[] =
      type === "inverters" ? inverters :
      type === "batteries" ? batteries :
                              panels;
    if (cur.length === 0) return;
    const label = type === "inverters" ? "Inverter" : type === "batteries" ? "Battery" : "Solar Panel";
    const ok = await dialog.confirm({
      title: `ลบ ${label} ทั้งหมด?`,
      message: `จะลบ ${cur.length} รายการออกจาก ${label} — ไม่สามารถ undo ได้`,
      variant: "danger",
      confirmText: `ลบ ${cur.length} รายการ`,
      cancelText: "ยกเลิก",
    });
    if (!ok) return;
    await saveType(type, []);
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
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            <span>ออกใบรับประกันแล้ว — รายการ Serial ถูกล็อกห้ามแก้ไข แต่ยังแนบรูปหลักฐานเพิ่มเติมได้</span>
          </div>
        </div>
      )}
      {/* Stack on mobile, spread to N equal columns on desktop — number of
          columns matches the number of visible device types (1/2/3). */}
      {(() => {
        const visible = showTypes ?? (["inverters", "panels", "batteries"] as DeviceType[]);
        const gridCols = visible.length === 1 ? "md:grid-cols-1" : visible.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3";
        return (
          <div className={`grid grid-cols-1 ${gridCols} gap-5 md:gap-6 items-start`}>
            {visible.includes("inverters") && (
              <TreeGroup
                type="inverters"
                title="Inverter"
                emoji="⚡"
                items={inverters}
                slotCount={slotCounts?.inverters}
                slotColumns={slotColumns?.inverters}
                formatLine={(d) => {
                  const i = d as Inverter;
                  return [i.brand, i.kw != null ? `${i.kw} kW` : null, i.serial_no].filter(Boolean).join(" · ") || "—";
                }}
                onAddClick={() => setOpenModal("inverters")}
                onQuickAdd={quickKey ? (serial) => onAdd("inverters", [{ brand: inverters.at(-1)?.brand ?? null, serial_no: serial }]) : undefined}
                onRemove={onRemove}
                locked={locked}
                evidencePhotos={evidencePhotos.inverters}
                evidenceError={evidenceError.inverters}
                onEvidenceClick={() => setEvidenceModal("inverters")}
                onEvidenceDelete={(photo) => deleteEvidence("inverters", photo)}
              />
            )}
            {visible.includes("panels") && (
              <TreeGroup
                type="panels"
                title="Solar Panel"
                emoji="☀️"
                items={panels}
                slotCount={slotCounts?.panels}
                slotColumns={slotColumns?.panels}
                onClearAll={() => onClearAll("panels")}
                formatLine={(d) => [d.brand, d.serial_no].filter(Boolean).join(" · ") || "—"}
                onAddClick={() => setOpenModal("panels")}
                onQuickAdd={quickKey ? (serial) => onAdd("panels", [{ brand: panels.at(-1)?.brand ?? null, serial_no: serial }]) : undefined}
                onRemove={onRemove}
                locked={locked}
                evidencePhotos={evidencePhotos.panels}
                evidenceError={evidenceError.panels}
                onEvidenceClick={() => setEvidenceModal("panels")}
                onEvidenceDelete={(photo) => deleteEvidence("panels", photo)}
              />
            )}
            {visible.includes("batteries") && (
              <TreeGroup
                type="batteries"
                title="Battery"
                emoji="🔋"
                items={batteries}
                slotCount={slotCounts?.batteries}
                slotColumns={slotColumns?.batteries}
                formatLine={(d) => {
                  const b = d as Battery;
                  return [b.brand, b.kwh != null ? `${b.kwh} kWh` : null, b.serial_no].filter(Boolean).join(" · ") || "—";
                }}
                onAddClick={() => setOpenModal("batteries")}
                onQuickAdd={quickKey ? (serial) => onAdd("batteries", [{ brand: batteries.at(-1)?.brand ?? null, serial_no: serial }]) : undefined}
                onRemove={onRemove}
                locked={locked}
                evidencePhotos={evidencePhotos.batteries}
                evidenceError={evidenceError.batteries}
                onEvidenceClick={() => setEvidenceModal("batteries")}
                onEvidenceDelete={(photo) => deleteEvidence("batteries", photo)}
              />
            )}
          </div>
        );
      })()}

      {openModal && (
        <AddDeviceModal
          type={openModal}
          onCancel={() => setOpenModal(null)}
          onSave={(items) => onAdd(openModal, items)}
          existingSerials={new Set(
            (openModal === "inverters" ? inverters : openModal === "batteries" ? batteries : panels)
              .map(d => d.serial_no?.toLowerCase())
              .filter((x): x is string => !!x)
          )}
        />
      )}
      {evidenceModal && (
        <AddDeviceModal
          type={evidenceModal}
          onCancel={() => setEvidenceModal(null)}
          onSave={(items) => saveEvidence(evidenceModal, items)}
          existingSerials={new Set()}
          referenceSerials={new Set(
            [
              ...(evidenceModal === "inverters" ? inverters : evidenceModal === "batteries" ? batteries : panels)
                .map(d => d.serial_no?.toLowerCase())
                .filter((x): x is string => !!x),
              ...(evidencePhotos[evidenceModal] ?? [])
                .flatMap(photo => photo.detected_serials)
                .map(serial => serial.trim().toLowerCase())
                .filter(Boolean),
            ]
          )}
          evidenceOnly
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
  /** When provided, render an inline quick-key row (text input + "+" +
   * AI camera) below the tree instead of the plain "+ เพิ่ม" link. Brand
   * comes from the last item of this type (or null if none). */
  onQuickAdd?: (serial: string) => Promise<{ added: number; dupes: number; reason?: string }>;
  /** When set, render this many numbered slot rows. Items fill the first
   * items.length rows; the remainder are empty inputs the user can key a
   * Serial into. Header shows X/N progress badge. */
  slotCount?: number;
  /** Desktop column count for slot grid (column-major). Defaults to 1. */
  slotColumns?: number;
  /** When provided, render a "ลบทั้งหมด" button in the header that clears
   * every item of this type after a confirmation prompt. */
  onClearAll?: () => Promise<void>;
  onRemove: (type: DeviceType, idx: number) => void;
  locked?: boolean;
  evidencePhotos?: EvidencePhoto[];
  evidenceError?: string;
  onEvidenceClick?: () => void;
  onEvidenceDelete?: (photo: EvidencePhoto) => void;
}
function TreeGroup({ type, title, emoji, items, formatLine, onAddClick, onQuickAdd, slotCount, slotColumns, onClearAll, onRemove, locked, evidencePhotos = [], evidenceError, onEvidenceClick, onEvidenceDelete }: TreeGroupProps) {
  const [quickSn, setQuickSn] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  // Which row's photo (if any) is open in the box-overlay viewer. Only panels
  // currently have `photo_box` populated, so the overlay viewer is mostly a
  // panel-tab feature — other types just see the plain enlarged photo.
  const [boxViewerIdx, setBoxViewerIdx] = useState<number | null>(null);
  const submitQuick = async () => {
    const s = quickSn.trim();
    if (!s || !onQuickAdd) return;
    setQuickBusy(true);
    setQuickError(null);
    try {
      const r = await onQuickAdd(s);
      if (r.added > 0) setQuickSn("");
      else setQuickError(r.reason || "บันทึกไม่สำเร็จ");
    } finally { setQuickBusy(false); }
  };

  // Slot-mode: one input per empty slot, each tracked by its index. After a
  // successful add the input clears (the slot is now "filled" by the new item
  // and the next-empty slot shifts down by one).
  const [slotInputs, setSlotInputs] = useState<Record<number, string>>({});
  const [slotBusy, setSlotBusy] = useState<number | null>(null);
  const submitSlot = async (slotIdx: number) => {
    const s = (slotInputs[slotIdx] || "").trim();
    if (!s || !onQuickAdd) return;
    setSlotBusy(slotIdx);
    try {
      const r = await onQuickAdd(s);
      if (r.added > 0) setSlotInputs(prev => ({ ...prev, [slotIdx]: "" }));
    } finally { setSlotBusy(null); }
  };
  // Slot mode renders exactly slotCount rows (filled + empty inputs). Without
  // slotCount it falls back to the original "list of items only" view.
  const useSlots = typeof slotCount === "number" && slotCount > 0 && !!onQuickAdd;
  const totalRows = useSlots ? Math.max(slotCount as number, items.length) : items.length;

  return (
    <section>
      <header className="flex items-center gap-2 mb-1">
        <span className="text-base">{emoji}</span>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        <span className="text-xs text-gray-400 font-mono tabular-nums">
          {useSlots ? `${items.length} / ${slotCount}` : items.length}
        </span>
        {!locked && onClearAll && items.length > 0 && (
          <button type="button" onClick={onClearAll}
            className="ml-auto text-xs font-semibold text-red-400 hover:text-red-600 hover:underline">
            ลบทั้งหมด
          </button>
        )}
      </header>
      {/* Tree-text indented under a soft left rail to mimic the timeline tab.
          In slot mode with slotColumns > 1, lay the rows out column-major so
          row N+1 sits to the right of row N (top of next column). */}
      <div className="pl-3 border-l border-gray-200 ml-2">
        {!useSlots && items.length === 0 && (
          <div className="text-xs text-gray-400 italic py-1">— ยังไม่มีรายการ —</div>
        )}
        <div className={
          useSlots && (slotColumns ?? 1) > 1
            ? "grid grid-cols-1 md:grid-cols-2 md:grid-rows-[repeat(10,minmax(0,auto))] md:grid-flow-col gap-x-3 gap-y-1"
            : "space-y-1"
        }>
        {Array.from({ length: totalRows }, (_, i) => {
          const d = items[i];
          if (d) {
            return (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-gray-300 select-none">{i === totalRows - 1 ? "└" : "├"}</span>
                <span className="font-mono tabular-nums text-gray-400 shrink-0 w-7 text-right">{i + 1}.</span>
                {/* OCR snapshot thumbnail — click to open the full image in a
                    new tab. Only shown when the device has a photo_url (so
                    panel rows, which don't store per-serial photos, just keep
                    the text-only row they had before). */}
                {d.photo_url ? (
                  <button
                    type="button"
                    onClick={() => setBoxViewerIdx(i)}
                    title="ดูตำแหน่ง serial บนรูป"
                    className="shrink-0 block w-9 h-9 rounded border border-gray-200 overflow-hidden bg-gray-50 hover:border-active hover:opacity-90"
                  >
                    <SerialCropThumbnail
                      photoUrl={d.photo_url}
                      box={parseBox(d.photo_box)}
                      alt={d.serial_no || `${title} serial`}
                      crop={type === "panels"}
                    />
                  </button>
                ) : (
                  <span className="shrink-0 w-9 h-9 rounded border border-dashed border-gray-200 bg-gray-50/50 flex items-center justify-center text-gray-300" title="ไม่มีรูป">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4-4 3 3 5-5 4 4M4 6h16v12H4z" />
                    </svg>
                  </span>
                )}
                <span className="font-mono tabular-nums text-gray-700 break-all flex-1 min-w-0">{formatLine(d)}</span>
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
            );
          }
          // Empty slot — input row (only in slot mode). Each slot keeps its
          // own input state in slotInputs[i]; after save it clears.
          if (locked) return null;
          const busy = slotBusy === i;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="font-mono tabular-nums text-gray-400 shrink-0 w-7 text-right">{i + 1}.</span>
              <input
                value={slotInputs[i] || ""}
                onChange={e => setSlotInputs(prev => ({ ...prev, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") submitSlot(i); }}
                disabled={busy}
                placeholder={`Serial #${i + 1}`}
                className="flex-1 min-w-0 h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm font-mono focus:outline-none focus:border-active disabled:opacity-50"
              />
              <button type="button" onClick={() => submitSlot(i)} disabled={busy || !(slotInputs[i] || "").trim()}
                title={`เพิ่ม ${title}`}
                className="shrink-0 h-8 w-9 inline-flex items-center justify-center rounded-lg border border-active/30 bg-active-light text-active hover:bg-active/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          );
        })}
        </div>
        {!locked && !onQuickAdd && <button
          type="button"
          onClick={onAddClick}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark mt-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          เพิ่ม {title}
        </button>}
        {/* Slot mode: only show the AI camera at the bottom (each empty slot
            already has its own typing input + plus button). */}
        {!locked && onQuickAdd && useSlots && (
          <div className="mt-2">
            <button type="button" onClick={onAddClick}
              title="AI อ่าน Serial"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white bg-active hover:brightness-110 transition-colors">
              <span className="relative inline-flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
                <svg className="absolute -top-1 -right-1 w-2.5 h-2.5 text-amber-300 drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0l2.4 7.6L22 10l-7.6 2.4L12 20l-2.4-7.6L2 10l7.6-2.4L12 0z" />
                </svg>
              </span>
              AI อ่าน Serial
            </button>
          </div>
        )}
        {!locked && onQuickAdd && !useSlots && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-1.5">
              <input
                value={quickSn}
                onChange={e => { setQuickSn(e.target.value); setQuickError(null); }}
                onKeyDown={e => { if (e.key === "Enter") submitQuick(); }}
                placeholder="พิมพ์ Serial แล้วกด Enter…"
                disabled={quickBusy}
                className="flex-1 min-w-0 h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm font-mono focus:outline-none focus:border-primary disabled:bg-gray-50"
              />
              <button type="button" onClick={submitQuick} disabled={quickBusy || !quickSn.trim()}
                title={`เพิ่ม ${title}`}
                className="shrink-0 h-8 w-9 rounded-lg border border-primary/30 bg-primary/5 text-primary flex items-center justify-center hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button type="button" onClick={onAddClick}
                title="AI อ่าน Serial"
                className="shrink-0 h-8 w-9 rounded-lg text-white bg-active hover:brightness-110 flex items-center justify-center transition-colors">
                <span className="relative inline-flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  <svg className="absolute -top-1 -right-1 w-2.5 h-2.5 text-amber-300 drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0l2.4 7.6L22 10l-7.6 2.4L12 20l-2.4-7.6L2 10l7.6-2.4L12 0z" />
                  </svg>
                </span>
              </button>
            </div>
            {quickError && <div className="text-[10px] text-red-500">{quickError}</div>}
          </div>
        )}
      </div>

      {locked && onEvidenceClick && (
        <EvidenceGallery
          title={title}
          photos={evidencePhotos}
          error={evidenceError}
          onClick={onEvidenceClick}
          onDelete={onEvidenceDelete}
        />
      )}
      {boxViewerIdx != null && items[boxViewerIdx]?.photo_url && (
        <PhotoBoxViewer
          photoUrl={items[boxViewerIdx]!.photo_url!}
          activeIdx={boxViewerIdx}
          items={items.map((d, i) => ({
            // Only stack overlays from rows that share THIS photo. Different
            // upload sessions = different photos, so we don't want to draw
            // boxes from a different photo on top of this one.
            serial: d.serial_no,
            box: d.photo_url === items[boxViewerIdx]?.photo_url ? parseBox(d.photo_box) : null,
            idx: i,
          }))}
          onClose={() => setBoxViewerIdx(null)}
        />
      )}
    </section>
  );
}

function EvidenceGallery({ title, photos, error, onClick, onDelete }: {
  title: string;
  photos: EvidencePhoto[];
  error?: string;
  onClick: () => void;
  onDelete?: (photo: EvidencePhoto) => void;
}) {
  const [viewer, setViewer] = useState<{ photoIdx: number; serialIdx: number } | null>(null);
  const rows = photos.flatMap((photo, photoIdx) => {
    const serials: Array<string | null> = photo.detected_serials.length > 0 ? photo.detected_serials : [null];
    return serials.map((serial, serialIdx) => ({
      photo,
      photoIdx,
      serial,
      serialIdx,
      box: photo.boxes?.[serialIdx] ?? null,
    }));
  });
  return (
    <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
      <div className="text-[11px] font-semibold text-gray-500 mb-2">เพิ่มรูป {title} หลังออกใบรับประกัน</div>
      {rows.length > 0 && <div className="pl-3 border-l border-gray-200 ml-2 mb-2 space-y-1">
        {rows.map((row, index) => (
          <div key={`${row.photo.url}-${row.serialIdx}`} className="flex items-center gap-2 min-w-0 text-sm">
            <span className="text-gray-300 select-none">{index === rows.length - 1 ? "└" : "├"}</span>
            <span className="font-mono tabular-nums text-gray-400 shrink-0 w-7 text-right">{index + 1}.</span>
            <button type="button" onClick={() => setViewer({ photoIdx: row.photoIdx, serialIdx: row.serialIdx })}
              title="ดูตำแหน่ง Serial ที่ AI ตรวจพบ"
              className="shrink-0 block w-9 h-9 rounded border border-gray-200 overflow-hidden bg-gray-50 hover:border-red-400">
              <SerialCropThumbnail
                photoUrl={row.photo.url}
                box={row.box}
                alt={row.serial || `${title} evidence`}
                crop={title === "Solar Panel"}
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="font-mono tabular-nums text-gray-700 break-all">
                {[row.photo.brand, row.photo.spec != null ? `${row.photo.spec} ${title === "Battery" ? "kWh" : "kW"}` : null, row.serial || "ไม่พบ Serial"].filter(Boolean).join(" · ")}
              </div>
            </div>
            {onDelete && <button type="button" onClick={() => onDelete(row.photo)}
              className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50"
              aria-label={`ลบรูปหลักฐาน ${title}`} title="ลบรูปหลักฐาน">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>}
          </div>
        ))}
      </div>}
      <button type="button" onClick={onClick}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-colors hover:text-primary-dark">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>เพิ่มรูป {title}</span>
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {viewer && photos[viewer.photoIdx] && (
        title === "Solar Panel" ? <SerialCropViewer
          photoUrl={photos[viewer.photoIdx].url}
          activeIdx={viewer.serialIdx}
          items={(photos[viewer.photoIdx].detected_serials.length > 0 ? photos[viewer.photoIdx].detected_serials : [null]).map((serial, i) => ({
            serial,
            box: photos[viewer.photoIdx].boxes?.[i] ?? null,
            idx: i,
          }))}
          onClose={() => setViewer(null)}
        /> : <PhotoBoxViewer
          photoUrl={photos[viewer.photoIdx].url}
          activeIdx={viewer.serialIdx}
          items={(photos[viewer.photoIdx].detected_serials.length > 0 ? photos[viewer.photoIdx].detected_serials : [null]).map((serial, i) => ({
            serial,
            box: photos[viewer.photoIdx].boxes?.[i] ?? null,
            idx: i,
          }))}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

// Evidence viewer intentionally renders only one cropped serial label. The
// source photo is never shown, so a photo containing many labels behaves like
// a set of independent serial previews when the user opens each row.
function SerialCropViewer({
  photoUrl,
  activeIdx,
  items,
  onClose,
}: {
  photoUrl: string;
  activeIdx: number;
  items: Array<{ serial: string | null; box: number[] | null; idx: number }>;
  onClose: () => void;
}) {
  const active = items.find(item => item.idx === activeIdx);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasBox = Boolean(active?.box && active.box.length === 4);
  const [cropState, setCropState] = useState<"loading" | "ready" | "unavailable">("loading");
  const visibleState = hasBox ? cropState : "unavailable";

  useEffect(() => {
    if (!active?.box || active.box.length !== 4) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const image = new Image();
    image.onload = () => {
      const [yMin, xMin, yMax, xMax] = active.box!;
      const boxW = Math.max(1, xMax - xMin);
      const boxH = Math.max(1, yMax - yMin);
      const padX = Math.max(boxW * 0.08, 12);
      const padY = Math.max(boxH * 0.28, 18);
      const cropX1 = Math.max(0, xMin - padX);
      const cropY1 = Math.max(0, yMin - padY);
      const cropX2 = Math.min(1000, xMax + padX);
      const cropY2 = Math.min(1000, yMax + padY);
      const sx = image.naturalWidth * cropX1 / 1000;
      const sy = image.naturalHeight * cropY1 / 1000;
      const sw = image.naturalWidth * (cropX2 - cropX1) / 1000;
      const sh = image.naturalHeight * (cropY2 - cropY1) / 1000;
      const aspect = sw / sh;
      const outputWidth = Math.min(1400, Math.max(640, Math.round(sw)));
      const outputHeight = Math.max(220, Math.round(outputWidth / aspect));

      canvas.width = outputWidth;
      canvas.height = outputHeight;
      ctx.clearRect(0, 0, outputWidth, outputHeight);
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

      const scaleX = outputWidth / (cropX2 - cropX1);
      const scaleY = outputHeight / (cropY2 - cropY1);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = Math.max(3, Math.round(outputWidth / 350));
      ctx.strokeRect(
        (xMin - cropX1) * scaleX,
        (yMin - cropY1) * scaleY,
        boxW * scaleX,
        boxH * scaleY,
      );
      setCropState("ready");
    };
    image.onerror = () => setCropState("unavailable");
    image.src = photoUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [photoUrl, active]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" role="dialog">
      <div onClick={event => event.stopPropagation()} className="relative max-w-[95vw] max-h-[95vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-gray-800 shadow-lg flex items-center justify-center text-xl z-10"
          aria-label="ปิด"
        >×</button>
        <div className="relative min-w-72 min-h-40 flex items-center justify-center overflow-auto bg-white rounded">
          <canvas
            ref={canvasRef}
            aria-label={`Serial ${active?.serial || activeIdx + 1}`}
            className={`block max-w-[95vw] max-h-[80vh] object-contain ${visibleState === "ready" ? "" : "invisible"}`}
          />
          {visibleState === "loading" && <div className="absolute text-sm text-gray-500">กำลังตัดภาพ Serial...</div>}
          {visibleState === "unavailable" && (
            <div className="p-8 text-center text-sm text-gray-500">
              ไม่พบตำแหน่ง Serial สำหรับตัดภาพ<br />กรุณาเพิ่มรูปและให้ AI ตรวจจับใหม่
            </div>
          )}
        </div>
        <div className="mt-2 text-center text-white text-sm font-mono">
          #{activeIdx + 1} · {active?.serial || "—"}
        </div>
      </div>
    </div>
  );
}

function SerialCropThumbnail({ photoUrl, box, alt, crop = true }: { photoUrl: string; box: number[] | null; alt: string; crop?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!box || box.length !== 4) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = new Image();
    image.onload = () => {
      const [yMin, xMin, yMax, xMax] = box;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f9fafb";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!crop) {
        const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
        const dw = image.naturalWidth * scale;
        const dh = image.naturalHeight * scale;
        const dx = (canvas.width - dw) / 2;
        const dy = (canvas.height - dh) / 2;
        ctx.drawImage(image, dx, dy, dw, dh);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.strokeRect(
          dx + dw * xMin / 1000,
          dy + dh * yMin / 1000,
          dw * (xMax - xMin) / 1000,
          dh * (yMax - yMin) / 1000,
        );
        return;
      }

      const padX = Math.max((xMax - xMin) * 0.12, 12);
      const padY = Math.max((yMax - yMin) * 0.18, 12);
      const cropX1 = Math.max(0, xMin - padX);
      const cropY1 = Math.max(0, yMin - padY);
      const cropX2 = Math.min(1000, xMax + padX);
      const cropY2 = Math.min(1000, yMax + padY);
      const sx = image.naturalWidth * cropX1 / 1000;
      const sy = image.naturalHeight * cropY1 / 1000;
      const sw = image.naturalWidth * (cropX2 - cropX1) / 1000;
      const sh = image.naturalHeight * (cropY2 - cropY1) / 1000;
      const scale = Math.min(canvas.width / sw, canvas.height / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (canvas.width - dw) / 2;
      const dy = (canvas.height - dh) / 2;
      ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        dx + image.naturalWidth * (xMin - cropX1) / 1000 * scale,
        dy + image.naturalHeight * (yMin - cropY1) / 1000 * scale,
        image.naturalWidth * (xMax - xMin) / 1000 * scale,
        image.naturalHeight * (yMax - yMin) / 1000 * scale,
      );
    };
    image.src = photoUrl;
    return () => { image.onload = null; };
  }, [photoUrl, box, crop]);

  return (
    <span className="relative block w-full h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} alt={alt} className={`w-full h-full ${crop ? "object-cover" : "object-contain"}`} />
      {box && <canvas ref={canvasRef} width={160} height={100} aria-label={alt} className="absolute inset-0 w-full h-full object-cover bg-gray-50" />}
    </span>
  );
}

// JSON-encoded "[ymin,xmin,ymax,xmax]" → number[] or null when missing/bad.
function parseBox(s: string | null | undefined): number[] | null {
  if (!s) return null;
  try {
    const arr = JSON.parse(s) as unknown;
    if (Array.isArray(arr) && arr.length === 4 && arr.every(n => typeof n === "number")) return arr as number[];
  } catch { /* fall through */ }
  return null;
}

// Modal that renders the OCR snapshot at full size with red rectangles drawn
// at every serial's bounding box. The clicked row is highlighted (thick red);
// the rest of the shared photo's rows show as thin amber outlines so the user
// can scan the whole sheet without losing the "you are here" anchor.
function PhotoBoxViewer({
  photoUrl,
  activeIdx,
  items,
  onClose,
}: {
  photoUrl: string;
  activeIdx: number;
  items: Array<{ serial: string | null; box: number[] | null; idx: number }>;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
    >
      <div onClick={e => e.stopPropagation()} className="relative max-w-[95vw] max-h-[95vh] flex flex-col">
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white text-gray-800 shadow-lg flex items-center justify-center text-xl z-10"
          aria-label="ปิด"
        >×</button>
        {/* Image + overlay. The overlay is absolutely positioned over the
            <img> at 100% × 100% so a single % box position lines up regardless
            of the rendered image size. */}
        <div className="relative inline-block overflow-auto bg-white rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photoUrl} alt="" className="block max-w-[95vw] max-h-[85vh] object-contain" />
          <div className="absolute inset-0 pointer-events-none">
            {(() => {
              // Only draw the box for the row the user clicked. User feedback
              // was that the amber outlines for sibling rows were visual noise
              // — the whole point of opening this view is "where IS this
              // serial," so one strong red rectangle is the right answer.
              const active = items.find(it => it.idx === activeIdx);
              if (!active?.box) return null;
              const PAD = 25;  // ~2.5% of image — ≈ 5mm on a typical A4-sized photo
              const [ymin, xmin, ymax, xmax] = active.box;
              const y0 = Math.max(0,    ymin - PAD);
              const x0 = Math.max(0,    xmin - PAD);
              const y1 = Math.min(1000, ymax + PAD);
              const x1 = Math.min(1000, xmax + PAD);
              const top    = (y0 / 1000) * 100;
              const left   = (x0 / 1000) * 100;
              const height = ((y1 - y0) / 1000) * 100;
              const width  = ((x1 - x0) / 1000) * 100;
              return (
                <div
                  className="absolute border-2 border-red-500 ring-2 ring-red-500/40"
                  style={{ top: `${top}%`, left: `${left}%`, width: `${width}%`, height: `${height}%` }}
                >
                  <span className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-mono rounded whitespace-nowrap bg-red-500 text-white">
                    #{activeIdx + 1}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="mt-2 text-center text-white text-sm font-mono">
          #{activeIdx + 1} · {items.find(i => i.idx === activeIdx)?.serial || "—"}
        </div>
      </div>
    </div>
  );
}

export interface AddDeviceModalProps {
  type: DeviceType;
  onCancel: () => void;
  onSave: (items: Array<BaseDevice & { kw?: number | null; kwh?: number | null }>) => Promise<{ added: number; dupes: number; reason?: string }>;
  /** Serials already captured for this device type, lower-cased. The wizard
   * silently drops OCR'd SNs that match one of these so the batch UI only
   * surfaces fresh candidates. Without this prop, dedup still happens at
   * save time but the user sees the dupes first. */
  existingSerials?: Set<string>;
  /** Evidence mode reuses the same capture wizard but PATCHes an immutable
   * post-warranty record instead of adding/replacing canonical device rows. */
  evidenceOnly?: boolean;
  /** Canonical serials used only to preview match status in evidence mode. */
  referenceSerials?: Set<string>;
}
// 3-step wizard: pick brand → fill specs (skipped for panels) → capture serial.
// "Step" here is a logical index, not a route — all rendered in the same modal
// shell so back/next feels instant and state is preserved between transitions.
export function AddDeviceModal({ type, onCancel, onSave, existingSerials, evidenceOnly = false, referenceSerials }: AddDeviceModalProps) {
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
  const [ocrPreview, setOcrPreview] = useState<{ brand: string | null; num: number | null; serials: string[]; boxes?: (number[] | null)[] } | null>(null);
  // URL of the OCR snapshot — kept so we can persist it on the device row
  // (lead_inverters / lead_batteries .photo_url). Was deleted right after
  // OCR before; now we leave it in /uploads/ and store the URL so the
  // info-tab tree can show the captured snapshot per device.
  const [ocrPhotoUrl, setOcrPhotoUrl] = useState<string | null>(null);
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
  const runOcr = async (file: File): Promise<{ brand: string | null; num: number | null; serials: string[]; boxes: (number[] | null)[]; photoUrl: string | null } | null> => {
    const compressed = await compressSlipFile(file);
    const fd = new FormData();
    fd.append("file", compressed);
    const up = await apiFetch("/api/upload", { method: "POST", body: fd }) as { url: string };
    let serials: string[] = [];
    let boxes: (number[] | null)[] = [];
    let brand: string | null = null;
    let num: number | null = null;
    try {
      if (type === "inverters") {
        const ocr = await apiFetch("/api/ocr-serial", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: up.url }),
        }) as { serial: string | null; brand: string | null; kw: number | null; box?: number[] | null };
        if (ocr.serial) {
          serials = [ocr.serial.trim()];
          boxes   = [Array.isArray(ocr.box) && ocr.box.length === 4 ? ocr.box : null];
        }
        brand = ocr.brand;
        num = ocr.kw;
      } else {
        const endpoint = type === "batteries" ? "/api/ocr-battery-serials" : "/api/ocr-panel-serials";
        const ocr = await apiFetch(endpoint, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: [up.url] }),
        }) as { serials: string[]; items?: Array<{ serial: string; box: number[] | null }> };
        // Prefer the new boxed shape when present (panel OCR) so each serial
        // carries its sticker coords; fall back to the flat serials array for
        // endpoints that haven't been upgraded yet (battery).
        if (Array.isArray(ocr.items) && ocr.items.length > 0) {
          serials = ocr.items.map(i => (i.serial || "").trim()).filter(Boolean);
          boxes   = ocr.items.map(i => i.box ?? null).slice(0, serials.length);
        } else {
          serials = (ocr.serials || []).map(s => s.trim()).filter(Boolean);
          boxes   = serials.map(() => null);
        }
      }
    } catch (e) {
      // OCR failed — clean up the orphan upload so it doesn't sit in /uploads/.
      fetch(`/api/upload?file=${encodeURIComponent(up.url)}`, {
        method: "DELETE", headers: { ...getUserIdHeader() },
      }).catch(() => {});
      throw e;
    }
    if (serials.length === 0 && !brand && num == null) {
      // Nothing extracted — clean up the orphan upload.
      fetch(`/api/upload?file=${encodeURIComponent(up.url)}`, {
        method: "DELETE", headers: { ...getUserIdHeader() },
      }).catch(() => {});
      return null;
    }
    // Keep the photo — it's persisted on the device row so the tree can show
    // the captured snapshot. Panel sheets share one photo across every
    // serial extracted from them; same pattern as the battery rack scan.
    return { brand, num, serials, boxes, photoUrl: up.url };
  };

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcrBusy(true);
    setError(null);
    setOcrPreview(null);
    setOcrPhotoUrl(null);
    setBatchPicks([]);
    try {
      const result = await runOcr(file);
      if (!result) { setError("อ่านข้อมูลไม่ออก ลองถ่ายใหม่ใกล้ๆ ฉลาก"); return; }
      setOcrPhotoUrl(result.photoUrl);
      // brand / spec auto-fill (single-photo OCR also reads them on inverter).
      // Only auto-fill brand/spec when the user hasn't already picked one.
      // Otherwise OCR-detected values would silently overwrite an explicit
      // selection (e.g. user chose 3 kW in step 2, OCR reads the actual chip
      // as 10 kW and stomps the user's pick).
      if (result.brand && !brand.trim()) setBrand(result.brand);
      if (result.num != null && !num.trim()) setNum(String(result.num));
      // Pre-dedupe OCR'd SNs against what's already saved for this type.
      // Without this the batch UI would surface dupes the user has to
      // uncheck manually — and a single SN that's already saved would
      // silently overwrite the textbox.
      const rawCount = result.serials.length;
      // Keep boxes aligned with their serial through the dedupe filter.
      const keptIdx: number[] = [];
      for (let i = 0; i < result.serials.length; i++) {
        const s = result.serials[i];
        if (evidenceOnly || !existingSerials || existingSerials.size === 0 || !existingSerials.has(s.toLowerCase())) keptIdx.push(i);
      }
      const fresh = keptIdx.map(i => result.serials[i]);
      const freshBoxes = keptIdx.map(i => result.boxes[i] ?? null);
      const skipped = rawCount - fresh.length;
      // 1 SN → fill the textbox like before.
      // N SNs → leave textbox alone; the batch UI takes over.
      if (fresh.length === 1) setSerial(fresh[0]);
      else if (fresh.length > 1) setBatchPicks(fresh.map(() => true));
      setOcrPreview({ ...result, serials: fresh, boxes: freshBoxes });
      if (fresh.length === 0) {
        if (rawCount === 0 && step === "serial") {
          setError("อ่าน Serial ไม่ออก ลองถ่ายใหม่ใกล้ๆ ตัวเลข");
        } else if (skipped > 0) {
          setError(`Serial ที่อ่านได้ ${skipped} ตัวมีอยู่แล้ว — ไม่มีตัวใหม่`);
        }
      } else if (skipped > 0) {
        // Non-blocking notice — the input still works, we just say what we skipped.
        setError(`อ่านได้ ${rawCount} ตัว · ใหม่ ${fresh.length} · ข้ามที่ซ้ำ ${skipped}`);
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
    if (evidenceOnly && findDuplicateSerials(picks, referenceSerials).length > 0) {
      setError("พบ Serial ซ้ำ ไม่สามารถบันทึกได้");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Walk the picked indices so we can stamp each payload with its own
      // photo_box from the OCR response — keeping serial ↔ box pairing intact.
      const pickedIdxs = ocrPreview.serials
        .map((_, i) => (batchPicks[i] ? i : -1))
        .filter(i => i >= 0);
      const payloads = pickedIdxs.map(i => buildPayload(ocrPreview.serials[i], ocrPreview.boxes?.[i] ?? null));
      const result = await onSave(payloads);
      if (result.added === 0) setError(result.reason || `Serial ทั้งหมดมีอยู่แล้ว (${result.dupes} ซ้ำ)`);
      else if (result.dupes > 0) setError(`เพิ่ม ${result.added} รายการ · ข้ามที่ซ้ำ ${result.dupes} รายการ`);
    } finally {
      setSaving(false);
    }
  };

  // Build one payload from current form state — used by both single and batch
  // commit paths (batch maps over SNs and stamps each with the same payload).
  const buildPayload = (sn: string, box?: number[] | null): BaseDevice & { kw?: number | null; kwh?: number | null } => {
    const numVal = num.trim() ? parseFloat(num) : null;
    const p: BaseDevice & { kw?: number | null; kwh?: number | null } = {
      brand: brand.trim() || null,
      serial_no: sn.trim(),
    };
    if (type === "inverters") p.kw = Number.isFinite(numVal as number) ? numVal : null;
    if (type === "batteries") p.kwh = Number.isFinite(numVal as number) ? numVal : null;
    // Stamp the OCR snapshot URL so the info-tab tree can show the captured
    // photo per device. Same URL gets shared across all serials extracted
    // from one batch photo (panel sheets, battery racks).
    if (ocrPhotoUrl) p.photo_url = ocrPhotoUrl;
    // Bounding box ([ymin,xmin,ymax,xmax], Gemini-normalised 0-1000) — saved
    // alongside the photo so the per-row thumbnail can open a red-overlay
    // preview pointing at the exact sticker the SN came from.
    if (box && box.length === 4) p.photo_box = JSON.stringify(box);
    return p;
  };

  const submit = async () => {
    if (!serial.trim() && !(evidenceOnly && ocrPhotoUrl)) { setError("ใส่ Serial หรือถ่ายรูปก่อน"); return; }
    if (evidenceOnly && !ocrPhotoUrl) { setError("กรุณาถ่ายรูปหลักฐานก่อนบันทึก"); return; }
    if (evidenceOnly && findDuplicateSerials(serial.trim() ? [serial.trim()] : [], referenceSerials).length > 0) {
      setError("พบ Serial ซ้ำ ไม่สามารถบันทึกได้");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Single-SN path: pull the matching box from ocrPreview if the user
      // got here via the AI scan (otherwise null — typed-in SNs have no
      // sticker coords).
      const idx = ocrPreview ? ocrPreview.serials.indexOf(serial.trim()) : -1;
      const box = idx >= 0 ? (ocrPreview?.boxes?.[idx] ?? null) : null;
      const result = await onSave([buildPayload(serial || "", box)]);
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
    ? evidenceOnly
      ? !!ocrPhotoUrl && findDuplicateSerials(serial.trim() ? [serial.trim()] : [], referenceSerials).length === 0
      : serial.trim().length > 0
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
          <h3 className="text-sm font-bold text-gray-900 truncate">{evidenceOnly ? `เพิ่มรูป ${title} หลังออกใบรับประกัน` : `เพิ่ม ${title} Serial`}</h3>
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
                className="w-full h-8 rounded-lg text-sm text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300">
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
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">สรุปข้อมูล</div>
                  {/* Show the values that WILL be saved (current state) rather
                      than the raw OCR readout — user-picked brand/spec win
                      over OCR-detected ones, so the recap must reflect that. */}
                  <PreviewRow label="Brand" value={brand || null} />
                  {numLabel && <PreviewRow label={numLabel} value={num || null} />}
                  <PreviewRow label="Serial" value={serial || ocrPreview.serials[0] || null} mono />
                  {evidenceOnly && <EvidenceMatchStatus serials={serial ? [serial] : ocrPreview.serials} referenceSerials={referenceSerials} />}
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
                  {evidenceOnly && <EvidenceMatchStatus serials={ocrPreview.serials.filter((_, i) => batchPicks[i])} referenceSerials={referenceSerials} />}
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
                {evidenceOnly && <EvidenceMatchStatus serials={serial.trim() ? [serial.trim()] : []} referenceSerials={referenceSerials} />}
              </div>
              <p className="text-xs text-gray-500">กดย้อนกลับเพื่อแก้ไข หรือกด &quot;บันทึก&quot; เพื่อเพิ่มในรายการ</p>
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
              const pickedSerials = ocrPreview.serials.filter((_, i) => batchPicks[i]);
              const hasDuplicates = evidenceOnly && findDuplicateSerials(pickedSerials, referenceSerials).length > 0;
              return (
                <button type="button" onClick={submitBatch} disabled={saving || ocrBusy || pickedN === 0 || hasDuplicates}
                  className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? "กำลังบันทึก..." : evidenceOnly ? `บันทึกรูปหลักฐาน (${pickedN} Serial)` : `บันทึก ${pickedN} รายการ`}
                </button>
              );
            }
            if (step === "confirm") {
              const hasDuplicates = evidenceOnly && findDuplicateSerials(serial.trim() ? [serial.trim()] : [], referenceSerials).length > 0;
              return (
                <button type="button" onClick={submit} disabled={saving || ocrBusy || hasDuplicates}
                  className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? "กำลังบันทึก..." : evidenceOnly ? "บันทึกรูปหลักฐาน" : "บันทึก"}
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
function findDuplicateSerials(serials: string[], referenceSerials?: Set<string>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const serial of serials) {
    const value = serial.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key) || referenceSerials?.has(key)) duplicates.add(value);
    seen.add(key);
  }
  return [...duplicates];
}

function EvidenceMatchStatus({ serials, referenceSerials }: { serials: string[]; referenceSerials?: Set<string> }) {
  const detected = serials.map(s => s.trim()).filter(Boolean);
  const duplicates = findDuplicateSerials(detected, referenceSerials);
  const status = detected.length === 0
    ? { label: "AI อ่าน Serial ไม่ได้ — บันทึกเป็นหลักฐานทั่วไป", cls: "border-amber-200 bg-amber-50 text-amber-700" }
    : duplicates.length > 0
    ? { label: "พบ Serial ซ้ำ ไม่สามารถบันทึกได้", cls: "border-red-200 bg-red-50 text-red-700" }
    : { label: "ไม่พบ Serial ที่ซ้ำในรายการเดิม-ยังสามารถสามารถบันทึกรายการได้", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  return <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${status.cls}`}>{status.label}</div>;
}

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
