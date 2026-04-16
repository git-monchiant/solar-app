"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import ErrorPopup from "@/components/ErrorPopup";

export type CustomerField =
  | "full_name"
  | "phone"
  | "project"
  | "installation_address"
  | "id_card_number"
  | "id_card_address"
  | "id_card_photo"
  | "house_reg_photo";

export type CustomerGroup = "identity" | "contact" | "project" | "installation" | "id_card" | "documents";

export interface CustomerValues {
  full_name?: string;
  phone?: string;
  project_id?: string | number | null;
  project_name?: string;
  installation_address?: string;
  id_card_number?: string;
  id_card_address?: string;
  id_card_photo_url?: string | null;
  house_reg_photo_url?: string | null;
}

interface Project { id: number; name: string; district: string | null; province: string | null; }

const GROUP_FIELDS: Record<CustomerGroup, CustomerField[]> = {
  identity: ["full_name"],
  contact: ["phone"],
  project: ["project"],
  installation: ["installation_address"],
  id_card: ["id_card_number", "id_card_address"],
  documents: ["id_card_photo", "house_reg_photo"],
};

const GROUP_LABEL: Record<CustomerGroup, string> = {
  identity: "ชื่อ",
  contact: "เบอร์",
  project: "โครงการ",
  installation: "ที่อยู่",
  id_card: "บัตร",
  documents: "เอกสาร",
};

const FIELD_LABEL: Record<CustomerField, string> = {
  full_name: "ชื่อ-นามสกุล",
  phone: "เบอร์โทร",
  project: "โครงการ",
  installation_address: "ที่อยู่ติดตั้ง",
  id_card_number: "เลขบัตรประชาชน",
  id_card_address: "ที่อยู่ตามบัตร",
  id_card_photo: "สำเนาบัตรประชาชน",
  house_reg_photo: "สำเนาทะเบียนบ้าน",
};

interface Props {
  values: CustomerValues;
  onChange: (patch: Partial<CustomerValues>) => void;
  fields?: CustomerField[];
  groups?: CustomerGroup[];
  showScan?: boolean;
  onScan?: (data: Partial<CustomerValues>) => void;
  projects?: Project[];
  required?: CustomerField[];
  title?: string;
  className?: string;
  showWizard?: boolean;
}

const fieldCard = "rounded-lg bg-white border border-gray-200 p-3";
const fieldLabel = "text-sm font-semibold tracking-wider uppercase text-gray-400 block mb-1.5";
const fieldInput = "w-full h-11 px-3 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors";
const fieldTextarea = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-base focus:outline-none focus:border-primary transition-colors resize-none";

