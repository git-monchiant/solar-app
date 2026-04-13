import { ActivityType } from "./AddActivityModal";

interface Props {
  leadId: number;
  onAddActivity: (type: ActivityType) => void;
}

export default function QuickActionBar({ onAddActivity }: Props) {
  return (
    <div className="fixed left-0 right-0 md:left-64 above-nav bg-white border-t border-gray-200 z-40 px-3 py-2">
      <div className="flex items-center gap-2">
        <button onClick={() => onAddActivity("note")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-light text-sm font-semibold active:bg-gray-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
          Note
        </button>

        <button onClick={() => onAddActivity("follow_up")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold active:bg-amber-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Follow-up
        </button>
      </div>
    </div>
  );
}
