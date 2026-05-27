"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import CustomerWizard from "@/components/customer/CustomerWizard";
import LinePickerModal from "@/components/modal/LinePickerModal";
import ModalBase from "@/components/ui/ModalBase";

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
  /** Pre-set the lead source (channel) — set by ChannelPickerModal callers */
  initialSource?: string;
}

export default function NewLeadModal({ onClose, onCreated, linkLine, initialSource }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "", phone: "", email: "", house_number: "",
    project_id: "" as string | number | null, project_name: "",
    installation_address: "",
    customer_type: "new", interested_package_id: "", note: "",
    source: initialSource || (linkLine ? "line_oa" : "walk_in"), payment_type: "", requirement: "",
    id_card_number: "", id_card_address: "",
    id_card_photo_url: null as string | null, house_reg_photo_url: null as string | null,
    utility_provider: "", ca_number: "", meter_number: "", monthly_bill: "",
  });
  // LINE picker state — only used when modal opened without a pre-selected linkLine.
  const [pickedLineProfile, setPickedLineProfile] = useState<{ display_name: string; picture_url: string | null } | null>(null);
  const [pickedLineId, setPickedLineId] = useState<number | null>(null);
  const [showLinePicker, setShowLinePicker] = useState(false);

  // Compose LINE display: pre-supplied prop wins; otherwise show whatever user picked.
  const lineProfile = linkLine
    ? { display_name: linkLine.displayName, picture_url: linkLine.pictureUrl }
    : pickedLineProfile;

  const canSubmit = !!form.full_name.trim() && !!form.phone.trim() && !!form.email.trim() && !!form.house_number.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      // Raw fetch (not apiFetch) so we can surface the 409 dedupe response.
      // Must hand-roll the x-user-id header that apiFetch normally injects —
      // missing it makes requireAuth() return 401 to every user.
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
        body: JSON.stringify({
          ...form,
          project_id: form.project_id ? parseInt(String(form.project_id)) : null,
          project_name_input: !form.project_id && form.project_name?.trim() ? form.project_name.trim() : null,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
        }),
      });
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        const existing = data?.existing_lead;
        if (existing?.id) {
          const goTo = confirm(`ลูกค้านี้มีอยู่แล้ว: ${existing.full_name || "(ไม่มีชื่อ)"} (สถานะ: ${existing.status || "-"})\nต้องการเปิด lead เดิมเลยมั้ย?`);
          if (goTo) {
            onClose();
            router.push(`/leads/${existing.id}`);
            return;
          }
        }
        setError("ลูกค้านี้มีอยู่แล้ว (เบอร์โทร + บ้านเลขที่ ตรงกับ lead ที่มีอยู่)");
        return;
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const result = await res.json();
      const lineUserToLink = linkLine?.userId ?? pickedLineId;
      if (lineUserToLink && result?.id) {
        await apiFetch(`/api/line-users/${lineUserToLink}`, {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง lead ไม่สำเร็จ");
    }
    finally { setSaving(false); }
  };

  return (
    <>
      <ModalBase
        title={
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </span>
            <span>{`Lead ใหม่${form.full_name.trim() ? ` — ${form.full_name.trim()}` : ""}`}</span>
          </div>
        }
        onClose={onClose}
        size="xl"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canSubmit}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:bg-primary-dark transition-colors"
            >
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        }
      >
        <CustomerWizard
          values={form}
          onChange={patch => setForm(prev => ({ ...prev, ...(patch as Record<string, unknown>) } as typeof prev))}
          onSubmit={handleSubmit}
          saving={saving}
          lineProfile={lineProfile}
          linePending={!!lineProfile}
          onLinkLine={linkLine ? undefined : () => setShowLinePicker(true)}
          mode="create"
          hideSubmit
        />
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        )}
      </ModalBase>
      {showLinePicker && (
        <LinePickerModal
          target={{ type: "draft", label: form.full_name?.trim() || "ลูกค้าใหม่" }}
          onClose={() => setShowLinePicker(false)}
          onLinked={(linked) => {
            setPickedLineProfile({ display_name: linked.display_name, picture_url: linked.picture_url });
            setPickedLineId(linked.id);
          }}
        />
      )}
    </>
  );
}
