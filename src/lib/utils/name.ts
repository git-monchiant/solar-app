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
