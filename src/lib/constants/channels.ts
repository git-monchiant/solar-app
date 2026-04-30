// Where a prospect originated. Stored as a short code in prospects.channel.
// Order here is the display order of the chip selector (most-common first).
export type ChannelCode = "senxpm" | "walk_in" | "event" | "ads" | "the1" | "web" | "refer" | "other";

export const CHANNELS: { code: ChannelCode; label: string; color: string }[] = [
  { code: "senxpm",  label: "SenXPM",      color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { code: "walk_in", label: "Walk-in",     color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { code: "event",   label: "Event",       color: "bg-orange-100 text-orange-700 border-orange-200" },
  { code: "ads",     label: "Ads",         color: "bg-rose-100 text-rose-700 border-rose-200" },
  { code: "the1",    label: "The1",        color: "bg-red-100 text-red-700 border-red-200" },
  { code: "web",     label: "Web",         color: "bg-sky-100 text-sky-700 border-sky-200" },
  { code: "refer",   label: "แนะนำต่อ",     color: "bg-amber-100 text-amber-700 border-amber-200" },
  { code: "other",   label: "อื่นๆ",         color: "bg-gray-100 text-gray-700 border-gray-200" },
];

export const CHANNEL_BY_CODE: Record<string, { label: string; color: string }> =
  Object.fromEntries(CHANNELS.map((c) => [c.code, { label: c.label, color: c.color }]));
