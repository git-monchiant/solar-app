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
      <Header title="Bookings" subtitle="Booked customers" rightContent={
        <span className="bg-white/20 rounded-full px-3 py-1 text-sm font-medium">{leads.length}</span>
      } />

      <div className="p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" /></div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-gray">
            <div className="font-medium">No bookings yet</div>
            <div className="text-sm text-gray/60 mt-1">Bookings will appear here when deals are closed</div>
          </div>
        ) : (
          leads.map((l) => <LeadCard key={l.id} lead={l} />)
        )}
      </div>
    </div>
  );
}
