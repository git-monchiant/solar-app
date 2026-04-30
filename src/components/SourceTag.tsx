import { getSourceStyle } from "@/lib/source-tag";

// Small chip that renders consistently for lead.source and prospect.channel
// across the app. Pass the raw DB value — normalization happens internally.
export default function SourceTag({ value, size = "sm" }: { value: string | null | undefined; size?: "xs" | "sm" }) {
  if (!value) return null;
  const style = getSourceStyle(value);
  const sizeCls = size === "xs"
    ? "px-1.5 py-0.5 text-[10px]"
    : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center rounded font-bold uppercase tracking-wider ring-1 ring-inset ${sizeCls} ${style.cls}`}>
      {style.label}
    </span>
  );
}
