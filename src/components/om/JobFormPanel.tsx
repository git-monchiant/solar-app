"use client";

// ใบตรวจรับงาน / ใบบริการ — แยกออกมาจาก /om/field/[id] ตอนเฟส 3 (แผน 20260922-01)
// ใช้ร่วมกัน 2 ที่: หน้าช่างเต็มจอ (route เดิม) กับการ์ดขั้นเข้างานในหน้ารายละเอียดงานบริการ
// ★ 16 ก.ย. 69: หัวข้อในใบไม่ใช่ const ในโค้ดแล้ว — มาจากฐาน (om_job_form + om_job_form_item)
//   API คืน form.items มาให้ · หน้านี้วนตามข้อมูล แต่ละชนิดงานจึงเห็นใบของตัวเอง
//   ช่องกรอกเลือกจาก kind: bool = ผ่าน/ไม่ผ่าน · num = ใส่ตัวเลข+หน่วย · text/photo ยังเป็นโครง
// ★ 28 ก.ย. 69 (แผน 20260928-03): โครง + หน้าตายกจากขั้นติดตั้งฝั่งขายทั้งก้อน
//   แถบขั้นย่อย = StepLayout ตัวเดียวกับ InstallStep · ปุ่มย้อนกลับ/ถัดไป = InstallStep
//   กล่อง/หัวข้อ/ปุ่มผ่าน-ไม่ผ่าน/ช่องวัดค่า = InstallChecklist — แก้ฝั่งนั้นแล้วตามมาแก้ที่นี่ด้วย
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import ErrorPopup from "@/components/ui/ErrorPopup";
import StepLayout from "@/components/lead/detail/StepLayout";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { useOmPhotoUrls } from "@/lib/hooks/useOmPhotoUrls";
import ServiceDocButton from "@/components/om/ServiceDocButton";
import {
  CameraIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, PlusIcon, UserIcon,
} from "@/components/ui/icons";
import { PROXY_REASONS, failCount, type Checks, type FormItem, type JobForm } from "@/lib/om/job-form";
import { statusLabel } from "@/lib/om/booking";
import { thAppt } from "@/lib/om/service-view";

type Job = {
  id: number; house_id: number; status: string; team_name: string | null; scheduled_at: string | null;
  time_slot?: string | null;
  service_type: string | null; consumes_quota: number; house_number: string | null;
  project_name: string | null; customer_name: string | null; phone: string | null; kwp_list: string | null;
};
type Report = {
  job_no: string | null; checks: Checks; measures: Record<string, number | null>;
  note: string | null; result: string | null; tech_sign: string | null; cust_sign: string | null;
  close_method: string | null; proxy_reason: string | null;
  repair_needed: number | null; repair_detail: string | null;
};
type FormWithItems = JobForm & { items: FormItem[] };


// ขั้นย่อยของขั้นเข้างาน — แบบ SUB_STEPS ของ InstallStep (นัด / ตรวจ / … / ส่งมอบ)
const SUB_STEPS = ["ตรวจ", "รูป · บันทึก", "ส่งมอบ"] as const;

// หัวหมวดแบบ InstallChecklist (อังกฤษตัวใหญ่) ต่อท้ายชื่อไทยให้ช่างอ่านง่าย
// หมวดที่ยังไม่รู้จักใช้ code ของหมวดไปก่อน ไม่ทำให้ข้อหาย
const SECTION_META: Record<string, { en: string; th: string }> = {
  quality: { en: "Visual Inspection", th: "คุณภาพงาน" },
  measure: { en: "Function Tests", th: "การทดสอบระบบ" },
  photo: { en: "Photos", th: "รูปถ่าย" },
};

// ── ชุดคลาสเดียวกับ InstallChecklist ──
const SECTION = "rounded-lg bg-white/60 border border-active/15 p-3";
const SECTION_TITLE = "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2";
const SECTION_ICON = "w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0";
const SUB_CARD = "rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2";
const SUB_TITLE = "text-xs font-semibold text-gray-500 uppercase tracking-wide";
const FIELD_LABEL = "text-xs text-gray-500 block mb-1";
const INPUT = "w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-500";
const PASS_BTN = (on: boolean) => `h-8 rounded-lg text-sm font-semibold border transition-all ${on
  ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`;
const FAIL_BTN = (on: boolean) => `h-8 rounded-lg text-sm font-semibold border transition-all ${on
  ? "bg-red-500 text-white border-red-500" : "bg-white text-gray-600 border-gray-200 hover:border-red-300"}`;
// ปุ่มเลือก = chipBtn ของ JobDetail (ชุดเดียวกับ PreSurveyForm ฝั่งขาย)
const chipBtn = (on: boolean) =>
  `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${on
    ? "bg-active text-white border-active shadow-sm shadow-active/20"
    : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"}`;
// ปุ่มท้ายการ์ด = ย้อนกลับ / ถัดไป / ยืนยันส่งมอบงาน ของ InstallStep
const NAV_BACK = "flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 cursor-pointer";
const NAV_DRAFT = "flex-1 md:flex-none md:w-40 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50";
const NAV_NEXT = "flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1 cursor-pointer";
const NAV_CLOSE = "flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer";

