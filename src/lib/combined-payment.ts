export const COMBINED_EXTRA_MARKER = "รวมค่าใช้จ่ายเพิ่มเติม";

export type CombinedPaymentAllocation = {
  base: number;
  extra: number;
};

const ALLOCATION_PATTERN = /\[base=(\d+(?:\.\d+)?);extra=(\d+(?:\.\d+)?)\]/;

export function parseCombinedPaymentAllocation(description: string | null | undefined): CombinedPaymentAllocation | null {
  const match = ALLOCATION_PATTERN.exec(description || "");
  if (!match) return null;
  const base = Number(match[1]);
  const extra = Number(match[2]);
  return Number.isFinite(base) && Number.isFinite(extra) ? { base, extra } : null;
}

export function combinedPaymentDescription(prefix: string, base: number, extra: number): string {
  return `${prefix} + ${COMBINED_EXTRA_MARKER} [base=${base};extra=${extra}]`;
}
