"use client";
import { useState } from "react";
import { BoltIcon, LineIcon } from "@/components/ui/icons";

import { CHANNELS, makeOtherChannelValue, sanitizeOtherChannelDetail, type ChannelCode, type ChannelValue } from "@/lib/constants/channels";
import ModalBase from "@/components/ui/ModalBase";

// "Where did this customer come from?" picker. Shown before opening the
// prospect/lead create form so the source/channel is set before the user
// touches name/phone fields. Used by seeker (prospect) + today (lead).

interface Props {
  onClose: () => void;
  onPick: (code: ChannelValue) => void;
  title?: string;
}

// Each channel is grouped by parent family. The icon comes from the parent
// (e.g. all LINE OA · X share the LINE glyph), the colour follows the chip
// hue defined in CHANNELS. Sub-label trims the "Parent · " prefix.
type Family = "seeker" | "line" | "event" | "smartify" | "web" | "fb" | "google" | "referral" | "other";
const FAMILY_BY_CODE: Record<ChannelCode, Family> = {
  seeker_senxpm: "seeker", seeker_housing: "seeker",
  line_sena: "line", line_agent: "line", line_smartify: "line",
  event_booth: "event",
  smartify_app: "smartify", smartify_existing: "smartify", smartify_new: "smartify",
  web_sena: "web",
  facebook: "fb",
  fb_smartify: "fb", fb_senx: "fb",
  google: "google",
  referral: "referral",
  other: "other",
};
const FAMILY_TINT: Record<Family, string> = {
  seeker: "text-indigo-600",
  line: "text-[#06C755]",
  event: "text-orange-500",
  smartify: "text-violet-600",
  web: "text-sky-500",
  fb: "text-blue-600",
  google: "text-red-600",
  referral: "text-emerald-600",
  other: "text-gray-500",
};

const HIDDEN_PICKER_CHANNELS = new Set<ChannelCode>([
  "line_smartify",
  "smartify_app",
  "smartify_existing",
  "smartify_new",
  "fb_smartify",
  "fb_senx",
]);

const channelIcon = (code: ChannelCode) => {
  const family = FAMILY_BY_CODE[code];
  const cls = `w-6 h-6 ${FAMILY_TINT[family]}`;
  switch (family) {
    case "seeker":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
    case "line":
      return <LineIcon className={cls} />;
    case "event":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M11 12h2" /></svg>;
    case "smartify":
      return <BoltIcon className={cls} strokeWidth={1.8} />;
    case "web":
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0 0a8.949 8.949 0 004.5-1.207m-9 0A8.949 8.949 0 0012 21M3.6 9h16.8M3.6 15h16.8M11.99 3a17 17 0 00-3.5 9 17 17 0 003.5 9m.02-18a17 17 0 013.5 9 17 17 0 01-3.5 9" /></svg>;
    case "fb":
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>;
    case "google":
      // Google "G" mark
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z" /></svg>;
    case "referral":
      // Two-people / handshake glyph — reads as "someone brought this lead"
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>;
    case "other":
    default:
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
  }
};

export default function ChannelPickerModal({ onClose, onPick, title = "เลือกช่องทาง" }: Props) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const cleanedOtherText = sanitizeOtherChannelDetail(otherText);
  const pickOther = () => onPick(makeOtherChannelValue(otherText));

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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {CHANNELS.filter((ch) => !HIDDEN_PICKER_CHANNELS.has(ch.code)).map((ch) => (
          <button
            key={ch.code}
            type="button"
            onClick={() => ch.code === "other" ? setOtherOpen(true) : onPick(ch.code)}
            className="h-12 rounded-xl border border-gray-200 bg-white inline-flex items-center justify-start gap-2 px-3 text-sm font-semibold text-gray-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors text-left"
          >
            <span className="shrink-0">{channelIcon(ch.code)}</span>
            <span className="truncate min-w-0">{ch.label}</span>
          </button>
        ))}
      </div>
      {otherOpen && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">ระบุช่องทางอื่นๆ</label>
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") pickOther();
              }}
              maxLength={14}
              placeholder="เช่น TikTok"
              className="min-w-0 flex-1 h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={pickOther}
              className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-semibold"
            >
              เลือก
            </button>
          </div>
          {otherText !== cleanedOtherText && (
            <div className="mt-1 text-xxs text-gray-400">ระบบจะบันทึกเป็น: {cleanedOtherText || "อื่นๆ"}</div>
          )}
        </div>
      )}
    </ModalBase>
  );
}
