"use client";

import { useEffect, useState } from "react";
import Dropdown from "@/components/ui/Dropdown";
import { apiFetch } from "@/lib/api";
import type { B2bCustomer, B2bProject, B2bUserOption } from "@/lib/b2b/project";
import ModalShell, { areaCls, fieldCls, labelCls, Req } from "./ModalShell";

// สร้าง / แก้ข้อมูลโครงการ — บริษัทลูกค้าเลือกจากที่มี หรือพิมพ์บริษัทใหม่ (เลขผู้เสียภาษี + สาขาซ้ำ = ระบบใช้แถวเดิมเอง)
// แก้ชื่อ/ที่อยู่ของบริษัทเดิมทำในแท็บข้อมูลโครงการ (กระทบทุกโครงการของบริษัทนั้น) — ฟอร์มนี้แค่เลือกว่าเป็นบริษัทไหน

type Draft = {
  name: string; customerMode: "existing" | "new"; customer_id: string;
  c_name: string; c_tax: string; c_branch: string; c_address: string;
  contact_name: string; contact_phone: string; contact_email: string;
  location: string; latitude: string; longitude: string; owner_id: string; note: string;
};

const fromProject = (p: B2bProject | null): Draft => ({
  name: p?.name ?? "", customerMode: p ? "existing" : "new", customer_id: p ? String(p.customer_id) : "",
  c_name: "", c_tax: "", c_branch: "สำนักงานใหญ่", c_address: "",
  contact_name: p?.contact_name ?? "", contact_phone: p?.contact_phone ?? "", contact_email: p?.contact_email ?? "",
  location: p?.location ?? "", latitude: p?.latitude?.toString() ?? "", longitude: p?.longitude?.toString() ?? "",
  owner_id: p?.owner_id ? String(p.owner_id) : "", note: p?.note ?? "",
});

