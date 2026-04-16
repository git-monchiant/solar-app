"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import CustomerWizard from "@/components/CustomerWizard";

export interface LineLinkInfo {
  userId: number;
  displayName: string;
  pictureUrl: string | null;
}

interface Props {
  onClose: () => void;
  onCreated?: () => void;
  /** If provided, auto-link this LINE user to the new lead after save */
  linkLine?: LineLinkInfo;
}

export default function NewLeadModal({ onClose, onCreated, linkLine }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "", project_id: "" as string | number | null, project_name: "",
    installation_address: "",
    customer_type: "ลูกค้าใหม่ยังไม่มีโซล่า", interested_package_id: "", note: "",
    source: "walk-in", payment_type: "", requirement: "",
    id_card_number: "", id_card_address: "",
    id_card_photo_url: null as string | null, house_reg_photo_url: null as string | null,
    utility_provider: "", ca_number: "", meter_number: "", monthly_bill: "",
  });

  const handleSubmit = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    try {
      const result = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id ? parseInt(String(form.project_id)) : null,
          project_name_input: !form.project_id && form.project_name?.trim() ? form.project_name.trim() : null,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
        }),
      });
      if (linkLine && result?.id) {
        await apiFetch(`/api/line-users/${linkLine.userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: result.id }),
        });
      }
      onCreated?.();
      onClose();
      if (result?.id) {
        router.push(`/leads/${result.id}`);
      }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] md:flex md:items-center md:justify-center md:p-6">
      <div className="hidden md:block absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full h-full md:max-w-[90vw] md:max-h-[90vh] md:rounded-2xl overflow-y-auto md:animate-slide-up flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 pt-[max(1rem,env(safe-area-inset-top,1rem))] flex items-center justify-between z-10 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">New Lead{form.full_name.trim() ? ` — ${form.full_name.trim()}` : ""}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-5 py-4 lg:px-10 flex-1 min-h-0">
          <CustomerWizard
            values={form}
            onChange={patch => setForm(prev => ({ ...prev, ...(patch as Record<string, unknown>) } as typeof prev))}
            onSubmit={handleSubmit}
            saving={saving}
            lineProfile={linkLine ? { display_name: linkLine.displayName, picture_url: linkLine.pictureUrl } : undefined}
            linePending={!!linkLine}
          />
        </div>
      </div>
    </div>
  );
}