export default function CustomerInfoForm({
  values,
  onChange,
  fields,
  groups,
  showScan,
  onScan,
  projects: projectsProp,
  required = [],
  title,
  className,
  showWizard,
}: Props) {
  const activeGroups: CustomerGroup[] = groups || [];
  const activeFields = new Set<CustomerField>(
    fields ?? activeGroups.flatMap(g => GROUP_FIELDS[g])
  );
  const has = (f: CustomerField) => activeFields.has(f);
  const isReq = (f: CustomerField) => required.includes(f);
  const req = (f: CustomerField) => isReq(f) ? <span className="text-red-500">*</span> : null;

  const wizardEnabled = !!(showWizard && activeGroups.length > 1);
  const [subStep, setSubStep] = useState(0);
  const [nextError, setNextError] = useState<string | null>(null);
  const currentGroup = wizardEnabled ? activeGroups[subStep] : null;
  const visibleFields: Set<CustomerField> = wizardEnabled && currentGroup
    ? new Set(GROUP_FIELDS[currentGroup])
    : activeFields;
  const show = (f: CustomerField) => visibleFields.has(f) && has(f);

  const [projects, setProjects] = useState<Project[]>(projectsProp || []);
  const [projectText, setProjectText] = useState<string>(values.project_name || "");
  const [projectFocused, setProjectFocused] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<"idle" | "reading" | "done" | "failed">("idle");
  const [locating, setLocating] = useState(false);
  const [searchingProject, setSearchingProject] = useState(false);

  const searchProjectAddress = async () => {
    const q = projectText.trim();
    if (!q) return;
    setSearchingProject(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&accept-language=th&countrycodes=th&limit=1`,
        { headers: { "User-Agent": "sena-solar-app/1.0" } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.display_name) {
        onChange({ installation_address: data[0].display_name });
      }
    } finally { setSearchingProject(false); }
  };

  useEffect(() => {
    if (!projectsProp && has("project")) {
      apiFetch("/api/projects").then(setProjects).catch(console.error);
    }
  }, [projectsProp]);

  useEffect(() => {
    if (values.project_name && values.project_name !== projectText) setProjectText(values.project_name);
  }, [values.project_name]);

  const selectedProject = projects.find(p => String(p.id) === String(values.project_id));
  const zoneText = selectedProject ? [selectedProject.district, selectedProject.province].filter(Boolean).join(", ") : "";
  const projectSuggestions = projectFocused && projectText.length >= 1
    ? projects.filter(p => p.name.toLowerCase().includes(projectText.toLowerCase()))
    : [];

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
          if (data.display_name) onChange({ installation_address: data.display_name });
        } finally { setLocating(false); }
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const uploadDoc = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: { "ngrok-skip-browser-warning": "true" } });
      const { url } = await res.json();
      return url;
    } catch { return null; }
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setOcrStatus("reading");
    try {
      const url = await uploadDoc(file);
      if (!url) throw new Error("upload failed");
      // Always request all known keys — doc may have any subset
      const requestedKeys = ["full_name", "phone", "installation_address", "id_card_number", "id_card_address", "ca_number", "meter_number", "utility_provider", "monthly_bill"];
      console.log("[OCR] request", { imageUrl: url, fields: requestedKeys });
      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ imageUrl: url, fields: requestedKeys }),
      });
      const ocrJson = await ocrRes.json();
      console.log("[OCR] response", ocrJson);
      const data = ocrJson.data || {};
      // Map all returned keys back to the form (one-liner, no per-field checks)
      const patch: Record<string, unknown> = {};
      for (const key of requestedKeys) {
        if (data[key]) patch[key] = data[key];
      }
      if (Object.keys(patch).length === 0) {
        setOcrStatus("failed");
        setTimeout(() => setOcrStatus("idle"), 2500);
        return;
      }
      // If got id_card_address but installation_address is empty, seed it
      if (patch.id_card_address && !values.installation_address && !patch.installation_address) {
        patch.installation_address = patch.id_card_address;
      }
      onChange(patch as Partial<CustomerValues>);
      onScan?.(patch as Partial<CustomerValues>);
      setOcrStatus("done");
      setTimeout(() => setOcrStatus("idle"), 2500);
    } catch {
      setOcrStatus("failed");
      setTimeout(() => setOcrStatus("idle"), 2500);
    }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "id_card_photo_url" | "house_reg_photo_url") => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(field);
    try {
      const url = await uploadDoc(file);
      if (url) onChange({ [field]: url });
    } finally { setUploading(null); }
  };

  const validateGroup = (g: CustomerGroup): string[] => {
    const missing: string[] = [];
    const grpFields = GROUP_FIELDS[g];
    grpFields.filter(isReq).forEach(f => {
      if (f === "project") {
        if (!values.project_id && !values.project_name) missing.push(FIELD_LABEL[f]);
      } else if (f === "id_card_number") {
        if (!values.id_card_number || values.id_card_number.length !== 13) missing.push(FIELD_LABEL[f] + " (13 หลัก)");
      } else if (f === "id_card_photo") {
        if (!values.id_card_photo_url) missing.push(FIELD_LABEL[f]);
      } else if (f === "house_reg_photo") {
        if (!values.house_reg_photo_url) missing.push(FIELD_LABEL[f]);
      } else {
        const key = f === "full_name" ? "full_name"
          : f === "phone" ? "phone"
          : f === "installation_address" ? "installation_address"
          : f === "id_card_address" ? "id_card_address"
          : "";
        const v = (values as Record<string, unknown>)[key];
        if (!v || (typeof v === "string" && !v.trim())) missing.push(FIELD_LABEL[f]);
      }
    });
    return missing;
  };

  const showHeader = title !== undefined || showScan;

  return (
    <div className={`space-y-2 ${className || ""}`}>
      {showHeader && (
        <>
          {title && <div className="text-base font-bold text-gray-800 px-1">{title}</div>}
          {showScan && (
            <>
              <input type="file" accept="image/*" capture="environment" onChange={handleScan} className="hidden" id="cif-scan-doc" />
              <label htmlFor="cif-scan-doc" className="flex items-center gap-3 rounded-lg bg-active-light border border-active/20 p-4 cursor-pointer hover:bg-active/10 transition-colors">
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
                  {ocrStatus === "reading" ? <div className="text-sm font-bold text-active">กำลังอ่านข้อมูล…</div>
                    : ocrStatus === "done" ? <div className="text-sm font-bold text-emerald-700">✓ กรอกข้อมูลแล้ว</div>
                    : ocrStatus === "failed" ? <div className="text-sm font-bold text-gray-700">อ่านไม่ได้ ลองอีกครั้ง</div>
                    : <><div className="text-sm font-bold text-active">ถ่ายรูปเอกสาร</div><div className="text-xs text-active/70">บัตรประชาชน · ทะเบียนบ้าน · บิลค่าไฟ</div></>}
                </div>
              </label>
            </>
          )}
        </>
      )}

      {/* Wizard indicator */}
      {wizardEnabled && (
        <div className="flex items-center gap-1 mb-2">
          {activeGroups.map((g, i) => {
            const goTo = () => {
              if (i <= subStep) { setNextError(null); setSubStep(i); return; }
              const missing = validateGroup(activeGroups[subStep]);
              if (missing.length > 0) { setNextError(missing.join(", ")); return; }
              setNextError(null);
              setSubStep(i);
            };
            return (
              <button key={g} type="button" onClick={goTo} className="flex-1 flex flex-col items-center gap-1 cursor-pointer">
                <div className={`h-1 w-full rounded-full transition-colors ${i <= subStep ? "bg-active" : "bg-gray-200"}`} />
                <span className={`text-xs font-semibold transition-colors ${i === subStep ? "text-active" : i < subStep ? "text-gray-500" : "text-gray-300"}`}>{GROUP_LABEL[g]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Name + Phone */}
      {(show("full_name") || show("phone")) && (
        <div className={fieldCard}>
          <div className={show("full_name") && show("phone") ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
            {show("full_name") && (
              <div>
                <label className={fieldLabel}>ชื่อ-นามสกุล {req("full_name")}</label>
                <input type="text" value={values.full_name ?? ""} onChange={e => onChange({ full_name: e.target.value })} placeholder="ชื่อลูกค้า" className={fieldInput} />
              </div>
            )}
            {show("phone") && (
              <div>
                <label className={fieldLabel}>เบอร์โทร {req("phone")}</label>
                <input type="tel" value={values.phone ?? ""} onChange={e => onChange({ phone: e.target.value })} placeholder="08x-xxx-xxxx" className={fieldInput + " font-mono tabular-nums"} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project + Installation address */}
      {(show("project") || show("installation_address")) && (
        <div className={fieldCard}>
          <div className={show("project") && show("installation_address") ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
            {show("project") && (
              <div className="relative">
                <label className={fieldLabel}>โครงการ {req("project")}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={projectText}
                    onChange={e => { setProjectText(e.target.value); onChange({ project_id: null, project_name: e.target.value }); }}
                    onFocus={() => setProjectFocused(true)}
                    onBlur={() => setTimeout(() => setProjectFocused(false), 200)}
                    placeholder="พิมพ์ชื่อโครงการ..."
                    className={fieldInput + " bg-white flex-1"}
                  />
                  <button type="button" onClick={searchProjectAddress} disabled={!projectText.trim() || searchingProject} title="หาที่อยู่โครงการ" className="shrink-0 h-11 px-3 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:border-active/40 hover:text-active disabled:opacity-40 transition-colors">
                    {searchingProject ? (
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
                    )}
                  </button>
                </div>
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
                        onClick={() => { setProjectText(p.name); onChange({ project_id: p.id, project_name: p.name }); setProjectFocused(false); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-active-light transition-colors"
                      >
                        <div className="text-sm text-gray-800">{p.name}</div>
                        {(p.district || p.province) && <div className="text-xs text-gray-400">{[p.district, p.province].filter(Boolean).join(", ")}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {show("installation_address") && (
              <div>
                <label className={fieldLabel}>ที่อยู่ติดตั้ง {req("installation_address")}</label>
                <textarea value={values.installation_address ?? ""} onChange={e => onChange({ installation_address: e.target.value })} placeholder="ที่อยู่" rows={2} className={fieldTextarea} />
                <button type="button" onClick={handleGetLocation} disabled={locating} className="w-full h-9 mt-1.5 rounded-lg border border-gray-200 bg-white flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-500 hover:border-active/40 hover:text-active transition-colors">
                  {locating ? <><div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังหาตำแหน่ง…</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg> ใช้ตำแหน่งปัจจุบัน</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ID Card number */}
      {show("id_card_number") && (
        <div className={fieldCard}>
          <label className={fieldLabel}>เลขบัตรประชาชน {req("id_card_number")}</label>
          <input type="text" inputMode="numeric" maxLength={13} value={values.id_card_number ?? ""} onChange={e => onChange({ id_card_number: e.target.value.replace(/\D/g, "").slice(0, 13) })} placeholder="13 หลัก" className={fieldInput + " font-mono tabular-nums"} />
        </div>
      )}

      {/* ID Card address */}
      {show("id_card_address") && (
        <div className={fieldCard}>
          <label className={fieldLabel}>ที่อยู่ตามบัตรประชาชน {req("id_card_address")}</label>
          <textarea value={values.id_card_address ?? ""} onChange={e => onChange({ id_card_address: e.target.value })} placeholder="ที่อยู่ตามบัตร" rows={2} className={fieldTextarea} />
        </div>
      )}

      {/* Document uploads */}
      {(show("id_card_photo") || show("house_reg_photo")) && (
        <div className={fieldCard}>
          <label className={fieldLabel}>เอกสารประกอบ</label>
          <div className="space-y-3">
            {show("id_card_photo") && (
              <div>
                <div className="text-xs text-gray-500 mb-1.5">สำเนาบัตรประชาชน {req("id_card_photo")}</div>
                <input type="file" accept="image/*" capture="environment" onChange={e => handleDocUpload(e, "id_card_photo_url")} className="hidden" id="cif-id-card-upload" />
                {values.id_card_photo_url ? (
                  <div className="relative inline-block">
                    <a href={values.id_card_photo_url} target="_blank" rel="noreferrer"><img src={values.id_card_photo_url} alt="ID Card" className="h-20 rounded-lg border border-gray-200" /></a>
                    <button type="button" onClick={() => onChange({ id_card_photo_url: null })} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow">×</button>
                  </div>
                ) : (
                  <label htmlFor="cif-id-card-upload" className="w-full h-10 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 cursor-pointer hover:border-active/40 hover:text-active text-gray-500 text-sm">
                    {uploading === "id_card_photo_url" ? <><div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังอัปโหลด…</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> ถ่ายรูป / อัปโหลด</>}
                  </label>
                )}
              </div>
            )}
            {show("house_reg_photo") && (
              <div>
                <div className="text-xs text-gray-500 mb-1.5">สำเนาทะเบียนบ้าน {req("house_reg_photo")}</div>
                <input type="file" accept="image/*" capture="environment" onChange={e => handleDocUpload(e, "house_reg_photo_url")} className="hidden" id="cif-house-reg-upload" />
                {values.house_reg_photo_url ? (
                  <div className="relative inline-block">
                    <a href={values.house_reg_photo_url} target="_blank" rel="noreferrer"><img src={values.house_reg_photo_url} alt="House Reg" className="h-20 rounded-lg border border-gray-200" /></a>
                    <button type="button" onClick={() => onChange({ house_reg_photo_url: null })} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow">×</button>
                  </div>
                ) : (
                  <label htmlFor="cif-house-reg-upload" className="w-full h-10 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 cursor-pointer hover:border-active/40 hover:text-active text-gray-500 text-sm">
                    {uploading === "house_reg_photo_url" ? <><div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังอัปโหลด…</> : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> ถ่ายรูป / อัปโหลด</>}
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wizard nav buttons */}
      {wizardEnabled && (
        <div className="flex gap-2 mt-3">
          {subStep > 0 && (
            <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          )}
          {subStep < activeGroups.length - 1 && (
            <button type="button" onClick={() => {
              const missing = validateGroup(activeGroups[subStep]);
              if (missing.length > 0) { setNextError(missing.join(", ")); return; }
              setNextError(null);
              setSubStep(subStep + 1);
            }} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
              ถัดไป
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          )}
        </div>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
  );
}
