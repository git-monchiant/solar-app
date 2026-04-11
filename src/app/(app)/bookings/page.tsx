"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import LeadCard, { LeadData } from "@/components/LeadCard";
import Header from "@/components/Header";

export default function BookingsPage() {
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/leads")
      .then((data: LeadData[]) => setLeads(data.filter((l) => l.booking_number)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Header
        title="Bookings"
        subtitle="Booked customers"
        rightContent={
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200 font-mono tabular-nums">
            {leads.length}
          </span>
        }
      />

      <div className="p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-sm font-medium">No bookings yet</div>
            <div className="text-xs mt-1">Bookings will appear here when deals are closed</div>
          </div>
        ) : (
          leads.map((l) => <LeadCard key={l.id} lead={l} />)
        )}
      </div>
    </div>
  );
}
