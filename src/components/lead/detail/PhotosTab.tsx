"use client";
import { useState } from "react";
import FallbackImage from "@/components/ui/FallbackImage";
import type { LightboxImage } from "@/components/ui/ImageLightbox";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { compressSlipFile } from "@/lib/utils/compress-slip";

// Tab body for the lead detail "Photos" tab. Pulls every image-shaped URL
// off the lead row, groups them by the workflow stage they came from, and
// renders thumbnail tiles. Read-only — Serials/Survey/etc. steps remain the
// place to upload; this tab is a single-pane overview for review.

interface PhotoItem {
  url: string;
  label: string;
  /** PDFs render as a doc icon + link instead of an <img>. */
  pdf?: boolean;
  /** Long-form caption shown wrapped under the thumbnail. Distinct from
   * `label` (single-line, mostly used as the lightbox header) — used by the
   * Photo-with-Note sub-group to surface the surveyor's text. */
  note?: string;
}
interface SubGroup {
  title: string;
  items: PhotoItem[];
  /** When present, render an upload tile after the items and PATCH the field
   * named here with the appended CSV. */
  uploadField?: string;
  /** Existing raw CSV value behind the upload field — needed to append. */
  uploadCurrent?: string;
}
interface Group {
  title: string;
  emoji: string;
  /** Flat items (no sub-groups). When set, sub is ignored. */
  items?: PhotoItem[];
  /** Subgroups inside this section (e.g. Install splits into main + extra). */
  sub?: SubGroup[];
}

// Loose-shaped subset of Lead — we only need the URL columns. Tighter typing
// would require dragging the full lead type into a fixed shape here.
type LeadLike = Record<string, unknown>;

const has = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const split = (csv: unknown): string[] =>
  has(csv) ? csv.split(",").map(s => s.trim()).filter(Boolean) : [];
const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url);
const splitWarrantyEvidence = (raw: unknown): Array<{ type: string; url: string }> => {
  if (!has(raw)) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const labels: Record<string, string> = { inverters: "Inverter", panels: "Solar Panel", batteries: "Battery" };
    return Object.entries(labels).flatMap(([key, label]) => {
      if (!Array.isArray(parsed[key])) return [];
      return parsed[key].flatMap((item): Array<{ type: string; url: string }> => {
        if (typeof item === "string") return [{ type: label, url: item }];
        if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
          return [{ type: label, url: (item as { url: string }).url }];
        }
        return [];
      });
    });
  } catch {
    return split(raw).map(url => ({ type: "Inverter", url }));
  }
};