export default function ProjectFormModal({ initial, onClose, onSaved }: {
  /** null = สร้างใหม่ */
  initial: B2bProject | null;
  onClose: () => void;
  onSaved: (r: { id: number }) => void;
}) {
  const [d, setD] = useState<Draft>(() => fromProject(initial));
  const [opts, setOpts] = useState<{ users: B2bUserOption[]; customers: B2bCustomer[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  useEffect(() => {
    apiFetch("/api/b2b/projects/options").then((r) => {
      setOpts(r);
      // มีบริษัทในระบบแล้ว → สร้างโครงการใหม่ให้เริ่มที่ "เลือกบริษัทเดิม"
      if (!initial && (r.customers as B2bCustomer[]).length > 0) set({ customerMode: "existing" });
    }).catch(() => setOpts({ users: [], customers: [] }));
  }, [initial]);

  const save = async () => {
    setError(""); setSaving(true);
    try {
      const body = {
        name: d.name,
        customer: d.customerMode === "existing"
          ? { id: Number(d.customer_id) || null }
          : { name: d.c_name, tax_id: d.c_tax, branch: d.c_branch, address: d.c_address },
        contact_name: d.contact_name, contact_phone: d.contact_phone, contact_email: d.contact_email,
        location: d.location, latitude: d.latitude || null, longitude: d.longitude || null,
        owner_id: d.owner_id || null, note: d.note,
      };
      const r = await apiFetch(initial ? `/api/b2b/projects/${initial.id}` : "/api/b2b/projects", {
        method: initial ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }) as { id: number };
      onSaved(r);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ");
      setSaving(false);
    }
  };

  // ผู้ดูแลเดิมที่ไม่มี role b2b แล้ว (หรือเป็น admin) ยังต้องโชว์ชื่อในช่อง ไม่งั้นช่องว่างเหมือนไม่มีผู้ดูแล
  const users = opts?.users ?? [];
  const ownerOptions = [
    ...(initial?.owner_id && !users.some((u) => u.id === initial.owner_id) ? [{ value: String(initial.owner_id), label: initial.owner_name ?? `#${initial.owner_id}` }] : []),
    ...users.map((u) => ({ value: String(u.id), label: u.full_name })),
  ];
  const customers = opts?.customers ?? [];
  const tab = (mode: Draft["customerMode"], text: string) => (
    <button type="button" onClick={() => set({ customerMode: mode })} style={{ minHeight: 0 }} aria-pressed={d.customerMode === mode}
      className={`h-8 px-3 rounded-lg border text-sm font-semibold transition-colors ${d.customerMode === mode ? "border-primary bg-primary/5 text-primary" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
      {text}
    </button>
  );

  return (
    <ModalShell title={initial ? "แก้ข้อมูลโครงการ" : "สร้างโครงการใหม่"} width="max-w-2xl"
      subtitle={initial ? `${initial.code} · ${initial.name}` : "เริ่มที่ขั้นโอกาสขาย — ได้เลขที่โครงการอัตโนมัติ"}
      confirmText={initial ? "บันทึก" : "สร้างโครงการ"} saving={saving} error={error} onConfirm={() => void save()} onClose={onClose}>
      <div><label className={labelCls}>ชื่อโครงการ <Req /></label>
        <input autoFocus className={fieldCls} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="เช่น โรงงาน ABC เฟส 2 (Solar Rooftop)" /></div>

      <section className="rounded-xl border border-gray-200 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-gray-800 mr-1">บริษัทลูกค้า <Req /></span>
          {customers.length > 0 && tab("existing", "เลือกบริษัทเดิม")}
          {tab("new", "+ บริษัทใหม่")}
        </div>
        {d.customerMode === "existing" ? (
          <Dropdown searchable value={d.customer_id} onChange={(v) => set({ customer_id: v })} placeholder="เลือกบริษัท"
            options={customers.map((c) => ({ value: String(c.id), label: `${c.name}${c.branch ? ` (${c.branch})` : ""}${c.tax_id ? ` · ${c.tax_id}` : ""}` }))} />
        ) : (
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-12"><label className={labelCls}>ชื่อบริษัท <Req /></label>
              <input className={fieldCls} value={d.c_name} onChange={(e) => set({ c_name: e.target.value })} placeholder="บริษัท … จำกัด" /></div>
            <div className="md:col-span-7"><label className={labelCls}>เลขประจำตัวผู้เสียภาษี</label>
              <input inputMode="numeric" className={fieldCls} value={d.c_tax} onChange={(e) => set({ c_tax: e.target.value })} placeholder="13 หลัก" /></div>
            <div className="md:col-span-5"><label className={labelCls}>สาขา</label>
              <input className={fieldCls} value={d.c_branch} onChange={(e) => set({ c_branch: e.target.value })} /></div>
            <div className="md:col-span-12"><label className={labelCls}>ที่อยู่ (ออกเอกสาร)</label>
              <input className={fieldCls} value={d.c_address} onChange={(e) => set({ c_address: e.target.value })} /></div>
          </div>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-5"><label className={labelCls}>ผู้ติดต่อ</label>
          <input className={fieldCls} value={d.contact_name} onChange={(e) => set({ contact_name: e.target.value })} placeholder="ชื่อ · ตำแหน่ง" /></div>
        <div className="md:col-span-3"><label className={labelCls}>เบอร์โทร</label>
          <input inputMode="tel" className={fieldCls} value={d.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} /></div>
        <div className="md:col-span-4"><label className={labelCls}>อีเมล</label>
          <input inputMode="email" className={fieldCls} value={d.contact_email} onChange={(e) => set({ contact_email: e.target.value })} /></div>
        <div className="md:col-span-6"><label className={labelCls}>ที่ตั้งโครงการ</label>
          <input className={fieldCls} value={d.location} onChange={(e) => set({ location: e.target.value })} placeholder="นิคม / ตำบล · จังหวัด" /></div>
        <div className="md:col-span-3"><label className={labelCls}>Latitude</label>
          <input inputMode="decimal" className={fieldCls} value={d.latitude} onChange={(e) => set({ latitude: e.target.value })} placeholder="13.xxxxxx" /></div>
        <div className="md:col-span-3"><label className={labelCls}>Longitude</label>
          <input inputMode="decimal" className={fieldCls} value={d.longitude} onChange={(e) => set({ longitude: e.target.value })} placeholder="100.xxxxxx" /></div>
        <div className="md:col-span-6"><label className={labelCls}>ผู้ดูแลโครงการ</label>
          <Dropdown value={d.owner_id} onChange={(v) => set({ owner_id: v })} placeholder={initial ? "ไม่ระบุ" : "ตัวเอง (ค่าเริ่มต้น)"} options={ownerOptions} /></div>
        <div className="md:col-span-12"><label className={labelCls}>หมายเหตุ</label>
          <textarea rows={2} className={areaCls} value={d.note} onChange={(e) => set({ note: e.target.value })} /></div>
      </div>
    </ModalShell>
  );
}
