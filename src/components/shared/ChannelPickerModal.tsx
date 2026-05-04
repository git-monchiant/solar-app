"use client";

import { CHANNELS, type ChannelCode } from "@/lib/constants/channels";

// "Where did this customer come from?" picker. Shown before opening the
// prospect/lead create form so the source/channel is set before the user
// touches name/phone fields. Used by seeker (prospect) + today (lead).

interface Props {
  onClose: () => void;
  onPick: (code: ChannelCode) => void;
  title?: string;
}

const channelIcon = (code: ChannelCode) => {
  const cls = "w-6 h-6 text-gray-500";
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
    case "other":
    default:
      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>;
  }
};

export default function ChannelPickerModal({ onClose, onPick, title = "เลือกช่องทาง" }: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-2xl p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-bold text-gray-900 text-center">{title}</div>
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
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
