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
}

export function buildPaymentFlex({ origin, title, amount, name, actionLabel, actionUrl, details, note, qrUrl }: FlexPaymentProps) {
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
              { type: "image", url: `${origin}/logo-sena.png`, size: "md", aspectRatio: "3:1", aspectMode: "fit", flex: 0 },
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
            type: "box" as const, layout: "horizontal" as const,
            contents: [
              { type: "text" as const, text: d.label, size: "xxs" as const, color: "#999999" as const, flex: 3 },
              { type: "text" as const, text: d.value, size: "xxs" as const, color: "#555555" as const, align: "end" as const, flex: 2 },
            ],
          })),
          ...(note ? [{ type: "text" as const, text: note, size: "xxs" as const, color: "#999999" as const, wrap: true }] : []),
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
