// Single source of truth for "where did this customer come from" colors.
// Used by lead cards (leads.source) and prospect cards (prospects.channel).
// Normalize first via normalizeSourceKey() — both legacy sheet strings
// ("Sen X PM", "Line OA", "E-Mail") and chip codes ("walk_in", "senxpm")
// resolve to the same canonical key + color.

// Keys align with ChannelCode in src/lib/constants/channels.ts so a single
// label is used everywhere (picker, chip, dashboard). Extra keys (email,
// seeker, plus legacy codes) exist on leads.source / older rows but not on
// the new picker — they stay in the type so old data still renders nicely.
export type SourceKey =
  // 12 active codes from docs/lead-master-lists.md §4
  | "seeker_senxpm" | "seeker_housing"
  | "line_sena" | "line_agent" | "line_smartify"
  | "event_booth"
  | "smartify_app" | "smartify_existing" | "smartify_new"
  | "web_sena"
  | "facebook"
  | "fb_smartify" | "fb_senx"
  | "referral"
  // Catch-all + legacy aliases (older imports that we still need to render)
  | "other"
  | "senxpm" | "walk_in" | "event" | "ads" | "the1"
  | "web" | "refer" | "line_oa" | "email" | "seeker";

export const SOURCE_STYLES: Record<SourceKey, { label: string; cls: string }> = {
  // Active codes — chip hue mirrors channels.ts family grouping
  seeker_senxpm:     { label: "Seeker · Sen X PM",      cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  seeker_housing:    { label: "Seeker · SENA Housing",  cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  line_sena:         { label: "LINE OA · SENA Solar",   cls: "bg-green-50 text-green-700 ring-green-200" },
  line_agent:        { label: "LINE OA · Solar Agent",  cls: "bg-green-50 text-green-700 ring-green-200" },
  line_smartify:     { label: "LINE OA · Smartify",     cls: "bg-green-50 text-green-700 ring-green-200" },
  event_booth:       { label: "Event · ออกบูธ",           cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  smartify_app:      { label: "Smartify · Application", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  smartify_existing: { label: "Smartify · ลูกค้าเดิม",     cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  smartify_new:      { label: "Smartify · ลูกค้าใหม่",     cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  web_sena:          { label: "Website · SenaSolarEnergy", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  facebook:          { label: "Facebook",               cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  fb_smartify:       { label: "Facebook · Smartify",    cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  fb_senx:           { label: "Facebook · SenXgroup",   cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  referral:          { label: "ลูกค้าแนะนำ",              cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  // Catch-all + legacy aliases (kept so older leads.source values still render)
  other:    { label: "อื่นๆ",      cls: "bg-gray-100 text-gray-600 ring-gray-200" },
  senxpm:   { label: "SenXPM",   cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  walk_in:  { label: "Walk-in",  cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  event:    { label: "Event",    cls: "bg-purple-50 text-purple-700 ring-purple-200" },
  ads:      { label: "Ads",      cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  the1:     { label: "The1",     cls: "bg-pink-50 text-pink-700 ring-pink-200" },
  web:      { label: "Web",      cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  refer:    { label: "มีคนแนะนำ",    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  line_oa:  { label: "LINE OA",  cls: "bg-green-50 text-green-700 ring-green-200" },
  email:    { label: "Email",    cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  seeker:   { label: "Seeker",   cls: "bg-teal-50 text-teal-700 ring-teal-200" },
};

export function normalizeSourceKey(raw: string | null | undefined): SourceKey {
  if (!raw) return "other";
  const v = raw.trim().toLowerCase();
  if (v.startsWith("other:")) return "other";
  // 12 active codes — match the exact slug stored by the new picker first.
  const compactKey = v.replace(/[\s·-]+/g, "_");
  if (compactKey in SOURCE_STYLES) return compactKey as SourceKey;
  // Fuzzy fallback for legacy / free-text source strings (sheet imports etc).
  if (/line.*oa.*smartify|smartify.*line/.test(v)) return "line_smartify";
  if (/line.*oa.*agent|solar.?agent/.test(v)) return "line_agent";
  if (/line.*oa.*sena|sena.*line/.test(v)) return "line_sena";
  if (/seeker.*housing|housing.*sale/.test(v)) return "seeker_housing";
  if (/seeker.*sen.?x|sen.?x.*seeker/.test(v)) return "seeker_senxpm";
  if (/event.*บูธ|ออกบูธ/.test(v)) return "event_booth";
  if (/smartify.*application|application.*smartify/.test(v)) return "smartify_app";
  if (/smartify.*เดิม/.test(v)) return "smartify_existing";
  if (/smartify.*ใหม่/.test(v)) return "smartify_new";
  if (/website.*sena|senasolarenergy/.test(v)) return "web_sena";
  if (/^facebook$|^fb$/.test(v)) return "facebook";
  if (/facebook.*smartify|fb.*smartify/.test(v)) return "fb_smartify";
  if (/facebook.*senx|fb.*senx/.test(v)) return "fb_senx";
  // Legacy single-word matches
  if (/sen.?x.?pm|senxpm|senx pm/.test(v)) return "senxpm";
  if (/walk.?in/.test(v)) return "walk_in";
  if (/^event$/.test(v)) return "event";
  if (/^ads?$|advert|google.?ads|facebook/.test(v)) return "ads";
  if (/the.?1/.test(v)) return "the1";
  if (/^web$|website/.test(v)) return "web";
  // New canonical `referral` first — the legacy `refer` bucket is kept only
  // for rows that were saved before this code was introduced.
  if (/referral|ลูกค้านอก|แนะนำ/.test(v)) return "referral";
  if (/^refer$/.test(v)) return "refer";
  if (/^email$|e-?mail|gmail/.test(v)) return "email";
  if (/line.?oa|^line$/.test(v)) return "line_oa";
  if (/seeker/.test(v)) return "seeker";
  return "other";
}

export function getOtherSourceDetail(raw: string | null | undefined) {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith("other:")) return "";
  return trimmed.slice(trimmed.indexOf(":") + 1).trim();
}

export function getSourceStyle(raw: string | null | undefined) {
  const style = SOURCE_STYLES[normalizeSourceKey(raw)];
  const detail = getOtherSourceDetail(raw);
  return detail ? { ...style, label: `${style.label}: ${detail}` } : style;
}
