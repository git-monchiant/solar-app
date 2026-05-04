import { formatSlotsRange } from "@/lib/time-slots";

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);

const fmtLongDate = (iso: string) => {
  // Accept "YYYY-MM-DD" or full ISO — normalize to noon so timezone shifts
  // don't roll the date back one day.
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00");
  return d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

const SURVEY_TIME_LABEL: Record<string, string> = {
  morning: "09:00 - 12:00",
  afternoon: "13:00 - 16:00",
};

// Resolve the legacy "morning/afternoon" label, the JSON array of half-hour
// slots saved by CalendarPicker, or a free-form custom label.
function formatTimeSlot(raw: string): string {
  if (raw in SURVEY_TIME_LABEL) return SURVEY_TIME_LABEL[raw];
  if (raw.trim().startsWith("[")) return formatSlotsRange(raw);
  return raw;
}

interface FlexAppointmentProps {
  origin: string;
  kind: "survey" | "install";       // drives title + accent
  name: string;                      // customer name
  date: string;                      // ISO date / datetime
  timeSlot?: string | null;          // "morning" | "afternoon" | custom label — survey only
  address?: string | null;           // installation address (optional but recommended)
  project?: string | null;           // project/zone name
  packageLabel?: string | null;      // e.g. "5 kWp 3 เฟส + Battery" — install only
  note?: string | null;              // free-form reminder line
  documents?: string[];              // "เอกสารที่ต้องเตรียม" bullet list
  actionLabel?: string;              // default: "ดูรายละเอียด"
  actionUrl?: string;                // optional CTA link (lead detail / confirm page)
  issuedAt?: Date;
}

export function buildAppointmentFlex({
  origin, kind, name, date, timeSlot, address, project, packageLabel, note, documents,
  actionLabel, actionUrl, issuedAt,
}: FlexAppointmentProps) {
  const now = issuedAt ?? new Date();
  const title = kind === "survey" ? "นัดสำรวจพื้นที่" : "นัดติดตั้ง Solar";
  const accent = kind === "survey" ? "#1ed0c7" : "#f97316";
  const timeText = timeSlot ? formatTimeSlot(timeSlot) : null;

  const details: Array<{ label: string; value: string }> = [];
  if (timeText) details.push({ label: "เวลา", value: timeText });
  if (project) details.push({ label: "โครงการ", value: project });
  if (address) details.push({ label: "ที่อยู่", value: address });
  if (packageLabel && kind === "install") details.push({ label: "แพ็คเกจ", value: packageLabel });

  return {
    type: "flex" as const,
    altText: `${title} ${fmtLongDate(date)}${timeText ? ` · ${timeText}` : ""}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px", spacing: "md",
        contents: [
          {
            type: "box", layout: "horizontal", alignItems: "center", spacing: "sm",
            contents: [
              { type: "image", url: `${origin}/logos/logo-sena.png`, size: "md", aspectRatio: "3:1", aspectMode: "fit", flex: 0 },
              { type: "text", text: `  ${title}`, size: "sm", color: accent, weight: "bold" },
            ],
          },
          { type: "text", text: fmtLongDate(date), size: "xl", weight: "bold", color: "#1b1b1b", wrap: true },
          { type: "text", text: name, size: "xs", color: "#999999" },
          { type: "separator", color: "#f0f0f0" },
          ...details.map(d => ({
            type: "box" as const, layout: "horizontal" as const, spacing: "sm" as const,
            contents: [
              { type: "text" as const, text: d.label, size: "xxs" as const, color: "#999999" as const, flex: 0 },
              { type: "text" as const, text: d.value, size: "xs" as const, color: "#333333" as const, align: "end" as const, wrap: true, flex: 1 },
            ],
          })),
          ...(documents && documents.length > 0 ? [
            { type: "separator" as const, color: "#f0f0f0" as const, margin: "sm" as const },
            { type: "text" as const, text: "เอกสารที่ต้องเตรียม", size: "xxs" as const, color: "#999999" as const, weight: "bold" as const, margin: "sm" as const },
            ...documents.map(d => ({
              type: "text" as const, text: `• ${d}`, size: "xxs" as const, color: "#333333" as const, wrap: true,
            })),
            { type: "text" as const, text: "*เอกสารทุกใบต้องเป็นชื่อ-นามสกุลเดียวกัน", size: "xxs" as const, color: "#c2410c" as const, wrap: true, margin: "xs" as const },
          ] : []),
          ...(note ? [{ type: "text" as const, text: note, size: "xxs" as const, color: "#999999" as const, wrap: true, margin: "sm" as const }] : []),
          { type: "text" as const, text: `ส่งเมื่อ ${fmtTime(now)}`, size: "xxs" as const, color: "#b8860b" as const, margin: "sm" as const },
          ...(actionUrl ? [{
            type: "button" as const, style: "primary" as const, color: accent, height: "sm" as const, margin: "md" as const,
            action: { type: "uri" as const, label: actionLabel || "ดูรายละเอียด", uri: actionUrl },
          }] : []),
          { type: "text", text: "Sena Solar Energy", size: "xxs", color: "#cccccc", align: "end" },
        ],
      },
    },
  };
}

interface FlexPaymentProps {
  origin: string;
  title: string;
  amount: number;
  name: string;
  actionLabel: string;
  actionUrl: string;
  details?: { label: string; value: string }[];
  note?: string;
  qrUrl?: string;
  issuedAt?: Date;
}

const fmtTime = (d: Date) => d.toLocaleString("th-TH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

interface FlexWarrantyProps {
  origin: string;
  docNo: string;
  name: string;
  pdfUrl: string;
  periodLabel?: string;
  issuedAt?: Date;
}

interface FlexSurveyResultProps {
  origin: string;
  name: string;
  surveyDate: string;
  recommendedKw?: number | null;
  systemLabel?: string | null;     // e.g. "On Grid", "Solar+Battery"
  panelCount?: number | null;
  packageLabel?: string | null;    // selected package name
  pdfUrl: string;                  // survey PDF endpoint
  note?: string | null;
  issuedAt?: Date;
}

export function buildSurveyResultFlex({
  origin, name, surveyDate, recommendedKw, systemLabel, panelCount, packageLabel, pdfUrl, note, issuedAt,
}: FlexSurveyResultProps) {
  const now = issuedAt ?? new Date();
  const accent = "#1ed0c7";
  const details: Array<{ label: string; value: string }> = [];
  if (recommendedKw != null) details.push({ label: "ขนาดที่แนะนำ", value: `${recommendedKw} kWp` });
  if (systemLabel) details.push({ label: "ระบบ", value: systemLabel });
  if (panelCount != null && panelCount > 0) details.push({ label: "จำนวน Panel", value: `${panelCount} แผง` });
  if (packageLabel) details.push({ label: "แพ็คเกจ", value: packageLabel });

  return {
    type: "flex" as const,
    altText: `ใบสำรวจหน้างาน ${fmtLongDate(surveyDate)}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px", spacing: "md",
        contents: [
          {
            type: "box", layout: "horizontal", alignItems: "center", spacing: "sm",
            contents: [
              { type: "image", url: `${origin}/logos/logo-sena.png`, size: "md", aspectRatio: "3:1", aspectMode: "fit", flex: 0 },
              { type: "text", text: "  ใบสำรวจหน้างาน", size: "sm", color: accent, weight: "bold" },
            ],
          },
          { type: "text", text: fmtLongDate(surveyDate), size: "lg", weight: "bold", color: "#1b1b1b", wrap: true },
          { type: "text", text: name, size: "xs", color: "#999999" },
          { type: "separator", color: "#f0f0f0" },
          ...details.map(d => ({
            type: "box" as const, layout: "horizontal" as const, spacing: "sm" as const,
            contents: [
              { type: "text" as const, text: d.label, size: "xxs" as const, color: "#999999" as const, flex: 0 },
              { type: "text" as const, text: d.value, size: "xs" as const, color: "#333333" as const, align: "end" as const, wrap: true, flex: 1 },
            ],
          })),
          ...(note ? [{ type: "text" as const, text: note, size: "xxs" as const, color: "#999999" as const, wrap: true, margin: "sm" as const }] : []),
          { type: "text" as const, text: `ออกเมื่อ ${fmtTime(now)}`, size: "xxs" as const, color: "#b8860b" as const, margin: "sm" as const },
          {
            type: "button" as const, style: "primary" as const, color: accent, height: "sm" as const, margin: "md" as const,
            action: { type: "uri" as const, label: "ดาวน์โหลดใบสำรวจ", uri: pdfUrl },
          },
          { type: "text", text: "Sena Solar Energy", size: "xxs", color: "#cccccc", align: "end" },
        ],
      },
    },
  };
}

