// Where a prospect originated. Stored as a short code in prospects.channel
// (and leads.source). Order here is the display order of the chip selector
// (grouped by parent: Lead Seeker → LINE OA → Event → Smartify → Web → FB).
// Master list source: docs/lead-master-lists.md §4.
export type ChannelCode =
  | "seeker_senxpm"
  | "seeker_housing"
  | "line_sena"
  | "line_agent"
  | "line_smartify"
  | "event_booth"
  | "smartify_app"
  | "smartify_existing"
  | "smartify_new"
  | "web_sena"
  | "facebook"
  | "fb_smartify"
  | "fb_senx"
  | "google"
  | "referral"
  | "other";

export type ChannelValue = ChannelCode | `other:${string}`;

export const OTHER_CHANNEL_DETAIL_MAX_LENGTH = 14;

export function sanitizeOtherChannelDetail(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, OTHER_CHANNEL_DETAIL_MAX_LENGTH);
}

export function makeOtherChannelValue(detail: string): ChannelValue {
  const cleaned = sanitizeOtherChannelDetail(detail);
  return cleaned ? `other:${cleaned}` : "other";
}

export const CHANNELS: { code: ChannelCode; label: string; color: string }[] = [
  { code: "seeker_senxpm",     label: "Seeker · Sen X PM",       color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { code: "seeker_housing",    label: "Seeker · SENA Housing",   color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { code: "line_sena",         label: "LINE OA · SENA Solar",    color: "bg-green-100 text-green-700 border-green-200" },
  { code: "line_agent",        label: "LINE OA · Solar Agent",   color: "bg-green-100 text-green-700 border-green-200" },
  { code: "line_smartify",     label: "LINE OA · Smartify",      color: "bg-green-100 text-green-700 border-green-200" },
  { code: "event_booth",       label: "Event · ออกบูธ",            color: "bg-orange-100 text-orange-700 border-orange-200" },
  { code: "smartify_app",      label: "Smartify · Application",  color: "bg-violet-100 text-violet-700 border-violet-200" },
  { code: "smartify_existing", label: "Smartify · ลูกค้าเดิม",      color: "bg-violet-100 text-violet-700 border-violet-200" },
  { code: "smartify_new",      label: "Smartify · ลูกค้าใหม่",      color: "bg-violet-100 text-violet-700 border-violet-200" },
  { code: "web_sena",          label: "Website · SenaSolarEnergy", color: "bg-sky-100 text-sky-700 border-sky-200" },
  { code: "facebook",          label: "Facebook",                 color: "bg-blue-100 text-blue-700 border-blue-200" },
  { code: "fb_smartify",       label: "Facebook · Smartify",     color: "bg-blue-100 text-blue-700 border-blue-200" },
  { code: "fb_senx",           label: "Facebook · SenXgroup",    color: "bg-blue-100 text-blue-700 border-blue-200" },
  { code: "google",            label: "Google",                   color: "bg-red-100 text-red-700 border-red-200" },
  { code: "referral",          label: "ลูกค้าแนะนำ",                 color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { code: "other",             label: "อื่นๆ",                     color: "bg-gray-100 text-gray-700 border-gray-200" },
];

export const CHANNEL_BY_CODE: Record<string, { label: string; color: string }> =
  Object.fromEntries(CHANNELS.map((c) => [c.code, { label: c.label, color: c.color }]));
