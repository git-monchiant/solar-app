// Half-hour survey/install slots. Stored on leads.survey_time_slot and
// install_time_slot as a JSON array of these codes — e.g. ["09:00","09:30"].
// Legacy single-string values ("morning","afternoon","am","pm") still appear
// in older rows; parseSlots() normalizes both formats.
export const HOURLY_SLOTS = [
  "09:00", "09:30",
  "10:00", "10:30",
  "11:00", "11:30",
  "12:00", "12:30",
  "13:00", "13:30",
  "14:00", "14:30",
  "15:00", "15:30",
] as const;

const LEGACY_MAP: Record<string, string[]> = {
  morning: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"],
  am: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"],
  afternoon: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"],
  pm: ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"],
};

/** Parse a stored time_slot value into a list of canonical half-hour codes. */
export function parseSlots(value: string | null | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  // JSON array form (the new canonical format).
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === "string");
    } catch { /* fall through to legacy parsing */ }
  }
  // Legacy single string — "morning"/"afternoon"/"am"/"pm" expand to a span.
  const lower = trimmed.toLowerCase();
  if (LEGACY_MAP[lower]) return LEGACY_MAP[lower];
  // Already a half-hour code (e.g. "09:00") — return as-is.
  return [trimmed];
}

/** Serialize a list of half-hour codes back to the JSON form stored in DB. */
export function serializeSlots(slots: string[]): string | null {
  if (slots.length === 0) return null;
  return JSON.stringify(slots);
}

/** Add 30 minutes to a "HH:MM" code. */
function nextHalfHour(t: string): string {
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr);
  let m = parseInt(mStr) + 30;
  if (m >= 60) { h += 1; m -= 60; }
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Render a single slot code as its half-hour range — "09:00" → "09:00-09:30". */
export function slotLabel(code: string): string {
  return `${code}-${nextHalfHour(code)}`;
}

/** Pretty label like "09:00 - 10:00, 13:00 - 14:00" for display.
 * Contiguous half-hour slots are merged into a single range. */
export function formatSlotsRange(value: string | null | undefined): string {
  const slots = parseSlots(value);
  if (slots.length === 0) return "";
  const sorted = [...slots].sort();
  const ranges: string[] = [];
  let runStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === nextHalfHour(prev)) {
      prev = sorted[i];
    } else {
      ranges.push(`${runStart} - ${nextHalfHour(prev)}`);
      runStart = sorted[i];
      prev = sorted[i];
    }
  }
  ranges.push(`${runStart} - ${nextHalfHour(prev)}`);
  return ranges.join(", ");
}
