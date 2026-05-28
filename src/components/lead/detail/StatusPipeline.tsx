import { CheckIcon, XIcon } from "@/components/ui/icons";
import { STATUSES, STATUS_CONFIG, getMainStatus } from "@/lib/constants/statuses";

interface Props {
  currentStatus: string;
  onChangeStatus: (status: string) => void;
}

export default function StatusPipeline({ currentStatus, onChangeStatus }: Props) {
  const currentIdx = STATUSES.indexOf(getMainStatus(currentStatus) as typeof STATUSES[number]);
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
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all text-xs font-bold ${
                  isCurrent ? `${config.color} text-white ring-2 ring-offset-1 ring-${config.color}` :
                  isPast ? `${config.color} text-white` :
                  "bg-gray-200 text-gray/50"
                }`}>
                {isPast ? (
                  <CheckIcon className="w-3.5 h-3.5" strokeWidth={3} />
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
            <XIcon className="w-3.5 h-3.5" strokeWidth={3} />
          </div>
        )}
      </div>
    </div>
  );
}

export { STATUSES, STATUS_CONFIG };
