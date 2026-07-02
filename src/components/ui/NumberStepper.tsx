"use client";

interface NumberStepperProps {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * −/+ stepper for small whole-number fields (counts: panels, occupants, AC
 * units, etc). Matches the form's h-8 / rounded-lg / border-gray-200 input
 * styling so it slots into the same 7-col grid as text inputs.
 *
 * - Decrement past `min` (default 0) clears the value to null (so the field
 *   reads as "empty" rather than 0).
 * - Increment past `max` is blocked. No upper bound when `max` is omitted.
 */
export default function NumberStepper({
  value, onChange, min = 0, max, disabled,
}: NumberStepperProps) {
  const v = typeof value === "number" ? value : 0;
  const canDec = !disabled && v > min;
  const canInc = !disabled && (max == null || v < max);

  return (
    <div className={`flex items-center justify-center gap-1 h-8 rounded-lg border border-gray-200 px-2 ${disabled ? "bg-gray-50" : "bg-white"}`}>
      <button type="button" disabled={!canDec}
        onClick={() => {
          const next = v - 1;
          onChange(next <= min ? null : next);
        }}
        className="w-7 h-7 rounded-md text-gray-600 text-sm font-semibold flex items-center justify-center hover:text-active disabled:opacity-30 disabled:cursor-not-allowed">
        −
      </button>
      <span className={`flex-1 text-center text-sm font-mono tabular-nums ${disabled ? "text-gray-400" : "text-gray-800"}`}>
        {typeof value === "number" ? value : 0}
      </span>
      <button type="button" disabled={!canInc}
        onClick={() => onChange(v + 1)}
        className="w-7 h-7 rounded-md text-gray-600 text-sm font-semibold flex items-center justify-center hover:text-active disabled:opacity-30 disabled:cursor-not-allowed">
        +
      </button>
    </div>
  );
}
