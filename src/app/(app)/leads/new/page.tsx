"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface Project { id: number; name: string; }
interface Package { id: number; name: string; }

const SOURCES = [
  { value: "walk-in", label: "Walk-in" },
  { value: "event", label: "Event" },
];

const CUSTOMER_TYPES = [
  { value: "ลูกค้าใหม่ยังไม่มีโซล่า", label: "New" },
  { value: "ลูกค้าเดิมต้องการ Upgrade/Battery", label: "Upgrade" },
];

const PAYMENT_TYPES = [
  { value: "cash", label: "เงินสด" },
  { value: "home_equity", label: "สินเชื่อบ้าน" },
  { value: "finance", label: "ไฟแนนซ์" },
];

const chipBtn = (selected: boolean) =>
  `h-9 px-4 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const fieldCard = "rounded-lg bg-white border border-gray-200 p-3";
const fieldLabel = "text-[10px] font-semibold tracking-wider uppercase text-gray-400 block mb-1.5";
const fieldInput = "w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary transition-colors";
const fieldTextarea = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary transition-colors resize-none";

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
      await apiFetch("/api/leads", {
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
    <div className="max-w-2xl mx-auto pb-8">
      <Header title="New Lead" backHref="/pipeline" />

      {/* Camera shortcut */}
      <Link
        href="/camera"
        className="mx-3 md:mx-6 mt-3 flex items-center gap-2.5 rounded-lg bg-white border border-gray-200 p-3 hover:border-gray-300 transition-colors"
      >
        <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-gray-50 text-gray-500 ring-1 ring-inset ring-gray-200">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400">Shortcut</div>
          <div className="text-sm font-semibold text-gray-900 leading-tight">Scan ID Card / Document</div>
        </div>
        <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      <form onSubmit={handleSubmit} className="p-3 md:p-6 space-y-2">
        {/* Name + Phone */}
        <div className={fieldCard}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Full Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => setForm({ ...form, full_name: e.target.value })}
                placeholder="ชื่อลูกค้า"
                required
                className={fieldInput}
              />
            </div>
            <div>
              <label className={fieldLabel}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="08x-xxx-xxxx"
                className={fieldInput + " font-mono tabular-nums"}
              />
            </div>
          </div>
        </div>

        {/* Project + House */}
        <div className={fieldCard}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Project</label>
              <select
                value={form.project_id}
                onChange={e => setForm({ ...form, project_id: e.target.value })}
                className={fieldInput + " appearance-none bg-white"}
              >
                <option value="">— เลือกโครงการ —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}>House No.</label>
              <input
                type="text"
                value={form.house_number}
                onChange={e => setForm({ ...form, house_number: e.target.value })}
                placeholder="เช่น 99/123"
                className={fieldInput + " font-mono tabular-nums"}
              />
            </div>
          </div>
        </div>

        {/* Source */}
        <div className={fieldCard}>
          <label className={fieldLabel}>Source</label>
          <div className="grid grid-cols-3 gap-2">
            {SOURCES.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setForm({ ...form, source: s.value })}
                className={chipBtn(form.source === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Customer Type */}
        <div className={fieldCard}>
          <label className={fieldLabel}>Customer Type</label>
          <div className="grid grid-cols-3 gap-2">
            {CUSTOMER_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, customer_type: t.value })}
                className={chipBtn(form.customer_type === t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Interested Package */}
        <div className={fieldCard}>
          <label className={fieldLabel}>Interested Package</label>
          <select
            value={form.interested_package_id}
            onChange={e => setForm({ ...form, interested_package_id: e.target.value })}
            className={fieldInput + " appearance-none bg-white"}
          >
            <option value="">— ยังไม่เลือก —</option>
            {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Payment Type */}
        <div className={fieldCard}>
          <label className={fieldLabel}>Payment Type</label>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_TYPES.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setForm({ ...form, payment_type: p.value })}
                className={chipBtn(form.payment_type === p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Requirement */}
        <div className={fieldCard}>
          <label className={fieldLabel}>Requirement</label>
          <textarea
            value={form.requirement}
            onChange={e => setForm({ ...form, requirement: e.target.value })}
            placeholder="เช่น สนใจ 5kWp, มีแอร์ 3 เครื่อง, อยาก charge EV"
            rows={2}
            className={fieldTextarea}
          />
        </div>

        {/* Note */}
        <div className={fieldCard}>
          <label className={fieldLabel}>Note</label>
          <textarea
            value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })}
            placeholder="รายละเอียดเพิ่มเติม"
            rows={2}
            className={fieldTextarea}
          />
        </div>

        <button
          type="submit"
          disabled={saving || !form.full_name.trim()}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-3"
        >
          {saving ? "Saving…" : "Save Lead"}
        </button>
      </form>
    </div>
  );
}
