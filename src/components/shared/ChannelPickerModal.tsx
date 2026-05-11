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

// Each channel is grouped by parent family. The icon comes from the parent
// (e.g. all LINE OA · X share the LINE glyph), the colour follows the chip
// hue defined in CHANNELS. Sub-label trims the "Parent · " prefix.
type Family = "seeker" | "line" | "event" | "smartify" | "web" | "fb" | "other";
const FAMILY_BY_CODE: Record<ChannelCode, Family> = {
  seeker_senxpm: "seeker", seeker_housing: "seeker",
  line_sena: "line", line_agent: "line", line_smartify: "line",
  event_booth: "event",
  smartify_app: "smartify", smartify_existing: "smartify", smartify_new: "smartify",
  web_sena: "web",
  fb_smartify: "fb", fb_senx: "fb",
  other: "other",
};
const FAMILY_TINT: Record<Family, string> = {
  seeker: "text-indigo-600",
  line: "text-[#06C755]",
  event: "text-orange-500",
  smartify: "text-violet-600",
  web: "text-sky-500",
  fb: "text-blue-600",
  other: "text-gray-500",
};

const channelIcon = (code: ChannelCode) => {
  const family = FAMILY_BY_CODE[code];
  const cls = `w-6 h-6 ${FAMILY_TINT[family]}`;
  switch (family) {
    case "seeker":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
    case "line":
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>;
    case "event":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M11 12h2" /></svg>;
    case "smartify":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>;
    case "web":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a8.949 8.949 0 004.5-1.207m-9 0A8.949 8.949 0 0012 21M3.6 9h16.8M3.6 15h16.8M11.99 3a17 17 0 00-3.5 9 17 17 0 003.5 9m.02-18a17 17 0 013.5 9 17 17 0 01-3.5 9" /></svg>;
    case "fb":
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>;
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
