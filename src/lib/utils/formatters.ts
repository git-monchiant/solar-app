// Shared formatters — date / currency / phone / Thai ID.
// Replaces ad-hoc helpers scattered across pages and components.

type DateLike = Date | string | number | null | undefined;

function parseDate(d: DateLike, dateOnly: boolean): Date | null {
  if (d == null || d === "") return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const s = String(d);
  if (dateOnly && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    // Pin to local noon so SQL date strings don't slip a day in non-UTC zones.
    const parsed = new Date(s.slice(0, 10) + "T12:00:00");
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

const DASH = "—";

// — Currency ————————————————————————————————————————————

const fmtTHB0 = new Intl.NumberFormat("th-TH");
const fmtTHB2 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEN0 = new Intl.NumberFormat("en-US");
const fmtEN2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatTHB(n: number | null | undefined, opts?: { decimals?: 0 | 2; locale?: "th-TH" | "en-US" }): string {
  if (n == null || isNaN(n)) return DASH;
  const decimals = opts?.decimals ?? 0;
  const locale = opts?.locale ?? "th-TH";
  if (locale === "en-US") return decimals === 2 ? fmtEN2.format(n) : fmtEN0.format(n);
  return decimals === 2 ? fmtTHB2.format(n) : fmtTHB0.format(n);
}

export function formatNumber(n: number | null | undefined, locale: "th-TH" | "en-US" = "th-TH"): string {
  if (n == null || isNaN(n)) return DASH;
  return locale === "en-US" ? fmtEN0.format(n) : fmtTHB0.format(n);
}

// — Date / Time —————————————————————————————————————————

type ThaiDateOpts = {
  weekday?: boolean;
  year?: boolean;
  monthLong?: boolean;
  time?: boolean;
  buddhist?: boolean;
};

export function formatThaiDate(d: DateLike, opts: ThaiDateOpts = {}): string {
  const date = parseDate(d, !opts.time);
  if (!date) return DASH;
  const { weekday = false, year = true, monthLong = false, time = false, buddhist = false } = opts;
  const locale = buddhist ? "th-TH-u-ca-buddhist" : "th-TH";
  const fmt: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: monthLong ? "long" : "short",
  };
  if (weekday) fmt.weekday = "short";
  if (year) fmt.year = "numeric";
  let out = date.toLocaleDateString(locale, fmt);
  if (time) {
    out += ", " + date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  }
  return out;
}

export function formatThaiDateShort(d: DateLike): string {
  return formatThaiDate(d, { year: false });
}

export function formatThaiTime(d: DateLike): string {
  const date = parseDate(d, false);
  if (!date) return DASH;
  return date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function formatThaiMonthYear(d: DateLike): string {
  const date = parseDate(d, true);
  if (!date) return DASH;
  return date.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}

export function formatThaiWeekday(d: DateLike): string {
  const date = parseDate(d, true);
  if (!date) return DASH;
  return date.toLocaleDateString("th-TH", { weekday: "short" });
}

// — Phone / Thai ID —————————————————————————————————————

export function formatPhone(s: string | null | undefined): string {
  if (!s) return DASH;
  const digits = String(s).replace(/\D/g, "");
  if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  if (digits.length === 9) return digits.replace(/(\d{2})(\d{3})(\d{4})/, "$1-$2-$3");
  return s;
}

export function formatThaiId(s: string | null | undefined): string {
  if (!s) return DASH;
  const digits = String(s).replace(/\D/g, "");
  if (digits.length === 13) return digits.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, "$1-$2-$3-$4-$5");
  return s;
}