// ไม่มีในชุด ui/icons — path เดียวกับไอคอนขั้นเข้างานใน JobDetail (heroicons wrench)
const WrenchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z" />
  </svg>
);

/** หัวกล่อง — ไอคอนม่วง + ชื่ออังกฤษตัวใหญ่ แบบ InstallChecklist · th/right = ตัวอักษรปกติสีจาง */
function SectionHead({ icon, en, th, right }: {
  icon: React.ReactNode; en: string; th?: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className={SECTION_TITLE}>
      <span className={SECTION_ICON}>{icon}</span>
      {/* จอเล็ก (มือถือช่าง) ชื่อไทยลงบรรทัดใหม่ — เดิมบีบอยู่แถวเดียวกับชื่ออังกฤษ+จำนวนข้อจนตัดคำกลางชื่อ */}
      <span className="min-w-0 leading-tight">
        {en}
        {th && <span className="block sm:inline sm:ml-2 normal-case tracking-normal font-normal text-gray-400">{th}</span>}
      </span>
      {right && <span className="ml-auto shrink-0 whitespace-nowrap normal-case tracking-normal font-normal text-gray-400">{right}</span>}
    </div>
  );
}

/** แผ่นเซ็น — วาดด้วยนิ้วหรือเมาส์ แล้วเก็บเป็น data URL · หน้าตาแบบ SignaturePad ฝั่งขาย
 *  (ใช้ตัวนั้นตรง ๆ ไม่ได้ เพราะมันบันทึกลงคอลัมน์ของ lead เอง) */
function SignPad({ value, onChange, label, required, disabled }: {
  value: string | null; onChange: (v: string | null) => void; label: string; required?: boolean; disabled?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  // ค่าที่แผ่นนี้ส่งออกไปเอง — ไม่ต้องวาดทับซ้ำ วาดเฉพาะค่าที่มาจากฐาน (เปิดใบที่เซ็นไว้แล้ว / สลับขั้นย่อยกลับมา)
  const emitted = useRef<string | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || value === emitted.current) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!value) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
    img.src = value;
  }, [value]);

  const pos = (e: React.PointerEvent) => {
    const c = ref.current!, r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111827";
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const url = ref.current!.toDataURL("image/png");
    emitted.current = url; onChange(url);
  };
  const clear = () => {
    const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    emitted.current = null; onChange(null);
  };
  return (
    <div className="space-y-2">
      <label className={FIELD_LABEL}>{label} {required && <span className="text-red-500">*</span>}</label>
      <div className={`relative bg-white border rounded-lg overflow-hidden ${value ? "border-primary" : "border-gray-200"}`}
        style={{ touchAction: "none" }}>
        <canvas ref={ref} width={520} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className={`w-full h-32 ${disabled ? "pointer-events-none" : "cursor-crosshair"}`} />
        {!value && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm pointer-events-none">
            {disabled ? "ไม่มีลายเซ็น" : "เซ็นชื่อที่นี่"}
          </div>
        )}
      </div>
      {!disabled && (
        <button type="button" onClick={clear} disabled={!value}
          className="w-full h-8 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 cursor-pointer">ล้าง</button>
      )}
    </div>
  );
}

/** 1 ข้อในใบตรวจ — รูปแบบช่องกรอกมาจาก kind ที่นิยามไว้ในฐาน ไม่ใช่จากหมวด
 *  วางในกริด 6 คอลัมน์ของหมวด: bool/อื่น ๆ เต็มแถว · num ครึ่งแถว (2 ช่องต่อแถวแบบ FUNCTION TESTS) */
