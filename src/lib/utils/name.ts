// Strip Thai honorifics from the start of a name so UI header labels read
// cleanly (e.g. "คุณเชนิสา มัณยานนท์" → "เชนิสา มัณยานนท์"). The raw value is
// left untouched in the DB — this is a display-only helper. Longer prefixes
// first so "นางสาว" matches before "นาง".
export function stripThaiTitle(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .replace(/^(นางสาว|นาง|นาย|น\.ส\.?|ด\.ช\.?|ด\.ญ\.?|คุณ)\s*/u, "")
    .trim();
}

// Legacy leads store a literal "-" in house_number when the address wasn't
// captured. `lead.house_number` is truthy for a string of dashes, so the
// naïve `x ? "${x} - ${y}" : y` template renders "- - name". This helper
// collapses any dash-only / whitespace value to null so display templates
// can guard cleanly on presence.
export function houseNumberOrNull(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  if (/^-+$/.test(t)) return null;
  return t;
}
