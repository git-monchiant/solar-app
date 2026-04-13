"use client";

import { apiFetch } from "@/lib/api";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface Project { id: number; name: string; district: string | null; province: string | null; }
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
  `h-9 px-3 rounded-lg text-[15px] font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const fieldCard = "rounded-lg bg-white border border-gray-200 p-3";
const fieldLabel = "text-sm font-semibold tracking-wider uppercase text-gray-400 block mb-1.5";
const fieldInput = "w-full h-11 px-3 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors";
const fieldTextarea = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors resize-none";

export default function NewLeadPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "", project_id: "", house_number: "",
    customer_type: "ลูกค้าใหม่ยังไม่มีโซล่า", interested_package_id: "", note: "",
    source: "walk-in", payment_type: "", requirement: "",
    id_card_number: "", id_card_address: "",
  });
  const [projectText, setProjectText] = useState("");
  const [projectFocused, setProjectFocused] = useState(false);
  const showSuggestions = projectFocused && projectText.length >= 1;
  const projectSuggestions = showSuggestions
    ? projects.filter(p => p.name.toLowerCase().includes(projectText.toLowerCase()))
    : [];
  const selectedProject = projects.find(p => String(p.id) === form.project_id);
  const zoneText = selectedProject ? [selectedProject.district, selectedProject.province].filter(Boolean).join(", ") : "";
  const [idCardPhoto, setIdCardPhoto] = useState<string | null>(null);
  const [houseRegPhoto, setHouseRegPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "reading" | "done" | "failed">("idle");
  const [locating, setLocating] = useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=th`,
            { headers: { "User-Agent": "sena-solar-app/1.0" } }
          );
          const data = await res.json();
          if (data.display_name) {
            setForm(prev => ({ ...prev, house_number: data.display_name }));
          }
        } finally {
          setLocating(false);
        }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "id_card" | "house_reg") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(type);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: { "ngrok-skip-browser-warning": "true" } });
      const { url } = await res.json();
      if (type === "id_card") {
        setIdCardPhoto(url);
      } else {
        setHouseRegPhoto(url);
      }
    } finally {
      setUploading(null);
    }
  };

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
          project_name_input: !form.project_id && projectText.trim() ? projectText.trim() : null,
          interested_package_id: form.interested_package_id ? parseInt(form.interested_package_id) : null,
          id_card_photo_url: idCardPhoto,
          house_reg_photo_url: houseRegPhoto,
        }),
      });
      router.push("/pipeline");
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-2xl mx-auto pb-8">
      <Header title="New Lead" backHref="/pipeline" />

      <form onSubmit={handleSubmit} className="p-3 md:p-6 space-y-2">
        {/* Scan document — top action */}
        <input type="file" accept="image/*" capture="environment" onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setOcrStatus("reading");
          try {
            const fd = new FormData();
            fd.append("file", file);
            const uploadRes = await fetch("/api/upload", { method: "POST", body: fd, headers: { "ngrok-skip-browser-warning": "true" } });
            const { url } = await uploadRes.json();
            const ocrRes = await fetch("/api/ocr", {
              method: "POST",
              headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
              body: JSON.stringify({ imageUrl: url }),
            });
            const ocrJson = await ocrRes.json();
            console.log("OCR response:", JSON.stringify(ocrJson));
            const data = ocrJson.data;
            if (data && Object.keys(data).length > 0) {
              setForm(prev => ({
                ...prev,
                ...(data.full_name ? { full_name: data.full_name } : {}),
                ...(data.id_card_number ? { id_card_number: data.id_card_number } : {}),
                ...(data.id_card_address ? { id_card_address: data.id_card_address } : {}),
                ...(data.phone ? { phone: data.phone } : {}),
                ...(data.house_number ? { house_number: data.house_number } : {}),
              }));
            }
            setOcrStatus("done");
            setTimeout(() => setOcrStatus("idle"), 3000);
          } catch {
            setOcrStatus("failed");
            setTimeout(() => setOcrStatus("idle"), 3000);
          }
          e.target.value = "";
        }} className="hidden" id="scan-doc-upload" />
        <label htmlFor="scan-doc-upload" className="flex items-center gap-3 rounded-lg bg-active-light border border-active/20 p-4 cursor-pointer hover:bg-active/10 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-active text-white flex items-center justify-center shrink-0">
            {ocrStatus === "reading" ? (
              <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {ocrStatus === "reading" ? (
              <div className="text-sm font-bold text-active">กำลังอ่านข้อมูล…</div>
            ) : ocrStatus === "done" ? (
              <>
                <div className="text-sm font-bold text-emerald-700">✓ กรอกข้อมูลแล้ว</div>
                <div className="text-xs text-emerald-600">กดเพื่อถ่ายเอกสารเพิ่ม</div>
              </>
            ) : ocrStatus === "failed" ? (
              <>
                <div className="text-sm font-bold text-gray-700">อ่านไม่ได้ ลองอีกครั้ง</div>
                <div className="text-xs text-gray-500">กดเพื่อถ่ายใหม่</div>
              </>
            ) : (
              <>
                <div className="text-sm font-bold text-active">ถ่ายรูปเอกสาร</div>
                <div className="text-xs text-active/70">บัตรประชาชน · ทะเบียนบ้าน · บิลค่าไฟ · อื่นๆ</div>
              </>
            )}
          </div>
        </label>

        {/* Section: ข้อมูลเบื้องต้น */}
        <div className="text-base font-bold text-gray-800 px-1 pt-2">ข้อมูลเบื้องต้น</div>

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
            <div className="relative">
              <label className={fieldLabel}>Project</label>
              <input
                type="text"
                value={projectText}
                onChange={e => { setProjectText(e.target.value); setForm({ ...form, project_id: "" }); }}
                onFocus={() => setProjectFocused(true)}
                onBlur={() => setTimeout(() => setProjectFocused(false), 200)}
                placeholder="พิมพ์ชื่อโครงการ..."
                className={fieldInput + " bg-white"}
              />
              {zoneText && !projectFocused && (
                <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                  <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {zoneText}
                </div>
              )}
              {projectSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {projectSuggestions.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setProjectText(p.name); setForm({ ...form, project_id: String(p.id) }); setProjectFocused(false); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-active-light transition-colors"
                    >
                      <div className="text-sm text-gray-800">{p.name}</div>
                      {(p.district || p.province) && (
                        <div className="text-xs text-gray-400">{[p.district, p.province].filter(Boolean).join(", ")}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className={fieldLabel}>ที่อยู่ติดตั้ง</label>
              <textarea
                value={form.house_number}
                onChange={e => setForm({ ...form, house_number: e.target.value })}
                placeholder="ที่อยู่"
                rows={2}
                className={fieldTextarea}
              />
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={locating}
                className="w-full h-9 mt-1.5 rounded-lg border border-gray-200 bg-white flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:border-active/40 hover:text-active transition-colors"
              >
                {locating ? (
                  <><div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังหาตำแหน่ง…</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg> ใช้ตำแหน่งปัจจุบัน</>
                )}
              </button>
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

        {/* Section: ข้อมูลสำหรับจดทะเบียน */}
        <div className="text-base font-bold text-gray-800 px-1 pt-4">ข้อมูลสำหรับจดทะเบียน</div>

        {/* ID Card Number */}
        <div className={fieldCard}>
          <label className={fieldLabel}>เลขบัตรประชาชน</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={13}
            value={form.id_card_number}
            onChange={e => setForm({ ...form, id_card_number: e.target.value.replace(/\D/g, "").slice(0, 13) })}
            placeholder="13 หลัก"
            className={fieldInput + " font-mono tabular-nums"}
          />
        </div>

        {/* ID Card Address */}
        <div className={fieldCard}>
          <label className={fieldLabel}>ที่อยู่ตามบัตรประชาชน</label>
          <textarea
            value={form.id_card_address}
            onChange={e => setForm({ ...form, id_card_address: e.target.value })}
            placeholder="ที่อยู่ตามบัตร"
            rows={2}
            className={fieldTextarea}
          />
        </div>

        {/* Document uploads */}
        <div className={fieldCard}>
          <label className={fieldLabel}>เอกสารประกอบ</label>
          <div className="space-y-3">
            {/* ID Card Photo */}
            {/* ID Card — scan + OCR */}
            <div>
              <div className="text-xs text-gray-500 mb-1.5">สำเนาบัตรประชาชน</div>
              <input type="file" accept="image/*" capture="environment" onChange={e => handleDocUpload(e, "id_card")} className="hidden" id="id-card-upload" />
              {idCardPhoto ? (
                <div className="relative inline-block">
                  <a href={idCardPhoto} target="_blank" rel="noreferrer">
                    <img src={idCardPhoto} alt="ID Card" className="h-20 rounded-lg border border-gray-200" />
                  </a>
                  <button type="button" onClick={() => setIdCardPhoto(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow">×</button>
                </div>
              ) : (
                <label htmlFor="id-card-upload" className="w-full h-10 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 cursor-pointer hover:border-active/40 hover:text-active text-gray-500 text-sm">
                  {uploading === "id_card" ? (
                    <><div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังอัปโหลด…</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> ถ่ายรูป / อัปโหลด</>
                  )}
                </label>
              )}
            </div>

            {/* House Registration Photo */}
            <div>
              <div className="text-xs text-gray-500 mb-1.5">สำเนาทะเบียนบ้าน</div>
              <input type="file" accept="image/*" capture="environment" onChange={e => handleDocUpload(e, "house_reg")} className="hidden" id="house-reg-upload" />
              {houseRegPhoto ? (
                <div className="relative inline-block">
                  <a href={houseRegPhoto} target="_blank" rel="noreferrer">
                    <img src={houseRegPhoto} alt="House Reg" className="h-20 rounded-lg border border-gray-200" />
                  </a>
                  <button type="button" onClick={() => setHouseRegPhoto(null)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow">×</button>
                </div>
              ) : (
                <label htmlFor="house-reg-upload" className="w-full h-10 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 cursor-pointer hover:border-active/40 hover:text-active text-gray-500 text-sm">
                  {uploading === "house_reg" ? (
                    <><div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังอัปโหลด…</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> ถ่ายรูป / อัปโหลด</>
                  )}
                </label>
              )}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving || !form.full_name.trim()}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-3 mb-24 md:mb-0"
        >
          {saving ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </form>
    </div>
  );
}