export function buildWarrantyFlex({ origin, docNo, name, pdfUrl, periodLabel, issuedAt }: FlexWarrantyProps) {
  const now = issuedAt ?? new Date();
  return {
    type: "flex" as const,
    altText: `ใบรับประกัน ${docNo}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px", spacing: "md",
        contents: [
          {
            type: "box", layout: "horizontal", alignItems: "center", spacing: "sm",
            contents: [
              { type: "image", url: `${origin}/logos/logo-sena.png`, size: "md", aspectRatio: "3:1", aspectMode: "fit", flex: 0 },
              { type: "text", text: "  ใบรับประกัน", size: "sm", color: "#1ed0c7", weight: "bold" },
            ],
          },
          { type: "text", text: docNo, size: "xl", weight: "bold", color: "#1b1b1b" },
          { type: "text", text: name, size: "xs", color: "#999999" },
          { type: "separator", color: "#f0f0f0" },
          ...(periodLabel ? [{
            type: "box" as const, layout: "horizontal" as const, spacing: "sm" as const,
            contents: [
              { type: "text" as const, text: "ระยะประกัน", size: "xxs" as const, color: "#999999" as const, flex: 0 },
              { type: "text" as const, text: periodLabel, size: "xs" as const, color: "#333333" as const, align: "end" as const, wrap: true, flex: 1 },
            ],
          }] : []),
          { type: "text" as const, text: `ออกเมื่อ ${fmtTime(now)}`, size: "xxs" as const, color: "#b8860b" as const, margin: "sm" as const },
          {
            type: "button" as const, style: "primary" as const, color: "#1ed0c7", height: "sm" as const, margin: "md" as const,
            action: { type: "uri" as const, label: "ดูใบรับประกัน", uri: pdfUrl },
          },
          { type: "text", text: "Sena Solar Energy", size: "xxs", color: "#cccccc", align: "end" },
        ],
      },
    },
  };
}

export function buildPaymentFlex({ origin, title, amount, name, actionLabel, actionUrl, details, note, qrUrl, issuedAt }: FlexPaymentProps) {
  const now = issuedAt ?? new Date();
  return {
    type: "flex" as const,
    altText: `${title} - ${fmt(amount)} บาท`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box", layout: "vertical", paddingAll: "20px", spacing: "md",
        contents: [
          {
            type: "box", layout: "horizontal", alignItems: "center", spacing: "sm",
            contents: [
              { type: "image", url: `${origin}/logos/logo-sena.png`, size: "md", aspectRatio: "3:1", aspectMode: "fit", flex: 0 },
              { type: "text", text: `  ${title}`, size: "sm", color: "#1ed0c7", weight: "bold" },
            ],
          },
          { type: "text", text: `฿ ${fmt(amount)}`, size: "xxl", weight: "bold", color: "#1b1b1b" },
          { type: "text", text: name, size: "xs", color: "#999999" },
          ...(qrUrl ? [{
            type: "image" as const, url: qrUrl, size: "full" as const, aspectRatio: "1:1", aspectMode: "fit" as const,
          }] : []),
          { type: "separator", color: "#f0f0f0" },
          ...(details || []).map(d => ({
            type: "box" as const, layout: "horizontal" as const, spacing: "sm" as const,
            contents: [
              { type: "text" as const, text: d.label, size: "xxs" as const, color: "#999999" as const, flex: 0 },
              { type: "text" as const, text: d.value, size: "xs" as const, color: "#333333" as const, align: "end" as const, wrap: true, flex: 1 },
            ],
          })),
          ...(note ? [{ type: "text" as const, text: note, size: "xxs" as const, color: "#999999" as const, wrap: true }] : []),
          { type: "text" as const, text: `ออกเมื่อ ${fmtTime(now)}`, size: "xxs" as const, color: "#b8860b" as const, margin: "sm" as const },
          ...(actionUrl ? [{
            type: "button" as const, style: "primary" as const, color: "#1ed0c7", height: "sm" as const, margin: "md" as const,
            action: { type: "uri" as const, label: actionLabel, uri: actionUrl },
          }] : []),
          { type: "text", text: "Sena Solar Energy", size: "xxs", color: "#cccccc", align: "end" },
        ],
      },
    },
  };
}