function ItemRow({ it, n, disabled, value, num, onPass, onFix, onNum }: {
  it: FormItem; n: number; disabled: boolean;
  value: { pass?: boolean; fix?: string }; num: string;
  onPass: (pass: boolean | undefined) => void; onFix: (fix: string) => void; onNum: (v: string) => void;
}) {
  const optional = !it.required && <span className="ml-1 text-[10px] text-gray-400">(ไม่บังคับ)</span>;

  // แถวแบบ VISUAL INSPECTION: ชื่อข้อ (3) + ผ่าน (1) + ไม่ผ่าน (1) + หมายเหตุ (2) = 7 · กดซ้ำ = ยกเลิกเลือก
  // ★ ช่องหมายเหตุเก็บใน fix เดิม — ข้อไม่ผ่านใช้เป็น "รายการที่ต้องแก้ไข" (ดึงไปเติมอาการตอนติ๊กพบงานซ่อม)
  if (it.kind === "bool") return (
    <div className="md:col-span-6 grid grid-cols-2 md:grid-cols-7 gap-2 items-center">
      <div className="col-span-2 md:col-span-3 text-xs text-gray-700">
        <span className="text-gray-400 font-semibold mr-1.5">{n}.</span>{it.label_th}{optional}
      </div>
      <button type="button" disabled={disabled} onClick={() => onPass(value.pass === true ? undefined : true)}
        className={`col-span-1 ${PASS_BTN(value.pass === true)}`}>ผ่าน</button>
      <button type="button" disabled={disabled} onClick={() => onPass(value.pass === false ? undefined : false)}
        className={`col-span-1 ${FAIL_BTN(value.pass === false)}`}>ไม่ผ่าน</button>
      <input type="text" value={value.fix ?? ""} onChange={(e) => onFix(e.target.value)} disabled={disabled}
        placeholder={value.pass === false ? "รายการที่ต้องแก้ไข" : "หมายเหตุ"}
        className={`col-span-2 md:col-span-2 ${INPUT}`} />
    </div>
  );

  // MeasureField ของ InstallChecklist — ป้ายชิดขวา · หน่วยอยู่ในช่อง
  if (it.kind === "num") return (
    <div className="md:col-span-3 flex items-center gap-2">
      <span className="text-xs text-gray-700 shrink-0 w-36 text-right">{it.label_th}{optional}</span>
      <div className="relative flex-1">
        <input value={num} disabled={disabled} inputMode="decimal" onChange={(e) => onNum(e.target.value)}
          className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary disabled:bg-gray-50" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">{it.unit ?? ""}</span>
      </div>
    </div>
  );

  // text / photo — โครงไว้ก่อน ยังไม่มีที่เก็บคำตอบ (ไม่มีข้อชนิดนี้ในใบที่ seed ไว้)
  return (
    <div className="md:col-span-6 flex items-center gap-3">
      <span className="flex-1 text-xs text-gray-700"><span className="text-gray-400 font-semibold mr-1.5">{n}.</span>{it.label_th}</span>
      <span className="text-xxs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 shrink-0">
        ยังไม่เปิดใช้ ({it.kind})
      </span>
    </div>
  );
}

/** 1 รูปในใบตรวจ — ★ ประกาศไว้ที่นี่เอง ห้าม import จาก lib/om/photo-store
 *  เพราะไฟล์นั้นดึง fs/promises เข้ามา ใช้ในไฟล์ "use client" ไม่ได้ */
type JobPhoto = { file: string; kind: string; at: string; size: number };

/** กล่องรูปก่อน/หลัง — ★ ไม่บังคับ (ผู้ใช้เคาะ 16 ก.ย. 69) ปิดงานได้โดยไม่มีรูป
 *  ★ รูปเก็บนอก public/ ทางเข้าเดียวคือ /api/om/jobs/<id>/photos/<file> ที่ตรวจสิทธิ์ก่อนเสมอ
 *  หน้าตาแบบ HANDOVER PHOTOS ของ InstallStep: ว่าง = กล่องประให้แตะ · มีรูป = รูปจัตุรัส + ช่อง + */
