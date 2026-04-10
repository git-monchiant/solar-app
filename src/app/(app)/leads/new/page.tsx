"use client";

import { apiFetch } from "@/lib/api";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface Project { id: number; name: string; }
interface Package { id: number; name: string; }

export default function NewLeadPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "", project_id: "", house_number: "",
    customer_type: "ลูกค้าใหม่ยังไม่มีโซล่า", interested_package_id: "", note: "",
    source: "walk-in", payment_type: "", requirement: "",
  });

  useEffect(() => {
    Promise.all([
      apiFetch("/api/projects"),
      apiFetch("/api/packages"),
    ]).then(([p, pk]) => { setProjects(p); setPackages(pk); });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id ? parseInt(form.project_id) : null,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
        }),
      });
      router.push("/pipeline");
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Header title="New Lead" backHref="/pipeline" />

      {/* Camera shortcut */}
      <Link href="/camera"
        className="mx-4 md:mx-6 mt-4 flex items-center gap-3 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-2xl p-4 border border-primary/10 active:scale-[0.98] transition-transform"
      >
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
          <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-sm">Scan ID Card / Document</div>
          <div className="text-xs text-gray mt-0.5">Auto-fill from photo (Demo)</div>
        </div>
        <svg className="w-5 h-5 text-gray/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Full Name *</label>
            <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="Customer name" required
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0xx-xxx-xxxx"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Project</label>
            <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none">
              <option value="">Select project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">House No.</label>
            <input type="text" value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })}
              placeholder="e.g. 99/123"
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Source</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "walk-in", label: "Walk-in" },
                { value: "event", label: "Event" },
              ].map((s) => (
                <button key={s.value} type="button" onClick={() => setForm({ ...form, source: s.value })}
                  className={`py-3 rounded-xl text-sm font-medium transition-all ${
                    form.source === s.value
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-gray-200 text-gray"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Customer Type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "ลูกค้าใหม่ยังไม่มีโซล่า", label: "New" },
                { value: "ลูกค้าเดิมต้องการ Upgrade/Battery", label: "Upgrade" },
              ].map((type) => (
                <button key={type.value} type="button" onClick={() => setForm({ ...form, customer_type: type.value })}
                  className={`py-3 rounded-xl text-sm font-medium transition-all ${
                    form.customer_type === type.value
                      ? "bg-primary text-white shadow-md shadow-primary/20"
                      : "bg-white border border-gray-200 text-gray"
                  }`}>
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Interested Package</label>
            <select value={form.interested_package_id} onChange={(e) => setForm({ ...form, interested_package_id: e.target.value })}
              className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none">
              <option value="">Not selected</option>
              {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Payment Type</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "cash", label: "Cash" },
                { value: "home_equity", label: "Home Equity" },
                { value: "finance", label: "Finance" },
              ].map((p) => (
                <button key={p.value} type="button" onClick={() => setForm({ ...form, payment_type: p.value })}
                  className={`py-3 rounded-xl text-xs font-medium transition-all ${
                    form.payment_type === p.value ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Requirement</label>
          <textarea value={form.requirement} onChange={(e) => setForm({ ...form, requirement: e.target.value })}
            placeholder="e.g. interested in 5kWp, has 3 air-conditioners, wants EV charger"
            rows={2}
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" />
        </div>

        <div>
          <label className="block text-sm font-semibold mb-1.5 text-foreground/80">Note</label>
          <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Additional details" rows={2}
            className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none" />
        </div>

        <button type="submit" disabled={saving || !form.full_name.trim()}
          className="w-full md:w-auto md:px-12 py-4 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-bold text-base active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-primary/20">
          {saving ? "Saving..." : "Save Lead"}
        </button>
      </form>
    </div>
  );
}
