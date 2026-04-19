"use client";

import LeadCard, { LeadData } from "./LeadCard";
import { STATUSES, STATUS_CONFIG } from "@/lib/constants/statuses";

interface Props {
  leads: LeadData[];
  /** ถ้า provide statuses จะ filter เฉพาะ status เหล่านี้, ถ้าไม่ใส่จะใช้ทุก status รวม lost */
  statuses?: string[];
  emptyText?: string;
  emptyHint?: string;
}

export default function LeadGroupList({ leads, statuses, emptyText = "ไม่พบรายการ", emptyHint }: Props) {
  const order = statuses || ([...STATUSES, "lost"] as string[]);
  const grouped = order
    .map((s) => ({
      status: s,
      config: STATUS_CONFIG[s],
      leads: leads.filter((l) => l.status === s),
    }))
    .filter((g) => g.leads.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-sm font-medium">{emptyText}</div>
        {emptyHint && <div className="text-xs mt-1">{emptyHint}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map((g) => (
        <section key={g.status}>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className={`text-xs font-bold tracking-wider uppercase ${g.config.text}`}>
              {g.config.label}
            </h2>
            <span className={`text-xs font-semibold ${g.config.text} ${g.config.bg} px-2 py-0.5 rounded-full`}>
              {g.leads.length}
            </span>
          </div>
          <div className="space-y-3">
            {g.leads.map((l) => <LeadCard key={l.id} lead={l} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
