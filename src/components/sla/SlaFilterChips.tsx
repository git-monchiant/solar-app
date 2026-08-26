"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { SLA_CHIPS, type SlaChip, type SlaFilterKey } from "@/lib/sla-filter";

function SlaFilterChip({ chip, on, count, onToggle }: {
  chip: SlaChip;
  on: boolean;
  count: number;
  onToggle: (key: SlaFilterKey) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onToggle(chip.key)}
      className={`h-7 inline-flex items-center gap-1.5 rounded-full border px-2.5 text-xxs font-semibold whitespace-nowrap transition-colors ${
        on ? chip.on : "border-gray-200 bg-white text-gray-600 hover:border-gray-400"
      }`}
    >
      <span className={`w-3 h-3 rounded border-2 flex items-center justify-center ${on ? chip.tick : "border-gray-300"}`}>
        {on && <CheckIcon className="w-1.5 h-1.5 text-white" strokeWidth={4} />}
      </span>
      {chip.label}
      {/* ยังไม่ติ๊กก็ยังคุมสีของตัวเอง — กวาดตาแถวเดียวรู้ว่าสีไหนคือเรื่องด่วน */}
      <span className={`font-mono tabular-nums font-bold ${on ? "" : chip.num}`}>{count.toLocaleString("th-TH")}</span>
    </button>
  );
}

/**
 * แถวชิปตัวกรอง SLA ที่ Today กับ Pipeline ใช้ร่วมกัน
 *
 * ตัวเลขบนชิปต้องเป็น "จำนวนที่จะเห็นจริงเมื่อกด" ของหน้านั้น ๆ ผู้เรียกจึงเป็น
 * คนนับเองแล้วส่งมาทาง `counts` — สองหน้านับคนละแบบ (Today นับใบที่แสดงเพราะ
 * Lead เดียวโผล่ได้หลายกลุ่ม ส่วน Pipeline เป็น list แบนนับตัว Lead ตรง ๆ)
 *
 * @param trailing ปุ่มที่ต่อท้ายในกรอบเดียวกัน เช่น "ตัวกรองย่อย" ของหน้า Today
 */
export default function SlaFilterChips({ filters, counts, onToggle, trailing }: {
  filters: SlaFilterKey[];
  counts: Record<SlaFilterKey, number>;
  onToggle: (key: SlaFilterKey) => void;
  trailing?: ReactNode;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-xxs font-bold uppercase tracking-wider text-gray-400">SLA</span>
      {SLA_CHIPS.map(chip => (
        <span key={chip.key} className="inline-flex items-center gap-1.5">
          {/* Lead ที่ไม่มี SLA เป็นคนละชุดกับสถานะ SLA — เส้นคั่นบอกว่าเลือกร่วมกันไม่ได้ */}
          {chip.key === "without" && <span aria-hidden className="h-5 w-px bg-gray-200" />}
          <SlaFilterChip chip={chip} on={filters.includes(chip.key)} count={counts[chip.key]} onToggle={onToggle} />
        </span>
      ))}
      {trailing}
    </span>
  );
}