function buildGroups(lead: LeadLike): Group[] {
  const out: Group[] = [];
  const push = (title: string, emoji: string, items: PhotoItem[]) => {
    if (items.length) out.push({ title, emoji, items });
  };
  const pushSub = (title: string, emoji: string, sub: SubGroup[]) => {
    // Show the section even when both subgroups are empty IF one of them is
    // upload-enabled — that's the entry point users need to bootstrap photos.
    if (sub.some(s => s.items.length > 0 || s.uploadField)) out.push({ title, emoji, sub });
  };

  // — Pre-Survey: ID card, house reg, electricity bill. (Payment slip is
  // excluded by request — slips live with their payment record, not the
  // workflow photo gallery.) —
  const preSurvey: PhotoItem[] = [];
  if (has(lead.id_card_photo_url))    preSurvey.push({ url: lead.id_card_photo_url,    label: "บัตรประชาชน" });
  if (has(lead.house_reg_photo_url))  preSurvey.push({ url: lead.house_reg_photo_url,  label: "ทะเบียนบ้าน" });
  if (has(lead.pre_bill_photo_url))   preSurvey.push({ url: lead.pre_bill_photo_url,   label: "บิลค่าไฟ" });
  push("Pre-Survey", "📋", preSurvey);

  // — Survey: 4-slot checklist + photo-with-note + free-form gallery + extra.
  // Sub-groups mirror what the SurveyStep page captures so the reader sees
  // the same buckets here. Extra is the "เพิ่มเติม" zone for post-hoc photos
  // that the survey team needs to add later from this tab. —
  const surveyChecklist: PhotoItem[] = [];
  if (has(lead.survey_photo_building_url))        surveyChecklist.push({ url: lead.survey_photo_building_url,        label: "อาคาร" });
  if (has(lead.survey_photo_roof_structure_url))  surveyChecklist.push({ url: lead.survey_photo_roof_structure_url,  label: "โครงสร้างหลังคา" });
  if (has(lead.survey_photo_mdb_url))             surveyChecklist.push({ url: lead.survey_photo_mdb_url,             label: "Consumer Unit / MDB" });
  if (has(lead.survey_photo_inverter_point_url))  surveyChecklist.push({ url: lead.survey_photo_inverter_point_url,  label: "จุดติด Inverter" });
  // Photo-with-Note slots — JSON array on lead.survey_photo_notes. Each entry
  // is { url, note }; we only show entries that actually have a photo, and
  // the note renders as a wrapped caption below the thumbnail.
  const surveyWithNote: PhotoItem[] = [];
  if (has(lead.survey_photo_notes)) {
    try {
      const arr = JSON.parse(lead.survey_photo_notes) as Array<{ url?: string | null; note?: string }>;
      if (Array.isArray(arr)) {
        arr.forEach((p, i) => {
          if (p && typeof p.url === "string" && p.url.trim()) {
            const noteText = (p.note || "").trim();
            surveyWithNote.push({ url: p.url, label: `รูปที่ ${i + 1}`, note: noteText || undefined });
          }
        });
      }
    } catch { /* malformed JSON — silently skip */ }
  }
  const surveyGallery: PhotoItem[] = [];
  split(lead.survey_photos).forEach((url, i) => surveyGallery.push({ url, label: `รูปสำรวจ ${i + 1}` }));
  pushSub("Survey", "🔍", [
    { title: "รูปตามรายการ", items: surveyChecklist },
    { title: "รูปพร้อมหมายเหตุ", items: surveyWithNote },
    {
      title: "รูปสำรวจอื่นๆ",
      items: surveyGallery,
      uploadField: "survey_photos",
      uploadCurrent: has(lead.survey_photos) ? lead.survey_photos : "",
    },
  ]);

  // (Quote / Order receipts are excluded by request — they belong with the
  // payments view, not the workflow photo gallery.)

  // — Install: split into two subgroups so the original install-step photos
  // stay grouped together, and a separate "เพิ่มเติม" zone gives the user a
  // place to drop ad-hoc post-install pictures from this Photos tab. —
  const installMain: PhotoItem[] = [];
  split(lead.install_photos).forEach((url, i) => installMain.push({ url, label: `รูปติดตั้ง ${i + 1}` }));
  const installExtra: PhotoItem[] = [];
  split(lead.install_photos_extra).forEach((url, i) => installExtra.push({ url, label: `เพิ่มเติม ${i + 1}` }));
  pushSub("Install", "🔧", [
    { title: "รูปติดตั้ง", items: installMain },
    {
      title: "รูปติดตั้งอื่นๆ",
      items: installExtra,
      uploadField: "install_photos_extra",
      uploadCurrent: has(lead.install_photos_extra) ? lead.install_photos_extra : "",
    },
  ]);

  // — Warranty: SN photos + cert/other PDFs (signature excluded). —
  const warranty: PhotoItem[] = [];
  if (has(lead.warranty_inverter_sn_photo_url))   warranty.push({ url: lead.warranty_inverter_sn_photo_url, label: "รูป SN Inverter" });
  if (has(lead.warranty_panel_serials_url))       warranty.push({ url: lead.warranty_panel_serials_url,     label: "รูปแผ่นรวม SN แผง" });
  if (has(lead.warranty_inverter_cert_url))       warranty.push({ url: lead.warranty_inverter_cert_url,     label: "ใบรับประกัน Inverter", pdf: isPdf(lead.warranty_inverter_cert_url) });
  if (has(lead.warranty_panel_cert_url))          warranty.push({ url: lead.warranty_panel_cert_url,        label: "ใบรับประกันแผง",       pdf: isPdf(lead.warranty_panel_cert_url) });
  split(lead.warranty_other_docs_url).forEach((url, i) => warranty.push({ url, label: `เอกสารอื่น ${i + 1}`, pdf: isPdf(url) }));
  const evidenceNo: Record<string, number> = {};
  splitWarrantyEvidence(lead.warranty_evidence_photos).forEach(({ type, url }) => {
    evidenceNo[type] = (evidenceNo[type] ?? 0) + 1;
    warranty.push({ url, label: `${type} · รูปหลักฐาน ${evidenceNo[type]}` });
  });
  push("Warranty", "🛡️", warranty);

  // — GridTie / ขนานไฟ —
  const gridTie: PhotoItem[] = [];
  if (has(lead.grid_application_doc_url))         gridTie.push({ url: lead.grid_application_doc_url, label: "เอกสารยื่นขอขนานไฟ", pdf: isPdf(lead.grid_application_doc_url) });
  if (has(lead.grid_permit_doc_url))              gridTie.push({ url: lead.grid_permit_doc_url, label: "ใบอนุญาตขนานไฟ", pdf: isPdf(lead.grid_permit_doc_url) });
  push("GridTie", "⚡", gridTie);

  return out;
}

