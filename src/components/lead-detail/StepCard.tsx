import Link from "next/link";
import { STATUSES, STATUS_CONFIG, FINANCE_STATUSES } from "@/lib/statuses";

interface Props {
  status: string;
  leadId: number;
  hasBooking: boolean;
  paymentType: string | null;
  financeStatus: string | null;
  onNext: () => void;
  onLost: () => void;
  onAddActivity: (type: string) => void;
}

export default function StepCard({ status, leadId, hasBooking, paymentType, financeStatus, onNext, onLost, onAddActivity }: Props) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.register;
  const idx = STATUSES.indexOf(status as typeof STATUSES[number]);
  const isLast = idx === STATUSES.length - 1;
  const isLost = status === "lost";
  const needsFinance = paymentType === "home_equity" || paymentType === "finance";
  const financeConfig = FINANCE_STATUSES.find(f => f.value === financeStatus);

  return (
    <div className={`mx-4 mt-3 rounded-2xl ${isLost ? "bg-red-50 border border-red-200" : config.bg} p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
          </svg>
        </div>
        <div className="flex-1">
          <div className={`text-sm font-bold ${config.text}`}>
            {isLost ? "Closed Lost" : `Step ${idx + 1}: ${config.label}`}
          </div>
          <div className="text-xs text-gray">{config.description}</div>
        </div>
      </div>

      {needsFinance && (
        <div className="flex items-center gap-2 mb-3 ml-10">
          <span className="text-xs text-gray">Finance:</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${financeConfig?.color || "bg-gray-100 text-gray"}`}>
            {financeConfig?.label || "Not set"}
          </span>
          <span className="text-xs text-gray/60">({paymentType === "home_equity" ? "Home Equity" : "Finance"})</span>
        </div>
      )}

      <div className="flex gap-2">
        {status === "register" && (
          <button onClick={() => onAddActivity("call")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${config.color}`}>Log Contact</button>
        )}
        {status === "booked" && !hasBooking && (
          <Link href={`/bookings/new?lead_id=${leadId}`} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white text-center ${config.color}`}>Create Booking</Link>
        )}
        {status === "survey" && (
          <button onClick={() => onAddActivity("follow_up")} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${config.color}`}>Schedule Survey</button>
        )}
        {status === "quote" && (
          <Link href="/packages" className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white text-center ${config.color}`}>Show Package</Link>
        )}
        {status === "order" && (
          <div className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-green-700 text-center bg-green-100">รออนุมัติ/ชำระ</div>
        )}
        {status === "install" && (
          <div className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-emerald-700 text-center bg-emerald-100">Completed!</div>
        )}
        {isLost && (
          <button onClick={() => onAddActivity("follow_up")} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-500">Set Revisit Date</button>
        )}

        {!isLast && !isLost && (
          <button onClick={onNext} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white">
            Next &rarr; {STATUS_CONFIG[STATUSES[idx + 1]]?.label}
          </button>
        )}

        {!isLost && status !== "install" && (
          <button onClick={onLost} className="py-2.5 px-4 rounded-xl text-sm font-medium text-red-500 border border-red-200 bg-white">Lost</button>
        )}
      </div>
    </div>
  );
}
