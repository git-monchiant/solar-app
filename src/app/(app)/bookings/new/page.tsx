"use client";

import { apiFetch } from "@/lib/api";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface Lead { id: number; full_name: string; phone: string; project_name: string; house_number: string; }
interface Package { id: number; name: string; price: number; }

function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preLeadId = searchParams.get("lead_id") || "";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ lead_id: preLeadId, package_id: "", note: "" });

  useEffect(() => {
    Promise.all([apiFetch("/api/leads"), apiFetch("/api/packages")]).then(([l, p]) => { setLeads(l); setPackages(p); });
  }, []);

  const selectedPackage = packages.find((p) => p.id === parseInt(form.package_id));
  const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lead_id || !form.package_id) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/bookings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: parseInt(form.lead_id), package_id: parseInt(form.package_id), total_price: selectedPackage?.price || 0, note: form.note }),
      });
      router.push("/pipeline");
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Customer *</label>
          <select value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })} required
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none">
            <option value="">Select customer</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name} {l.house_number ? `(${l.house_number})` : ""}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Package *</label>
          <select value={form.package_id} onChange={(e) => setForm({ ...form, package_id: e.target.value })} required
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none">
            <option value="">Select package</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatPrice(p.price)} THB</option>)}
          </select>
        </div>
      </div>

      {selectedPackage && (
        <div className="bg-primary/5 rounded-xl p-4 text-center">
          <div className="text-sm text-gray">Total Price</div>
          <div className="text-3xl font-bold text-primary">{formatPrice(selectedPackage.price)} <span className="text-lg">THB</span></div>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Note</label>
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Additional details" rows={3}
          className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" />
      </div>

      <button type="submit" disabled={saving || !form.lead_id || !form.package_id}
        className="w-full md:w-auto md:px-12 py-4 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-bold text-base active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-primary/20">
        {saving ? "Creating..." : "Create Booking"}
      </button>
    </form>
  );
}

export default function NewBookingPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <Header title="New Booking" backHref="/bookings" />
      <Suspense fallback={<div className="p-4 text-center text-gray">Loading...</div>}>
        <BookingForm />
      </Suspense>
    </div>
  );
}
