"use client";

import { CHANNELS, type ChannelCode } from "@/lib/constants/channels";
import ModalBase from "@/components/ui/ModalBase";

// "Where did this customer come from?" picker. Shown before opening the
// prospect/lead create form so the source/channel is set before the user
// touches name/phone fields. Used by seeker (prospect) + today (lead).

interface Props {
  onClose: () => void;
  onPick: (code: ChannelCode) => void;
  title?: string;
}

// Each channel renders in its own color (matches the chip hues used by
// SourceTag) so the picker grid feels visually consistent with where these
// tags appear elsewhere in the app.
const COLOR_BY_CODE: Record<ChannelCode, string> = {
  senxpm:  "text-indigo-600",
  walk_in: "text-emerald-600",
  event:   "text-orange-500",
  ads:     "text-rose-500",
  the1:    "text-red-500",
  web:     "text-sky-500",
  line_oa: "text-[#06C755]",
  refer:   "text-amber-600",
  other:   "text-gray-500",
};

const channelIcon = (code: ChannelCode) => {
  const cls = `w-6 h-6 ${COLOR_BY_CODE[code]}`;
  switch (code) {
    case "senxpm":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>;
    case "walk_in":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM10.5 9.5l-2.5 5L6 17m4.5-7.5l2 2.5 2 1.5m-4-4l2 7 1 4m0 0l4-2" /></svg>;
    case "event":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M11 12h2" /></svg>;
    case "ads":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 3.94c-.16.46-.45.86-.83 1.16l-3.18 2.55a1.5 1.5 0 00-.56 1.17V14a1.5 1.5 0 00.56 1.17l3.18 2.55c.38.3.67.7.83 1.16l.78 2.27a1.5 1.5 0 002.84 0l.78-2.27c.16-.46.45-.86.83-1.16l3.18-2.55c.35-.28.56-.71.56-1.17V8.82c0-.46-.21-.89-.56-1.17l-3.18-2.55a2.5 2.5 0 01-.83-1.16l-.78-2.27a1.5 1.5 0 00-2.84 0l-.78 2.27z" /></svg>;
    case "the1":
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>;
    case "web":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a8.949 8.949 0 004.5-1.207m-9 0A8.949 8.949 0 0012 21M3.6 9h16.8M3.6 15h16.8M11.99 3a17 17 0 00-3.5 9 17 17 0 003.5 9m.02-18a17 17 0 013.5 9 17 17 0 01-3.5 9" /></svg>;
    case "refer":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /></svg>;
    case "line_oa":
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>;
    case "other":
    default:
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
  }
};

export default function ChannelPickerModal({ onClose, onPick, title = "เลือกช่องทาง" }: Props) {
  return (
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </span>
          <span>{title}</span>
        </div>
      }
      onClose={onClose}
      size="md"
    >
      <div className="grid grid-cols-2 gap-2">
        {CHANNELS.map((ch) => (
          <button
            key={ch.code}
            type="button"
            onClick={() => onPick(ch.code)}
            className="h-12 rounded-xl border border-gray-200 bg-white inline-flex items-center justify-start gap-2 px-3 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
          >
            {channelIcon(ch.code)}
            {ch.label}
          </button>
        ))}
      </div>
    </ModalBase>
  );
}
