"use client";

import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

interface Props extends StepCommonProps {
  onAddActivity: (type: string) => void;
}

export default function SurveyStep({ lead, state, refresh, onAddActivity }: Props) {
  const markDone = async () => {
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "quoted" }),
    });
    refresh();
  };

  if (state === "done") {
    return <div className="text-sm text-emerald-700">Site survey completed</div>;
  }

  if (state !== "active") return null;

  return (
    <div className="space-y-2">
      {lead.survey_date ? (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-violet-50 border border-violet-600/15">
          <svg className="w-3.5 h-3.5 text-violet-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <div className="flex-1 flex items-baseline gap-1.5">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-violet-600/70">Scheduled</span>
            <span className="text-sm font-semibold text-violet-900">{formatDate(lead.survey_date)}</span>
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-500">Schedule and complete site survey</div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onAddActivity("follow_up")}
          className="flex-1 rounded-md text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors"
        >
          Reschedule
        </button>
        <button
          onClick={markDone}
          className="flex-1 rounded-md text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 transition-colors"
        >
          Mark Done
        </button>
      </div>
    </div>
  );
}
