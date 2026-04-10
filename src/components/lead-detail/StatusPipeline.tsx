import { STATUSES, STATUS_CONFIG } from "@/lib/statuses";

interface Props {
  currentStatus: string;
  onChangeStatus: (status: string) => void;
}

export default function StatusPipeline({ currentStatus, onChangeStatus }: Props) {
  const currentIdx = STATUSES.indexOf(currentStatus as typeof STATUSES[number]);
  const isLost = currentStatus === "lost";

  return (
    <div className="bg-white px-4 py-3 border-b border-gray-100">
      <div className="flex items-center">
        {STATUSES.map((s, i) => {
          const isPast = !isLost && i < currentIdx;
          const isCurrent = !isLost && i === currentIdx;
          const config = STATUS_CONFIG[s];

          return (
            <div key={s} className="flex items-center flex-1 last:flex-none">
              <button onClick={() => onChangeStatus(s)}
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all text-[10px] font-bold ${
                  isCurrent ? `${config.color} text-white ring-2 ring-offset-1 ring-${config.color}` :
                  isPast ? `${config.color} text-white` :
                  "bg-gray-200 text-gray/50"
                }`}>
                {isPast ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </button>
              {i < STATUSES.length - 1 && (
                <div className={`flex-1 h-0.5 mx-0.5 rounded-full ${isPast ? config.color : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
        {/* Lost indicator */}
        {isLost && (
          <div className="ml-2 w-7 h-7 rounded-full flex items-center justify-center bg-red-400 text-white">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

export { STATUSES, STATUS_CONFIG };
