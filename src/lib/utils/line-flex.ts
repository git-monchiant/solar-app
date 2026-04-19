const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);

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
          ...(!qrUrl ? [{
            type: "button" as const, style: "primary" as const, color: "#1ed0c7", height: "sm" as const, margin: "md" as const,
            action: { type: "uri" as const, label: actionLabel, uri: actionUrl },
          }] : []),
          { type: "text", text: "Sena Solar Energy", size: "xxs", color: "#cccccc", align: "end" },
        ],
      },
    },
  };
}