function PhotoBox({ jobId, kind, label, photos, disabled, onChanged }: {
  jobId: string; kind: "before" | "after"; label: string;
  photos: JobPhoto[]; disabled: boolean; onChanged: (p: JobPhoto[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = photos.filter((p) => p.kind === kind);
  // ★ <img src> ตรงไปที่ API ไม่ได้ (แนบ header สิทธิ์ไม่ได้ → 403) — ดึงเป็น blob URL ก่อน
  const srcOf = (p: JobPhoto) => `/api/om/jobs/${jobId}/photos/${p.file}`;
  const blobs = useOmPhotoUrls(mine.map(srcOf));

  const send = async (file: File | null | undefined) => {
    if (!file) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      // ★ ห้ามตั้ง Content-Type เอง — เบราว์เซอร์ต้องใส่ boundary ของ multipart ให้
      const d = await apiFetch(`/api/om/jobs/${jobId}/photos`, { method: "POST", body: fd });
      onChanged(d.photos ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const drop = async (file: string) => {
    setBusy(true); setErr("");
    try {
      const d = await apiFetch(`/api/om/jobs/${jobId}/photos?file=${encodeURIComponent(file)}`,
        { method: "DELETE" });
      onChanged(d.photos ?? []);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // capture=environment = เปิดกล้องหลังให้เลยบนมือถือ ช่างไม่ต้องหาไฟล์
  const picker = (
    <input type="file" accept="image/*" capture="environment" disabled={busy} className="hidden"
      onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
  );
  const spinner = <div className="w-8 h-8 border-2 border-current/30 border-t-current rounded-full animate-spin" />;

  return (
    <div className={SUB_CARD}>
      <div className={SUB_TITLE}>
        {label}
        {mine.length > 0 && <span className="ml-1 font-normal normal-case text-gray-400">· {mine.length} รูป</span>}
      </div>
      {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-700">{err}</div>}

      {disabled && !mine.length ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">ไม่มีรูป</div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-300">
          {mine.length === 0 ? (
            <label className="flex flex-col items-center justify-center gap-2 px-4 py-8 min-h-[140px] cursor-pointer transition-colors text-gray-500 hover:text-primary">
              {busy ? spinner : (
                <>
                  <svg className="w-10 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                  <span className="text-sm font-semibold">แตะเพื่อถ่ายรูปหรือเลือกจากเครื่อง</span>
                </>
              )}
              {picker}
            </label>
          ) : (
            <div className="p-3 grid grid-cols-3 md:grid-cols-4 gap-2">
              {mine.map((p) => (
                <div key={p.file} className="relative">
                  {blobs[srcOf(p)] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={blobs[srcOf(p)]} alt={label}
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200" />
                  ) : <div className="w-full aspect-square rounded-lg border border-gray-200 bg-gray-100 animate-pulse" />}
                  {!disabled && (
                    <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={() => drop(p.file)}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full text-white flex items-center justify-center text-xs z-10 cursor-pointer">✕</button>
                  )}
                </div>
              ))}
              {!disabled && (
                <label title="เพิ่มรูป"
                  className="relative aspect-square flex items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary cursor-pointer transition-colors">
                  {busy ? <div className="w-6 h-6 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <PlusIcon className="w-8 h-8" strokeWidth={1.5} />}
                  {picker}
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobFormPanel({ jobId, wrapClass = "h-full overflow-auto bg-gray-50", embedded, intro, onClosed }: {
  jobId: string;
  /** กล่องนอกสุด — หน้า /om/field/[id] ใช้ค่า default (เต็มจอ มี scroll ของตัวเอง)
   *  ส่วนตอนฝังในการ์ดขั้นของหน้ารายละเอียด ส่งคลาสที่ไม่สร้าง scroll ซ้อนเข้ามาแทน */
  wrapClass?: string;
  /** ฝังอยู่ในหน้าอื่น — ไม่มีแถบหัวของตัวเอง (การ์ดขั้นของหน้าที่ฝังเป็นหัวให้แล้ว)
   *  และหัวใบเหลือแต่ข้อมูลของใบ (ข้อมูลลูกค้า/บ้านอยู่ที่ header ของหน้าที่ฝังแล้ว) */
  embedded?: boolean;
  /** บรรทัดคำอธิบายใต้แถบขั้นย่อย — หน้าที่ฝังส่งมา (เช่น ลิงก์เปิดเต็มจอ) */
  intro?: React.ReactNode;
  /** ปิดงานสำเร็จ — หน้าที่ฝังต้องโหลดใหม่ ไม่งั้น header/ราง/สิทธิ์/Activity log ค้างที่ "เข้างาน"
   *  (เจอ 28 ก.ย. 69: ใบ #99 ปิดในฐานแล้ว แต่หน้ารายละเอียดยังโชว์เข้างาน สิทธิ์เหลือ 4) */
  onClosed?: () => void;
}) {
  const id = jobId;
  const [job, setJob] = useState<Job | null>(null);
  const [form, setForm] = useState<FormWithItems | null>(null);
  const [checks, setChecks] = useState<Checks>({});
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [method, setMethod] = useState<"onsite_sign" | "line_otp" | "tech_proxy">("onsite_sign");
  const [proxyReason, setProxyReason] = useState(PROXY_REASONS[0]);
  const [techSign, setTechSign] = useState<string | null>(null);
  const [custSign, setCustSign] = useState<string | null>(null);
  const [jobNoTxt, setJobNo] = useState<string | null>(null);
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  // พบงานซ่อม (แผน 20260924-02 เฟส 5) — ช่างแจ้ง ทีม O&M เปิดใบงานซ่อมต่อจากหน้ารายละเอียด
  const [repair, setRepair] = useState(false);
  const [repairDetail, setRepairDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  // ขั้นย่อย — จำไว้ใน localStorage แบบ installSubStep ของฝั่งขาย · หน้าช่างกับหน้ารายละเอียดใช้ key เดียวกัน
  const [subStep, setSubStep] = useSubStep(`omJobSubStep_${id}`, 0, SUB_STEPS.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2600); };

  const load = useCallback(() => {
    apiFetch(`/api/om/jobs/${id}/report`)
      .then((d: { job: Job; report: Report | null; form: FormWithItems | null }) => {
        setJob(d.job);
        setForm(d.form);
        if (d.report) {
          setChecks(d.report.checks ?? {});
          setMeasures(Object.fromEntries(Object.entries(d.report.measures ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])));
          setNote(d.report.note ?? "");
          if (d.report.result === "fail") setResult("fail");
          setTechSign(d.report.tech_sign ?? null);
          setCustSign(d.report.cust_sign ?? null);
          setJobNo(d.report.job_no ?? null);
          if (d.report.close_method) setMethod(d.report.close_method as typeof method);
          // API แปลง JSON ให้แล้วเสมอ (คืน [] เมื่อยังไม่มีรูป)
          setPhotos(((d.report as { photos?: JobPhoto[] }).photos ?? []));
          setRepair(d.report.repair_needed === 1);
          setRepairDetail(d.report.repair_detail ?? "");
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  useEffect(load, [load]);

  const setPass = (k: string, pass: boolean | undefined) =>
    setChecks((c) => ({ ...c, [k]: { ...c[k], pass } }));
  const setFix = (k: string, fix: string) =>
    setChecks((c) => ({ ...c, [k]: { ...c[k], fix } }));

  const gps = () => new Promise<{ lat?: number; lng?: number; acc?: number }>((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }),
      () => res({}), { timeout: 4000 });
  });

  const save = async (close: boolean) => {
    if (repair && !repairDetail.trim()) { setNextError("อาการ / สิ่งที่ต้องซ่อม (ติ๊กพบงานซ่อมไว้)"); return; }
    setBusy(true); setErr("");
    try {
      const g = await gps();
      const body = {
        checks, note,
        repair_needed: repair, repair_detail: repair ? repairDetail.trim() : null,
        measures: Object.fromEntries(Object.entries(measures).map(([k, v]) => [k, v === "" ? null : Number(v)])),
        result: close ? result : null,
        tech_sign: techSign, cust_sign: custSign,
        cust_name: job?.customer_name ?? null,
        close_method: close ? method : null,
        proxy_reason: close && method === "tech_proxy" ? proxyReason : null,
        lat: g.lat ?? null, lng: g.lng ?? null, gps_accuracy: g.acc ?? null,
      };
      const r = await apiFetch(`/api/om/jobs/${id}/report`, { method: "PUT", body: JSON.stringify(body) });
      setJobNo(r.job_no ?? null);
      if (!close) { say("บันทึกร่างแล้ว"); return; }

      // เดินสถานะให้ครบเส้น — state machine ห้ามข้ามขั้น (เช่น pending → progress ตรง ๆ ไม่ได้)
      // ★ 28 ก.ย. 69: ไม่ผ่าน "รอปิด" แล้ว (เข้างาน → ปิดงานตรง) · ใบเก่าที่ค้าง checked ปิดต่อได้เลย
      const ORDER = ["follow", "pending", "confirmed", "progress", "closed"];
      const from = ORDER.indexOf(job?.status === "checked" ? "progress" : job?.status ?? "follow");
      const path = ORDER.slice(Math.max(0, from) + 1);
      for (const st of path)
        await apiFetch(`/api/om/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status: st }) });
      if (onClosed) { onClosed(); return; }
      say("ปิดงานเรียบร้อย");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // โหลดไม่ขึ้น (เช่นไม่มีใบงานนี้) ต้องบอกเหตุผล ไม่ใช่หมุนค้าง
  if (!job) return err
    ? <div className="p-6"><div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>
        <Link href="/om/services" className="inline-block mt-3 text-sm font-bold text-gray-600 no-underline">‹ กลับหน้างานบริการ</Link></div>
    : <Loading />;

  const items = form?.items ?? [];
  const fails = failCount(checks, items);
  const closed = job.status === "closed";
  const last = SUB_STEPS.length - 1;

  // ประตูเดียวกับปุ่มถัดไป + แท็บขั้นย่อย (แบบ onSubStepChange ของ InstallStep)
  // ★ ข้อมูลที่กรอกไม่หายตอนสลับขั้นย่อย (state อยู่ที่ใบ) · ไม่บันทึกอัตโนมัติ เพราะ PUT เขียน Activity log ทุกครั้ง
  const goSub = (n: number) => {
    if (!closed && n > subStep && n > 1 && repair && !repairDetail.trim()) {
      setNextError("อาการ / สิ่งที่ต้องซ่อม (ติ๊กพบงานซ่อมไว้)"); return;
    }
    setNextError(null);
    setSubStep(n);
    // เลื่อนกลับขึ้นแถบขั้นย่อย — หน้าช่างเต็มจอ กล่องนอกสุดคือตัว scroll เอง · ตอนฝัง scroll อยู่ที่หน้าที่ฝัง
    setTimeout(() => {
      const el = rootRef.current;
      if (!el) return;
      if (el.scrollHeight > el.clientHeight) el.scrollTo({ top: 0, behavior: "smooth" });
      else el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const closeJob = () => {
    // ★ 29 ก.ย. 69 (แผน 20260929-01): ปิดงานได้เฉพาะใบที่ช่างอยู่หน้างาน — ยืนยันนัดแล้ว / เข้างาน / รอปิด
    //   เดิมกดได้จากทุกสถานะ แล้วหน้าเว็บเดินสถานะให้ทีละขั้นจนปิด (ข้ามการยืนยันนัด/จ่ายทีม)
    //   API กันซ้ำอีกชั้น: เริ่มงานต้องจ่ายทีมแล้ว · ปิดงานต้องมีใบตรวจแล้ว
    if (!["confirmed", "progress", "checked"].includes(job.status)) {
      setErr(`ใบงานยังไม่ถึงขั้นเข้างาน (ตอนนี้ "${statusLabel(job.status)}") — ยืนยันนัดและจ่ายทีมที่ขั้นนัดหมายก่อน`);
      return;
    }
    const missing = method === "onsite_sign" && !custSign ? "ลายเซ็นลูกค้า"
      : method === "tech_proxy" && !techSign ? "ลายเซ็นช่าง (เซ็นแทนลูกค้า)" : null;
    if (missing) { setNextError(missing); return; }
    save(true);
  };

  // จัดกลุ่มตามหมวด — quality ขึ้นก่อน ที่เหลือตามลำดับที่เจอ (หมวดแปลก ๆ ก็ยังโผล่)
  const sections = [...new Set(["quality", ...items.map((i) => i.section)])]
    .map((sec) => ({ sec, list: items.filter((i) => i.section === sec) }))
    .filter((s) => s.list.length > 0);

  const row = (it: FormItem, n: number) => (
    <ItemRow key={it.code} it={it} n={n} disabled={closed}
      value={checks[it.code] ?? {}} num={measures[it.code] ?? ""}
      onPass={(p) => setPass(it.code, p)} onFix={(f) => setFix(it.code, f)}
      onNum={(v) => setMeasures((s) => ({ ...s, [it.code]: v }))} />
  );

  // หัวใบงาน — ระบบเติมให้ ช่างไม่ต้องเขียนเหมือนกระดาษ · ช่องอ่านอย่างเดียวหน้าตาแบบเลขที่เอกสารของ InstallChecklist
  // ★ ตอนฝังในหน้ารายละเอียด ตัดลูกค้า/บ้าน/โครงการ/เบอร์/ทีม ที่ header หน้าแสดงอยู่แล้ว
  const kw = job.kwp_list ? `${job.kwp_list} kW` : null;
  const formName = form ? `${form.label_th} · v${form.version}` : null;
  const docFields: { k: string; v: string | null; wide?: boolean; mono?: boolean }[] = [
    { k: "เลขที่เอกสาร", v: jobNoTxt, mono: true },
    ...(embedded ? [] : [
      { k: "ลูกค้า", v: job.customer_name, wide: true }, { k: "บ้านเลขที่", v: job.house_number },
      { k: "โครงการ", v: job.project_name, wide: true }, { k: "เบอร์", v: job.phone }, { k: "ทีม", v: job.team_name },
    ]),
    { k: "ประเภทงาน", v: job.service_type }, { k: "วันนัด", v: thAppt(job.scheduled_at, job.time_slot) },
    { k: "ขนาดติดตั้ง", v: kw }, { k: "ใบตรวจ", v: formName, wide: true },
  ];

  return (
    <div ref={rootRef} className={wrapClass}>
      {!embedded && (
        <div className="bg-white border-b border-gray-200 px-4 py-2.5 sticky top-0 z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold leading-tight">{form?.label_th ?? "ใบตรวจรับงาน / ใบบริการ"}</h1>
            {form && <span className="text-xxs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">v{form.version}</span>}
            {jobNoTxt && <span className="text-xs font-bold text-gray-500 tabular-nums">{jobNoTxt}</span>}
            <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold ${closed ? "bg-emerald-600" : "bg-violet-600"}`}>
              {closed ? "ปิดงานแล้ว" : "กำลังทำ"}
            </span>
            <Link href="/om/services" className="ml-auto text-xs font-bold text-gray-600 no-underline border border-gray-200 rounded-full px-3 py-1">‹ กลับ</Link>
          </div>
        </div>
      )}

      <div className={embedded ? "" : "p-4 max-w-[1400px] mx-auto"}>
        {/* แถบขั้นย่อย — StepLayout ตัวเดียวกับการ์ด Install ฝั่งขาย (state active เสมอ ใบปิดแล้วยังเปิดอ่านได้ทุกขั้น) */}
        <StepLayout state="active" doneHeader={null} subSteps={SUB_STEPS} subStep={subStep} onSubStepChange={goSub}>
          {intro}
          <div className="space-y-3">
            {/* ใบปิดแล้ว — แถบ lock แบบ InstallChecklist (หน้าช่างเต็มจอมีป้ายที่แถบหัวอยู่แล้ว) */}
            {closed && embedded && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                <CheckIcon className="w-4 h-4 shrink-0" />
                <span>ปิดงานแล้ว — ใบตรวจถูก lock แก้ไขไม่ได้</span>
              </div>
            )}

            {/* ── ขั้นย่อย 1: ตรวจ ── */}
            {subStep === 0 && (
              <>
                {/* ยังไม่มีใบของชนิดงานนี้ — ยืมใบติดตั้งมาใช้ ต้องบอกช่างให้รู้ ไม่ใช่เงียบ */}
                {form?.fallback && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                    งาน{job.service_type ? `“${job.service_type}”` : "ชนิดนี้"}ยังไม่มีใบตรวจของตัวเอง — ใช้ “{form.label_th}” ไปก่อน
                  </div>
                )}
                {form === null && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-800">
                    ยังไม่มีใบตรวจในระบบเลย — ต้องตั้งใบตรวจที่หน้าตั้งค่าก่อน
                  </div>
                )}

                <div className={SECTION}>
                  <SectionHead icon={<DocumentIcon className="w-4 h-4" />} en="Document Header" />
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {docFields.map(({ k, v, wide, mono }, i) => (
                      <div key={k} className={`${i === 0 || wide ? "col-span-2" : "col-span-1"} ${wide ? "md:col-span-2" : "md:col-span-1"} min-w-0`}>
                        <label className={FIELD_LABEL}>{k}</label>
                        <div title={v ?? (i === 0 ? "ออกเลขเมื่อบันทึกครั้งแรก" : undefined)}
                          className={`h-8 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm flex items-center min-w-0 ${v ? "text-gray-700" : "text-gray-400"} ${mono && v ? "font-mono" : ""}`}>
                          <span className="truncate">{v || (i === 0 ? "ยังไม่ออกเลข" : "—")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* หมวดของใบ — จำนวนข้อมาจากใบในฐาน ไม่ใช่เลขที่ฝังไว้ */}
                {sections.map(({ sec, list }) => {
                  const meta = SECTION_META[sec];
                  return (
                    <div key={sec} className={SECTION}>
                      <SectionHead
                        icon={sec === "quality" ? <DocumentIcon className="w-4 h-4" /> : <CheckIcon className="w-4 h-4" />}
                        en={meta?.en ?? sec} th={meta?.th}
                        right={<>{list.length} ข้อ{sec === "quality" && fails > 0 && <b className="text-red-600"> · ไม่ผ่าน {fails}</b>}</>} />
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">{list.map((it, i) => row(it, i + 1))}</div>
                    </div>
                  );
                })}
                {form && !sections.length && (
                  <div className={`${SECTION} text-sm text-gray-400`}>ใบนี้ยังไม่มีข้อตรวจ</div>
                )}
              </>
            )}

            {/* ── ขั้นย่อย 2: รูป · บันทึก ── */}
            {subStep === 1 && (
              <>
                {/* รูปก่อน / หลัง — แยกสองกล่องตามที่ผู้ใช้สั่ง · ★ ไม่บังคับ ปิดงานได้โดยไม่มีรูป
                    ชื่อกล่องเป็นกลาง ไม่ผูกกับงานล้าง เพราะใบนี้ใช้กับงาน O&M ทุกชนิด */}
                <div className={SECTION}>
                  <SectionHead icon={<CameraIcon className="w-4 h-4" />} en="Photos" th="รูปก่อน / หลังทำงาน · ไม่บังคับ" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <PhotoBox jobId={id} kind="before" label="รูปก่อนทำงาน" photos={photos} disabled={closed} onChanged={setPhotos} />
                    <PhotoBox jobId={id} kind="after" label="รูปหลังทำงาน" photos={photos} disabled={closed} onChanged={setPhotos} />
                  </div>
                </div>

                <div className={SECTION}>
                  <SectionHead icon={<DocumentIcon className="w-4 h-4" />} en="Notes" th="รายละเอียดอื่น ๆ" />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={closed} rows={3}
                    placeholder="เช่น ล้างแผง เครื่องทำงานปกติ เชื่อมไวไฟแล้ว"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none disabled:bg-gray-50 disabled:text-gray-500" />
                </div>

                {/* ★ เฟส 5 แผน 20260924-02: ช่างแจ้งพบงานซ่อม — ใบงานนี้ปิดตามปกติ (1 ใบงาน = 1 เส้นทาง)
                    แล้วทีม O&M เปิดใบงานซ่อมต่อที่ขั้นปิดงานของหน้ารายละเอียด พร้อมเลือกในประกัน/นอกประกัน */}
                <div className={SECTION}>
                  <SectionHead icon={<WrenchIcon className="w-4 h-4" />} en="Repair" th="พบงานซ่อม · ทีม O&M เปิดใบงานซ่อมต่อให้" />
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {([[false, "ไม่พบ"], [true, "พบ ต้องซ่อม"]] as const).map(([k, t]) => (
                      <button key={t} type="button" disabled={closed} className={chipBtn(repair === k)}
                        onClick={() => {
                          setRepair(k);
                          // ติ๊กพบครั้งแรก — ดึงข้อที่ไม่ผ่าน (พร้อมรายการที่ต้องแก้) มาเติมให้ ช่างแก้ต่อได้
                          if (k && !repairDetail.trim())
                            setRepairDetail(items
                              .filter((i) => i.kind === "bool" && checks[i.code]?.pass === false)
                              .map((i) => checks[i.code]?.fix?.trim() || i.label_th).join(" · "));
                        }}>{t}</button>
                    ))}
                  </div>
                  {repair && (
                    <div className="mt-2">
                      <label className={FIELD_LABEL}>อาการ / สิ่งที่ต้องซ่อม <span className="text-red-500">*</span></label>
                      <textarea value={repairDetail} onChange={(e) => setRepairDetail(e.target.value)} disabled={closed}
                        rows={3} maxLength={1000} placeholder="เช่น อินเวอร์เตอร์ขึ้น error E-21 · สาย DC หลวม"
                        className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-amber-50/40 text-sm focus:outline-none focus:border-amber-500 resize-none" />
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── ขั้นย่อย 3: ส่งมอบ — ผลการตรวจ · วิธีปิดงาน · ลายเซ็น ── */}
            {subStep === 2 && (
              <>
                <div className={SECTION}>
                  <SectionHead icon={<CheckIcon className="w-4 h-4" />} en="Result" th="ผลการตรวจ"
                    right={fails > 0 ? <span className="text-red-600 font-semibold">ไม่ผ่าน {fails} ข้อ</span> : undefined} />
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    <button type="button" disabled={closed} onClick={() => setResult("pass")} className={PASS_BTN(result === "pass")}>ผ่าน</button>
                    <button type="button" disabled={closed} onClick={() => setResult("fail")} className={FAIL_BTN(result === "fail")}>ไม่ผ่าน</button>
                  </div>

                  <label className={`${FIELD_LABEL} mt-3`}>ปิดงานด้วยวิธีไหน</label>
                  <div className="flex gap-2 flex-wrap">
                    {([["onsite_sign", "ลูกค้าเซ็นที่หน้างาน"], ["line_otp", "ส่งให้ลูกค้ายืนยันทาง LINE"], ["tech_proxy", "ช่างเซ็นแทน"]] as const).map(([k, t]) => (
                      <button key={k} type="button" disabled={closed} onClick={() => setMethod(k)} className={chipBtn(method === k)}>{t}</button>
                    ))}
                  </div>
                  {method === "tech_proxy" && (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                        ใช้เมื่อติดต่อลูกค้าไม่ได้จริง ๆ เท่านั้น ระบบจะทำเครื่องหมายไว้ว่าไม่ใช่ลายเซ็นลูกค้า
                      </div>
                      <select value={proxyReason} onChange={(e) => setProxyReason(e.target.value)} disabled={closed}
                        className={`${INPUT} max-w-[420px]`}>
                        {PROXY_REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                  {method === "line_otp" && (
                    <div className="mt-3 rounded-lg bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-900">
                      ยังไม่เปิดใช้ — รอเชื่อม LINE OA และ OTP (ตาราง <code>om_otp_requests</code> เตรียมไว้แล้ว)
                    </div>
                  )}
                </div>

                <div className={SECTION}>
                  <SectionHead icon={<UserIcon className="w-4 h-4" />} en="Signatures" th="ลายเซ็น" />
                  <div className="grid gap-3 md:grid-cols-3">
                    <SignPad label="ช่างผู้ปฏิบัติงาน" value={techSign} onChange={setTechSign}
                      required={method === "tech_proxy"} disabled={closed} />
                    <SignPad label="ลูกค้า" value={custSign} onChange={setCustSign}
                      required={method === "onsite_sign"} disabled={closed} />
                    <div className="space-y-2">
                      <label className={FIELD_LABEL}>
                        ผู้ตรวจสอบ / Q.C. <span className="text-xxs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ยังไม่บังคับ</span>
                      </label>
                      <div className="h-32 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-sm text-gray-300">
                        เว้นไว้ก่อน
                      </div>
                    </div>
                  </div>
                  {!closed && <div className="mt-3 text-xxs text-gray-500">บันทึกพิกัดและเวลาอัตโนมัติตอนกดปิดงาน</div>}
                </div>
              </>
            )}
          </div>

          {err && <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}

          {/* ปุ่มท้ายการ์ด — แบบ InstallStep: ย้อนกลับชิดซ้าย · ถัดไป/ปิดงานชิดขวา (+ บันทึกร่างข้าง ๆ)
              มือถือ 3 ปุ่มแบ่งเท่ากันในแถวเดียว (กลุ่มขวาเป็น contents) */}
          <div className="flex gap-2 mt-3 md:justify-between">
            {subStep > 0
              ? <button type="button" onClick={() => goSub(subStep - 1)} className={NAV_BACK}>
                  <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />ย้อนกลับ
                </button>
              : <span className="hidden md:block md:w-64" />}
            <div className="contents md:flex md:gap-2">
              {!closed && (
                <button type="button" disabled={busy} onClick={() => save(false)} className={NAV_DRAFT}>บันทึกร่าง</button>
              )}
              {subStep < last ? (
                <button type="button" onClick={() => goSub(subStep + 1)} className={NAV_NEXT}>
                  ถัดไป<ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
                </button>
              ) : closed ? (
                // ★ ปิดงานแล้ว — ปุ่มท้ายการ์ดกลายเป็นเปิดใบบริการ PDF (แผน 20260928-04 ข้อ 9) แทนปุ่มเทากดไม่ได้
                <ServiceDocButton bookingId={Number(id)} label="ใบบริการ PDF" className={NAV_NEXT}
                  wrapClassName="flex flex-1 md:flex-none items-center gap-2" />
              ) : (
                <button type="button" disabled={busy || closed} onClick={closeJob} className={NAV_CLOSE}>
                  {closed ? "ปิดงานแล้ว" : busy ? "กำลังบันทึก…" : "ปิดงาน"}
                  {!closed && !busy && <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />}
                </button>
              )}
            </div>
          </div>
        </StepLayout>
      </div>

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">{toast}</div>}
    </div>
  );
}