export default function PhotosTab({ lead, leadId }: { lead: LeadLike; leadId: number }) {
  // Local mirror of the upload-enabled field values so the UI updates without
  // waiting for a parent refresh. Seeded from the lead row on first render.
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Collapse state. Default: top-level groups open, sub-groups open — keep
  // discoverable on first load. Tracked per (group, optional sub) key.
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => !closed[k];
  const toggle = (k: string) => setClosed(p => ({ ...p, [k]: !p[k] }));

  const merged: LeadLike = { ...lead, ...overrides };
  const groups = buildGroups(merged);

  const onAppend = async (field: string, currentCsv: string, newUrl: string) => {
    const next = [...currentCsv.split(",").map(s => s.trim()).filter(Boolean), newUrl].join(",");
    await apiFetch(`/api/leads/${leadId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: next }),
    });
    setOverrides(prev => ({ ...prev, [field]: next }));
  };

  return (
    <div className="p-4 space-y-1">
      {groups.map((g) => {
        const totalInGroup = (g.items?.length ?? 0) + (g.sub?.reduce((s, sg) => s + sg.items.length, 0) ?? 0);
        const gKey = `g:${g.title}`;
        const gOpen = isOpen(gKey);
        return (
          <section key={g.title} className="border-b border-gray-100 last:border-b-0 pb-2">
            <CollapseHeader
              level="top"
              emoji={g.emoji}
              title={g.title}
              count={totalInGroup}
              open={gOpen}
              onToggle={() => toggle(gKey)}
            />
            {gOpen && (
              <div className="pl-6 pt-2 space-y-3">
                {g.items && <PhotoGrid items={g.items} />}
                {g.sub && g.sub.map((sg) => {
                  const sKey = `g:${g.title}:s:${sg.title}`;
                  const sOpen = isOpen(sKey);
                  return (
                    <div key={sg.title}>
                      <CollapseHeader
                        level="sub"
                        title={sg.title}
                        count={sg.items.length}
                        open={sOpen}
                        onToggle={() => toggle(sKey)}
                      />
                      {sOpen && (
                        <div className="pl-5 pt-2">
                          <PhotoGrid
                            items={sg.items}
                            upload={sg.uploadField ? {
                              onPick: (url) => onAppend(sg.uploadField!, sg.uploadCurrent || "", url),
                            } : undefined}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// Collapse header — chevron + label + count, indented per nesting level.
// Top-level uses the larger emoji + bold title; sub-level is a slimmer
// uppercase muted label (looks like a timeline tier).
function CollapseHeader({ level, emoji, title, count, open, onToggle }: {
  level: "top" | "sub";
  emoji?: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const isTop = level === "top";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2 py-1.5 hover:bg-gray-50 rounded transition-colors text-left ${isTop ? "px-1" : "px-1"}`}
    >
      <svg
        className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
      {emoji && <span className="text-base">{emoji}</span>}
      <span className={isTop ? "text-sm font-bold text-gray-900" : "text-xs font-semibold text-gray-500 uppercase tracking-wider"}>
        {title}
      </span>
      <span className="font-mono tabular-nums text-gray-400 text-xs ml-auto">{count}</span>
    </button>
  );
}

