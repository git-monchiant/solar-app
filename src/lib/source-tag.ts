// Single source of truth for "where did this customer come from" colors.
// Used by lead cards (leads.source) and prospect cards (prospects.channel).
// Normalize first via normalizeSourceKey() — both legacy sheet strings
// ("Sen X PM", "Line OA", "E-Mail") and chip codes ("walk-in", "senxpm")
// resolve to the same canonical key + color.

export type SourceKey =
  | "senxpm" | "walk_in" | "event" | "ads" | "the1"
  | "web" | "refer" | "email" | "line" | "seeker" | "other";

export const SOURCE_STYLES: Record<SourceKey, { label: string; cls: string }> = {
  senxpm:  { label: "SENX PM",  cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  walk_in: { label: "Walk-in",  cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  event:   { label: "Event",    cls: "bg-purple-50 text-purple-700 ring-purple-200" },
  ads:     { label: "Ads",      cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  the1:    { label: "The1",     cls: "bg-pink-50 text-pink-700 ring-pink-200" },
  web:     { label: "Web",      cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  refer:   { label: "Refer",    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  email:   { label: "Email",    cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  line:    { label: "LINE",     cls: "bg-green-50 text-green-700 ring-green-200" },
  seeker:  { label: "Seeker",   cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  other:   { label: "Other",    cls: "bg-gray-100 text-gray-600 ring-gray-200" },
};

export function normalizeSourceKey(raw: string | null | undefined): SourceKey {
  if (!raw) return "other";
  const v = raw.trim().toLowerCase();
  if (/sen.?x.?pm|senxpm|senx pm/.test(v)) return "senxpm";
  if (/walk.?in/.test(v)) return "walk_in";
  if (/event/.test(v)) return "event";
  if (/^ads?$|advert|google.?ads|facebook/.test(v)) return "ads";
  if (/the.?1/.test(v)) return "the1";
  if (/^web$|website/.test(v)) return "web";
  if (/refer|ลูกค้านอก|แนะนำ/.test(v)) return "refer";
  if (/^email$|e-?mail|gmail/.test(v)) return "email";
  if (/line|smartify/.test(v)) return "line";
  if (/seeker/.test(v)) return "seeker";
  const compact = v.replace(/[\s-]/g, "_");
  if (compact in SOURCE_STYLES) return compact as SourceKey;
  return "other";
}

export function getSourceStyle(raw: string | null | undefined) {
  return SOURCE_STYLES[normalizeSourceKey(raw)];
}
