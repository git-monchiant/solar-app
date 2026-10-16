import { stageLabel, stageTone, subLabel } from "@/lib/b2b/project";

// ป้ายขั้นโครงการ — ชุดเดียวกันทั้งหน้ารายการ / กระดาน / หัวหน้าโครงการ
export default function StageBadge({ stage, sub, surveyDate, className = "" }: {
  stage: number; sub: number | null; surveyDate: string | null; className?: string;
}) {
  const s = subLabel(stage, sub, surveyDate);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${stageTone(stage)} ${className}`}>
      {stageLabel(stage)}{s ? ` · ${s}` : ""}
    </span>
  );
}