// Reusable grid + lightbox cluster so a section and a sub-section render the
// same way — only differs in whether an upload tile gets appended.
function PhotoGrid({ items, upload }: { items: PhotoItem[]; upload?: { onPick: (url: string) => void | Promise<void> } }) {
  const gallery: LightboxImage[] = items.filter((i) => !i.pdf).map((i) => ({ url: i.url, label: i.label }));
  let imgIdx = 0;
  // Empty READ-ONLY sub-groups get grey placeholder tiles so the section
  // doesn't look broken — the user knows photos belong here but haven't
  // been captured yet. Upload-enabled sub-groups don't need them because
  // the "+ เพิ่มรูป" tile already conveys "drop a photo here".
  const placeholderCount = items.length === 0 && !upload ? 5 : 0;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
      {items.map((it, i) => {
        if (it.pdf) {
          return (
            <a
              key={i}
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="aspect-square rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors flex flex-col items-center justify-center text-center p-2"
            >
              <svg className="w-8 h-8 text-red-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="text-xxs text-gray-600 font-semibold truncate w-full">PDF</span>
              <span className="text-xxs text-gray-400 truncate w-full">{it.label}</span>
            </a>
          );
        }
        const myIdx = imgIdx++;
        return (
          <div key={i} className="space-y-1">
            <FallbackImage
              src={it.url}
              alt={it.label}
              gallery={gallery}
              galleryIndex={myIdx}
              lightboxLabel={it.note || it.label}
              className="w-full aspect-square object-cover rounded-lg bg-gray-100 border border-gray-200 cursor-zoom-in"
              fallbackLabel="โหลดรูปไม่ได้"
            />
            <p className="text-xxs text-gray-500 truncate text-center">{it.label}</p>
            {/* Photo-with-Note: the note text is content, not a label — render
                wrapped so multi-line surveyor remarks read in full. */}
            {it.note && (
              <p className="text-xs text-gray-700 leading-snug break-words bg-gray-50 rounded px-2 py-1 border border-gray-100">
                {it.note}
              </p>
            )}
          </div>
        );
      })}
      {upload && <UploadTile onUploaded={upload.onPick} />}
      {Array.from({ length: placeholderCount }).map((_, i) => (
        <div
          key={`ph-${i}`}
          aria-hidden
          className="aspect-square rounded-lg bg-gray-100/70 border border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          <span className="text-xxs">ไม่มีรูป</span>
        </div>
      ))}
    </div>
  );
}

// Pick → compress → /api/upload → callback with the canonical URL.
function UploadTile({ onUploaded }: { onUploaded: (url: string) => void | Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const inputId = `photo-up-${Math.random().toString(36).slice(2, 8)}`;
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const compressed = await compressSlipFile(file);
      const fd = new FormData();
      fd.append("file", compressed);
      const up = await apiFetch("/api/upload", { method: "POST", body: fd, headers: { ...getUserIdHeader() } }) as { url: string };
      await onUploaded(up.url);
    } catch (e) {
      console.error("upload failed:", e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <input id={inputId} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={onPick} disabled={busy} />
      <label htmlFor={inputId}
        className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
          busy
            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-wait"
            : "border-primary/40 text-primary hover:border-primary hover:bg-primary/5"
        }`}>
        {busy ? (
          <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        ) : (
          <>
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-xxs font-semibold">เพิ่มรูป</span>
          </>
        )}
      </label>
    </>
  );
}
