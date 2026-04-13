"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";

interface Lead { id: number; full_name: string; phone: string; project_name: string; house_number: string; }
interface Package { id: number; name: string; price: number; }

const fieldCard = "rounded-lg bg-white border border-gray-200 p-3";
const fieldLabel = "text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1.5";
const fieldInput = "w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary transition-colors";

function BookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preLeadId = searchParams.get("lead_id") || "";
  const [leads, setLeads] = useState<Lead[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ lead_id: preLeadId, package_id: "", note: "" });

  useEffect(() => {
    Promise.all([apiFetch("/api/leads"), apiFetch("/api/packages")]).then(([l, p]) => {
      setLeads(l);
      setPackages(p);
    });
  }, []);

  const selectedPackage = packages.find((p) => p.id === parseInt(form.package_id));
  const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lead_id || !form.package_id) return;
    setSaving(true);
    try {
      await apiFetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: parseInt(form.lead_id),
          package_id: parseInt(form.package_id),
          total_price: selectedPackage?.price || 0,
          note: form.note,
        }),
      });
      router.push("/pipeline");
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 md:p-6 space-y-2">
      <div className={fieldCard}>
        <label className={fieldLabel}>Customer <span className="text-red-500">*</span></label>
        <select
          value={form.lead_id}
          onChange={(e) => setForm({ ...form, lead_id: e.target.value })}
          required
          className={fieldInput + " appearance-none bg-white"}
        >
          <option value="">— เลือกลูกค้า —</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.full_name} {l.house_number ? `(${l.house_number})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldCard}>
        <label className={fieldLabel}>Package <span className="text-red-500">*</span></label>
        <select
          value={form.package_id}
          onChange={(e) => setForm({ ...form, package_id: e.target.value })}
          required
          className={fieldInput + " appearance-none bg-white"}
        >
          <option value="">— เลือกแพ็คเกจ —</option>
          {packages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatPrice(p.price)} THB
            </option>
          ))}
        </select>
      </div>

      {selectedPackage && (
        <div className="rounded-lg bg-gradient-to-br from-primary to-primary-dark text-white p-4 flex items-baseline justify-between shadow-sm shadow-primary/20">
          <span className="text-xs font-semibold tracking-wider uppercase text-white/70">Total Price</span>
          <span className="text-xl font-bold font-mono tabular-nums">
            {formatPrice(selectedPackage.price)}
            <span className="text-xs font-semibold text-white/70 ml-1">THB</span>
          </span>
        </div>
      )}

      <div className={fieldCard}>
        <label className={fieldLabel}>Note</label>
        <textarea
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          placeholder="รายละเอียดเพิ่มเติม"
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary transition-colors resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={saving || !form.lead_id || !form.package_id}
        className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-3"
      >
        {saving ? "Creating…" : "Create Booking"}
      </button>
    </form>
  );
}

export default function NewBookingPage() {
  return (
    <div className="max-w-2xl mx-auto pb-8">
      <Header title="New Booking" backHref="/bookings" />
      <Suspense fallback={<div className="p-4 text-center text-gray-400 text-sm">Loading…</div>}>
        <BookingForm />
      </Suspense>
    </div>
  );
}
