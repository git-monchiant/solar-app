"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Project { id: number; name: string; district?: string; province?: string }

interface Props {
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

const fieldLabel = "text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1";
const fieldInput = "w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary";
const fieldTextarea = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none";

export default function ProfileModal({ leadId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectText, setProjectText] = useState("");
  const [projectFocused, setProjectFocused] = useState(false);
  const [idCardPhoto, setIdCardPhoto] = useState<string | null>(null);
  const [houseRegPhoto, setHouseRegPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "", phone: "", project_id: "", installation_address: "",
    id_card_number: "", id_card_address: "", meter_number: "",
  });

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/leads/${leadId}`),
      apiFetch("/api/projects"),
    ]).then(([lead, projs]) => {
      setForm({
        full_name: lead.full_name || "",
        phone: lead.phone || "",
        project_id: lead.project_id ? String(lead.project_id) : "",
        installation_address: lead.installation_address || "",
        id_card_number: lead.id_card_number || "",
        id_card_address: lead.id_card_address || "",
        meter_number: lead.meter_number || "",
      });
      setProjectText(lead.project_name || "");
      setIdCardPhoto(lead.id_card_photo_url || null);
      setHouseRegPhoto(lead.house_reg_photo_url || null);
      setProjects(projs);
      setLoading(false);
    }).catch(console.error);
  }, [leadId]);

  const projectSuggestions = projectFocused && projectText.length >= 1
    ? projects.filter(p => p.name.toLowerCase().includes(projectText.toLowerCase()))
    : [];

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "id_card" | "house_reg") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const { url } = await apiFetch("/api/upload", { method: "POST", body: fd });
    const field = type === "id_card" ? "id_card_photo_url" : "house_reg_photo_url";
    if (type === "id_card") setIdCardPhoto(url); else setHouseRegPhoto(url);
    await apiFetch(`/api/leads/${leadId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: url }) });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name || undefined,
          phone: form.phone || undefined,
          installation_address: form.installation_address || undefined,
          id_card_number: form.id_card_number || undefined,
          id_card_address: form.id_card_address || undefined,
          meter_number: form.meter_number || undefined,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg md:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto animate-slide-up">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-gray-900">ข้อมูลลูกค้า</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* ข้อมูลเบื้องต้น */}
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">ข้อมูลเบื้องต้น</div>
            <div className="space-y-3">
              <div>
                <label className={fieldLabel}>ชื่อ-นามสกุล</label>
                <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} className={fieldInput} />
              </div>
              <div>
                <label className={fieldLabel}>เบอร์โทร</label>
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={fieldInput + " font-mono tabular-nums"} />
              </div>
              <div className="relative">
                <label className={fieldLabel}>โครงการ</label>
                <input type="text" value={projectText} onChange={e => { setProjectText(e.target.value); setForm({ ...form, project_id: "" }); }} onFocus={() => setProjectFocused(true)} onBlur={() => setTimeout(() => setProjectFocused(false), 200)} placeholder="พิมพ์ชื่อโครงการ..." className={fieldInput} />
                {projectSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {projectSuggestions.map(p => (
                      <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { setProjectText(p.name); setForm({ ...form, project_id: String(p.id) }); setProjectFocused(false); }} className="w-full text-left px-3 py-2 hover:bg-active-light transition-colors">
                        <div className="text-sm text-gray-800">{p.name}</div>
                        {(p.district || p.province) && <div className="text-xs text-gray-400">{[p.district, p.province].filter(Boolean).join(", ")}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className={fieldLabel}>ที่อยู่ติดตั้ง</label>
                <textarea value={form.installation_address} onChange={e => setForm({ ...form, installation_address: e.target.value })} rows={2} className={fieldTextarea} />
              </div>
            </div>

            {/* ข้อมูลจดทะเบียน */}
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2">ข้อมูลจดทะเบียน</div>
            <div className="space-y-3">
              <div>
                <label className={fieldLabel}>เลขบัตรประชาชน</label>
                <input type="text" inputMode="numeric" maxLength={13} value={form.id_card_number} onChange={e => setForm({ ...form, id_card_number: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="13 หลัก" className={fieldInput + " font-mono tabular-nums"} />
              </div>
              <div>
                <label className={fieldLabel}>ที่อยู่ตามบัตรประชาชน</label>
                <textarea value={form.id_card_address} onChange={e => setForm({ ...form, id_card_address: e.target.value })} rows={2} className={fieldTextarea} />
              </div>
              <div>
                <label className={fieldLabel}>เลขมิเตอร์</label>
                <input type="text" value={form.meter_number} onChange={e => setForm({ ...form, meter_number: e.target.value })} className={fieldInput + " font-mono tabular-nums"} />
              </div>
            </div>

            {/* เอกสาร */}
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2">เอกสาร</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input type="file" accept="image/*" capture="environment" onChange={e => handleDocUpload(e, "id_card")} className="hidden" id="modal-id-card" />
                <label htmlFor="modal-id-card" className="block cursor-pointer">
                  {idCardPhoto ? (
                    <img src={idCardPhoto} alt="ID Card" className="w-full aspect-[3/2] object-cover rounded-lg border border-gray-200" />
                  ) : (
                    <div className="w-full aspect-[3/2] rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                      <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h2.25M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0z" /></svg>
                      <span className="text-xs">บัตรประชาชน</span>
                    </div>
                  )}
                </label>
              </div>
              <div>
                <input type="file" accept="image/*" capture="environment" onChange={e => handleDocUpload(e, "house_reg")} className="hidden" id="modal-house-reg" />
                <label htmlFor="modal-house-reg" className="block cursor-pointer">
                  {houseRegPhoto ? (
                    <img src={houseRegPhoto} alt="House Reg" className="w-full aspect-[3/2] object-cover rounded-lg border border-gray-200" />
                  ) : (
                    <div className="w-full aspect-[3/2] rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                      <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
                      <span className="text-xs">ทะเบียนบ้าน</span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Save */}
            <button onClick={handleSave} disabled={saving} className="w-full h-11 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-all mt-2">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
