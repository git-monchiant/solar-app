import Link from "next/link";
import { ActivityType } from "./AddActivityModal";

interface Props {
  leadId: number;
  phone: string | null;
  hasBooking: boolean;
  canCreateBooking: boolean; // status >= ตัดสินใจซื้อ
  onAddActivity: (type: ActivityType) => void;
}

export default function QuickActionBar({ leadId, phone, hasBooking, canCreateBooking, onAddActivity }: Props) {
  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 md:left-64 bg-white border-t border-gray-200 z-40 px-3 py-2">
      <div className="flex items-center gap-2">
        <button onClick={() => onAddActivity("note")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-light text-sm font-medium active:bg-gray-200 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
          Note
        </button>

        <button onClick={() => onAddActivity("call")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium active:bg-blue-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
          </svg>
          Call
        </button>

        <button onClick={() => onAddActivity("visit")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-purple-50 text-purple-700 text-sm font-medium active:bg-purple-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          Visit
        </button>

        <button onClick={() => onAddActivity("follow_up")}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium active:bg-amber-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Follow
        </button>

        {!hasBooking && canCreateBooking && (
          <Link href={`/bookings/new?lead_id=${leadId}`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium active:bg-primary-dark transition-colors">
            Book
          </Link>
        )}
      </div>
    </div>
  );
}
