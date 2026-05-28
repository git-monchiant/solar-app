import { LineIcon } from "@/components/ui/icons";
import { getSourceStyle, normalizeSourceKey, type SourceKey } from "@/lib/source-tag";

// Inline channel glyphs — kept tiny (12px) so they fit alongside the label
// inside the chip. The chip itself already carries the channel color, so the
// icon stays monochrome (currentColor) and inherits that tone.
function ChannelIcon({ k, className }: { k: SourceKey; className: string }) {
  switch (k) {
    case "senxpm":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>;
    case "walk_in":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM10.5 9.5l-2.5 5L6 17m4.5-7.5l2 2.5 2 1.5m-4-4l2 7 1 4m0 0l4-2" /></svg>;
    case "event":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M11 12h2" /></svg>;
    case "ads":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 3.94c-.16.46-.45.86-.83 1.16l-3.18 2.55a1.5 1.5 0 00-.56 1.17V14a1.5 1.5 0 00.56 1.17l3.18 2.55c.38.3.67.7.83 1.16l.78 2.27a1.5 1.5 0 002.84 0l.78-2.27c.16-.46.45-.86.83-1.16l3.18-2.55c.35-.28.56-.71.56-1.17V8.82c0-.46-.21-.89-.56-1.17l-3.18-2.55a2.5 2.5 0 01-.83-1.16l-.78-2.27a1.5 1.5 0 00-2.84 0l-.78 2.27z" /></svg>;
    case "the1":
      return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>;
    case "web":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a8.949 8.949 0 004.5-1.207m-9 0A8.949 8.949 0 0012 21M3.6 9h16.8M3.6 15h16.8M11.99 3a17 17 0 013.5 9 17 17 0 01-3.5 9" /></svg>;
    case "refer":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
    case "line_oa":
      return <LineIcon className={className} />;
    case "email":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>;
    case "seeker":
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>;
    case "other":
    default:
      return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
  }
}

// Small chip that renders consistently for lead.source and prospect_source
// (or any tag entry) across the app. Pass the raw DB value — normalization
// happens internally.
export default function SourceTag({ value, size = "sm" }: { value: string | null | undefined; size?: "xs" | "sm" }) {
  if (!value) return null;
  const style = getSourceStyle(value);
  const key = normalizeSourceKey(value);
  const sizeCls = size === "xs"
    ? "px-1.5 py-0.5 text-xxs gap-1"
    : "px-2 py-0.5 text-xxs gap-1";
  const iconCls = size === "xs" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <span className={`inline-flex items-center rounded-full font-bold uppercase tracking-wider ring-1 ring-inset ${sizeCls} ${style.cls}`}>
      <ChannelIcon k={key} className={iconCls} />
      {style.label}
    </span>
  );
}
