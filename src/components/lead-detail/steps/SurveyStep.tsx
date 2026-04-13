"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps, Package } from "./types";
import SurveyForm from "./SurveyForm";

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const SURVEY_TIME_SLOTS = [
  { value: "morning", label: "เช้า", time: "09:00 - 12:00" },
  { value: "afternoon", label: "บ่าย", time: "13:00 - 16:00" },
];

interface Props extends StepCommonProps {
  onAddActivity: (type: string) => void;
  packages: Package[];
}

export default function SurveyStep({ lead, state, refresh, packages }: Props) {
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState<string>(lead.survey_date ? lead.survey_date.slice(0, 10) : "");
  const [newSlot, setNewSlot] = useState<string>(lead.survey_time_slot ?? "");
  const [saving, setSaving] = useState(false);
  const [surveyNote, setSurveyNote] = useState<string>(lead.survey_note ?? "");
  const [surveyPhotos, setSurveyPhotos] = useState<string[]>(lead.survey_photos ? lead.survey_photos.split(",").filter(Boolean) : []);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [scheduledSurveys, setScheduledSurveys] = useState<{ id: number; survey_date: string; survey_time_slot: string | null }[]>([]);

  // Auto-save survey note (debounced)
  useEffect(() => {
    if (!lead.survey_confirmed) return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_note: surveyNote || null }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyNote]);

  useEffect(() => {
    if (!rescheduling) return;
    apiFetch("/api/surveys/scheduled")
      .then((data) => setScheduledSurveys(data.filter((s: { id: number }) => s.id !== lead.id)))
      .catch(console.error);
  }, [rescheduling, lead.id]);

  const surveyCountByDate = scheduledSurveys.reduce<Record<string, { morning: number; afternoon: number }>>((acc, s) => {
    const key = s.survey_date.slice(0, 10);
    if (!acc[key]) acc[key] = { morning: 0, afternoon: 0 };
    if (s.survey_time_slot === "morning") acc[key].morning++;
    else if (s.survey_time_slot === "afternoon") acc[key].afternoon++;
    return acc;
  }, {});

  const slotLabel = SURVEY_TIME_SLOTS.find(s => s.value === lead.survey_time_slot)?.time ?? lead.survey_time_slot;

  const persistPhotos = async (next: string[]) => {
    setSurveyPhotos(next);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_photos: next.length ? next.join(",") : null }),
    });
    refresh();
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPhotoUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: fd,
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        const { url } = await res.json();
        uploaded.push(url);
      }
      await persistPhotos([...surveyPhotos, ...uploaded]);
    } finally {
      setPhotoUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = async (url: string) => {
    fetch(`/api/upload?file=${encodeURIComponent(url)}`, {
      method: "DELETE",
      headers: { "ngrok-skip-browser-warning": "true" },
    }).catch(() => {});
    await persistPhotos(surveyPhotos.filter(u => u !== url));
  };

  const confirmAppointment = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_confirmed: true }),
      });
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const saveReschedule = async () => {
    if (!newDate || !newSlot) return;
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_date: newDate, survey_time_slot: newSlot, survey_confirmed: false }),
      });
      setRescheduling(false);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const markDone = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "quoted" }),
      });
      refresh();
    } finally {
      setSaving(false);
    }
  };

  if (state === "done") {
    const formatDate = (d: string) =>
      new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
    const slotTime = SURVEY_TIME_SLOTS.find(s => s.value === lead.survey_time_slot)?.time;
    return (
      <details className="group">
        <summary className="flex items-center gap-2 cursor-pointer list-none py-1">
          <span className="text-sm font-semibold text-emerald-700">สำรวจเสร็จสิ้นแล้ว</span>
          {lead.survey_date && (
            <span className="text-sm text-gray-600">
              · {formatDate(lead.survey_date)} {slotTime && slotTime}
            </span>
          )}
          <span className="flex-1" />
          <svg className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </summary>
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-sm">
          {lead.survey_electrical_phase && (
            <div className="flex justify-between"><span className="text-gray-400">ระบบไฟ</span><span className="font-semibold text-gray-800">{lead.survey_electrical_phase === "1_phase" ? "1 เฟส" : "3 เฟส"}</span></div>
          )}
          {lead.survey_grid_type && (
            <div className="flex justify-between"><span className="text-gray-400">เชื่อมต่อ</span><span className="font-semibold text-gray-800">{lead.survey_grid_type === "on_grid" ? "On-Grid" : lead.survey_grid_type === "hybrid" ? "Hybrid" : "Off-Grid"}</span></div>
          )}
          {lead.survey_utility && (
            <div className="flex justify-between"><span className="text-gray-400">การไฟฟ้า</span><span className="font-semibold text-gray-800">{lead.survey_utility}</span></div>
          )}
          {lead.survey_meter_size && (
            <div className="flex justify-between"><span className="text-gray-400">มิเตอร์</span><span className="font-semibold text-gray-800">{lead.survey_meter_size.replace("_", "(") + ") A"}</span></div>
          )}
          {lead.survey_ca_number && (
            <div className="flex justify-between"><span className="text-gray-400">เลข CA</span><span className="font-semibold text-gray-800 font-mono">{lead.survey_ca_number}</span></div>
          )}
          {lead.survey_roof_material && (
            <div className="flex justify-between"><span className="text-gray-400">วัสดุหลังคา</span><span className="font-semibold text-gray-800">{lead.survey_roof_material}</span></div>
          )}
          {lead.survey_roof_orientation && (
            <div className="flex justify-between"><span className="text-gray-400">ทิศหลังคา</span><span className="font-semibold text-gray-800">{lead.survey_roof_orientation}</span></div>
          )}
          {lead.survey_roof_area_m2 && (
            <div className="flex justify-between"><span className="text-gray-400">พื้นที่หลังคา</span><span className="font-semibold text-gray-800">{lead.survey_roof_area_m2} m²</span></div>
          )}
          {lead.survey_monthly_bill != null && (
            <div className="flex justify-between"><span className="text-gray-400">ค่าไฟ/เดือน</span><span className="font-semibold text-gray-800 font-mono">{lead.survey_monthly_bill.toLocaleString()} บาท</span></div>
          )}
          {lead.survey_note && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-gray-400 mb-1">บันทึก Survey</div>
              <div className="text-gray-800">{lead.survey_note}</div>
            </div>
          )}
          {lead.survey_photos && (
            <div className="pt-2 border-t border-gray-100">
              <div className="text-gray-400 mb-1">รูปถ่าย</div>
              <div className="grid grid-cols-3 gap-2">
                {lead.survey_photos.split(",").filter(Boolean).map(url => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Survey" className="w-full aspect-square object-cover rounded-lg border border-gray-200" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>
    );
  }
  if (state !== "active") return null;

  // Reschedule mode — calendar picker
  if (rescheduling) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const months = [
      new Date(today.getFullYear(), today.getMonth(), 1),
      new Date(today.getFullYear(), today.getMonth() + 1, 1),
    ];
    const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
    return (
      <div className="space-y-3">
        <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">เลื่อนนัดสำรวจ</div>
        <div className="grid grid-cols-2 gap-2">
          {months.map(monthStart => {
            const monthLabel = monthStart.toLocaleDateString("th-TH", { month: "long" });
            const firstDayOfWeek = monthStart.getDay();
            const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
            return (
              <div key={monthStart.toISOString()}>
                <div className="text-xs font-semibold text-gray-700 mb-1 text-center">{monthLabel}</div>
                <div className="grid grid-cols-7 mb-0.5">
                  {WEEKDAYS.map((w, i) => (
                    <div key={w} className={`text-xs text-center font-semibold py-0.5 ${i === 0 || i === 6 ? "text-red-400" : "text-gray-400"}`}>{w}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`pad-${i}`} className="h-9" />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                    const selected = newDate === iso;
                    const isPast = d < today;
                    const isToday = d.getTime() === today.getTime();
                    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                    const counts = surveyCountByDate[iso];
                    const isFull = !!(counts && counts.morning > 0 && counts.afternoon > 0);
                    const isPartial = !!(counts && (counts.morning > 0 || counts.afternoon > 0) && !isFull);
                    const disabled = isPast || isFull;
                    let bookedClass = "";
                    if (!isPast && !selected) {
                      if (isFull) bookedClass = "bg-red-100 text-red-500 line-through";
                      else if (isPartial) bookedClass = "bg-amber-100 text-amber-700";
                    }
                    return (
                      <div key={iso} className="h-9 flex items-center justify-center">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => { setNewDate(iso); setNewSlot(""); }}
                          style={{ minHeight: 0 }}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm leading-none font-semibold transition-all ${
                            selected
                              ? "bg-active text-white shadow-sm shadow-active/30"
                              : isPast
                              ? "text-gray-300 cursor-not-allowed"
                              : bookedClass
                              ? bookedClass + (isFull ? " cursor-not-allowed" : " hover:brightness-95")
                              : isToday
                              ? "bg-active-light text-active ring-1 ring-active/30 hover:bg-active hover:text-white"
                              : `${isWeekend ? "text-red-500" : "text-gray-700"} hover:bg-active-light hover:text-active`
                          }`}
                        >
                          {d.getDate()}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {newDate && (
          <div className="pt-3 border-t border-gray-100">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-2">ช่วงเวลานัด</div>
            <div className="grid grid-cols-3 gap-2">
              {SURVEY_TIME_SLOTS.map(s => {
                const selected = newSlot === s.value;
                const counts = surveyCountByDate[newDate];
                const taken = !!(counts && (s.value === "morning" ? counts.morning > 0 : counts.afternoon > 0));
                return (
                  <button
                    key={s.value}
                    type="button"
                    disabled={taken}
                    onClick={() => setNewSlot(s.value)}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border transition-all ${
                      selected
                        ? "bg-active border-active text-white shadow-sm shadow-active/20"
                        : taken
                        ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-white border-gray-200 hover:border-active/40 text-gray-700"
                    }`}
                  >
                    <span className="text-[15px] font-bold font-mono tabular-nums">{s.time}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {newDate && newSlot && (
          <div className="rounded-lg bg-active-light border border-active/20 p-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-active shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-active/70">เลื่อนเป็น</div>
              <div className="text-sm font-bold text-active">
                {formatDate(newDate)}
                <span className="ml-1.5 font-mono tabular-nums">{SURVEY_TIME_SLOTS.find(s => s.value === newSlot)?.time}</span>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setRescheduling(false); setNewDate(lead.survey_date ? lead.survey_date.slice(0, 10) : ""); setNewSlot(lead.survey_time_slot ?? ""); }}
            className="flex-1 h-11 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-400"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={saveReschedule}
            disabled={!newDate || !newSlot || saving}
            className="flex-[2] h-11 rounded-lg text-sm font-bold text-white bg-active hover:bg-active-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-active/30 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                กำลังบันทึก…
              </>
            ) : !newDate || !newSlot ? (
              "เลือกวันและเวลา"
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                ยืนยันเลื่อนนัด
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Default mode — show appointment + (after confirm) verify pre-survey + note + photos
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${lead.survey_confirmed ? "bg-emerald-50 border-emerald-600/15" : "bg-active-light border-active/20"}`}>
        <svg className={`w-4 h-4 shrink-0 ${lead.survey_confirmed ? "text-emerald-600" : "text-active"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
        </svg>
        <div className="flex-1 flex items-baseline gap-1.5 flex-wrap min-w-0">
          <span className={`text-xs font-semibold tracking-wider uppercase ${lead.survey_confirmed ? "text-emerald-700/70" : "text-active/70"}`}>
            {lead.survey_confirmed ? "ยืนยันแล้ว" : "นัดหมายแล้ว"}
          </span>
          {lead.survey_date && (
            <span className={`text-sm font-bold ${lead.survey_confirmed ? "text-emerald-900" : "text-active"}`}>
              {formatDate(lead.survey_date)}
              {slotLabel && <span className="ml-1 font-mono tabular-nums">{slotLabel}</span>}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setRescheduling(true)}
          className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border transition-colors ${
            lead.survey_confirmed
              ? "border-emerald-600/20 text-emerald-700 hover:bg-emerald-100"
              : "border-active/30 text-active hover:bg-active/10"
          }`}
        >
          Reschedule
        </button>
      </div>

      {!lead.survey_confirmed ? (
        <button
          onClick={confirmAppointment}
          disabled={saving}
          className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors"
        >
          {saving ? "…" : "ยืนยันนัดหมาย"}
        </button>
      ) : (
        <>
          {/* Re-confirm pre-survey questionnaire on-site */}
          <div className="pt-2">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2 px-1">
              ตรวจยืนยันข้อมูลหน้างาน
            </div>
            <SurveyForm lead={lead} refresh={refresh} />
          </div>

          {/* Survey note */}
          <div className="rounded-lg bg-white/60 border border-active/15 p-3 mt-2">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">บันทึก Survey</label>
            <textarea
              value={surveyNote}
              onChange={e => setSurveyNote(e.target.value)}
              placeholder="บันทึกหน้างาน เช่น สภาพหลังคา, ข้อจำกัด, ข้อแนะนำ..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Extra photos */}
          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400">รูปถ่ายเพิ่มเติม</label>
              {surveyPhotos.length > 0 && (
                <span className="text-xs text-gray-500">{surveyPhotos.length} รูป</span>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
              id={`survey-photos-${lead.id}`}
            />
            {surveyPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
                {surveyPhotos.map(url => (
                  <div key={url} className="relative aspect-square">
                    <a href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt="Survey" className="w-full h-full object-cover rounded-lg border border-gray-200" />
                    </a>
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label
              htmlFor={`survey-photos-${lead.id}`}
              className="w-full h-10 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 cursor-pointer hover:border-active/40 hover:text-active text-gray-500 text-sm transition-colors"
            >
              {photoUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
                  กำลังอัปโหลด…
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  เพิ่มรูปถ่าย
                </>
              )}
            </label>
          </div>

          <button
            onClick={markDone}
            disabled={saving}
            className="w-full h-11 mt-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors"
          >
            สำรวจเสร็จสิ้น
          </button>
        </>
      )}
    </div>
  );
}
