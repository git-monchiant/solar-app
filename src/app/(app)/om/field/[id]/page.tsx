"use client";

// หน้าช่าง — ใบตรวจรับงาน / ใบบริการ (mockup 20260910_01)
// ★ 16 ก.ย. 69: หัวข้อในใบไม่ใช่ const ในโค้ดแล้ว — มาจากฐาน (om_job_form + om_job_form_item)
//   API คืน form.items มาให้ · หน้านี้วนตามข้อมูล แต่ละชนิดงานจึงเห็นใบของตัวเอง
//   ช่องกรอกเลือกจาก kind: bool = ผ่าน/ไม่ผ่าน · num = ใส่ตัวเลข+หน่วย · text/photo ยังเป็นโครง
// ★ ใช้ได้ทั้งมือถือและคอม — จอเล็กเรียงลงมาทีละส่วน จอกว้างแบ่งสองคอลัมน์เห็นทั้งใบ
import { use, useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import { PROXY_REASONS, failCount, type Checks, type FormItem, type JobForm } from "@/lib/om/job-form";

type Job = {
  id: number; house_id: number; status: string; team_name: string | null; scheduled_at: string | null;
  service_type: string | null; consumes_quota: number; house_number: string | null;
  project_name: string | null; customer_name: string | null; phone: string | null; kwp_list: string | null;
};
type Report = {
  job_no: string | null; checks: Checks; measures: Record<string, number | null>;
  note: string | null; result: string | null; tech_sign: string | null; cust_sign: string | null;
  close_method: string | null; proxy_reason: string | null;
};
type FormWithItems = JobForm & { items: FormItem[] };

const thDT = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

// ชื่อหมวดบนการ์ด — หมวดที่ยังไม่รู้จักใช้ code ของหมวดไปก่อน ไม่ทำให้ข้อหาย
const SECTION_TH: Record<string, string> = {
  quality: "คุณภาพงาน",
  measure: "การทดสอบระบบ",
  photo: "รูปถ่าย",
};

const CARD = "bg-white border border-gray-200 rounded-2xl overflow-hidden";
const CARD_HEAD = "px-4 py-2 border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-600";

/** แผ่นเซ็น — วาดด้วยนิ้วหรือเมาส์ แล้วเก็บเป็น data URL */
function SignPad({ value, onChange, label }: { value: string | null; onChange: (v: string | null) => void; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
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
  const up = () => { if (drawing.current) { drawing.current = false; onChange(ref.current!.toDataURL("image/png")); } };
  const clear = () => {
    const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(null);
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-gray-600">{label}</span>
        {value && <button type="button" onClick={clear} style={{ minHeight: 0 }}
          className="ml-auto text-xxs px-2 py-0.5 rounded-md border border-gray-200 text-gray-500 bg-white cursor-pointer">ล้าง</button>}
      </div>
      <canvas ref={ref} width={520} height={150} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className={`w-full h-[104px] rounded-xl bg-white touch-none ${value ? "border border-primary" : "border border-dashed border-gray-300"}`} />
      {!value && <div className="text-xxs text-gray-400 mt-1">เซ็นในกรอบด้านบน</div>}
    </div>
  );
}

/** 1 ข้อในใบตรวจ — รูปแบบช่องกรอกมาจาก kind ที่นิยามไว้ในฐาน ไม่ใช่จากหมวด */
function ItemRow({ it, n, disabled, value, num, onPass, onFix, onNum }: {
  it: FormItem; n: number; disabled: boolean;
  value: { pass?: boolean; fix?: string }; num: string;
  onPass: (pass: boolean) => void; onFix: (fix: string) => void; onNum: (v: string) => void;
}) {
  const label = (
    <span className="flex-1 text-sm">
      <span className="text-gray-400 font-bold mr-1.5">{n}.</span>{it.label_th}
      {!it.required && <span className="ml-1.5 text-xxs text-gray-400">(ไม่บังคับ)</span>}
    </span>
  );

  if (it.kind === "bool") return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        {label}
        <span className="flex gap-1.5 shrink-0">
          <button type="button" disabled={disabled} style={{ minHeight: 0 }} onClick={() => onPass(true)}
            className={`w-10 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${value.pass === true ? "bg-green-100 border-green-300 text-green-700" : "border-gray-200 text-gray-300"}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          </button>
          <button type="button" disabled={disabled} style={{ minHeight: 0 }} onClick={() => onPass(false)}
            className={`w-10 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${value.pass === false ? "bg-red-100 border-red-300 text-red-700" : "border-gray-200 text-gray-300"}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </span>
      </div>
      {value.pass === false && (
        <input value={value.fix ?? ""} onChange={(e) => onFix(e.target.value)} disabled={disabled}
          placeholder="รายการที่ต้องแก้ไข"
          className="mt-1.5 w-full h-8 rounded-lg border border-red-300 bg-red-50/50 px-2.5 text-sm outline-none" />
      )}
    </div>
  );

  if (it.kind === "num") return (
    <div className="flex items-center gap-3 py-1.5 border-b border-gray-100 last:border-0">
      {label}
      <input value={num} disabled={disabled} inputMode="decimal" onChange={(e) => onNum(e.target.value)}
        className="w-24 h-8 rounded-lg border border-gray-200 px-2 text-sm text-right tabular-nums outline-none focus:border-primary" />
      <span className="w-8 text-xs font-bold text-gray-500">{it.unit ?? ""}</span>
    </div>
  );

  // text / photo — โครงไว้ก่อน ยังไม่มีที่เก็บคำตอบ (ไม่มีข้อชนิดนี้ในใบที่ seed ไว้)
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
      {label}
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
 *  ★ รูปเก็บนอก public/ ทางเข้าเดียวคือ /api/om/jobs/<id>/photos/<file> ที่ตรวจสิทธิ์ก่อนเสมอ */
function PhotoBox({ jobId, kind, label, tone, photos, disabled, onChanged }: {
  jobId: string; kind: "before" | "after"; label: string; tone: string;
  photos: JobPhoto[]; disabled: boolean; onChanged: (p: JobPhoto[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = photos.filter((p) => p.kind === kind);

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

  return (
    <div className={CARD}>
      <div className={CARD_HEAD}>
        {label}
        <span className="ml-2 font-normal normal-case text-gray-400">ไม่บังคับ</span>
        {mine.length > 0 && <span className="ml-1 font-normal normal-case text-gray-400">· {mine.length} รูป</span>}
      </div>
      <div className="p-3">
        {err && <div className="mb-2 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-700">{err}</div>}

        {mine.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-2">
            {mine.map((p) => (
              <div key={p.file} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/om/jobs/${jobId}/photos/${p.file}`} alt={label}
                  className="w-full h-20 object-cover rounded-lg border border-gray-200" />
                {!disabled && (
                  <button type="button" style={{ minHeight: 0 }} disabled={busy} onClick={() => drop(p.file)}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-white border border-gray-300 text-gray-500 text-xs cursor-pointer shadow-sm">×</button>
                )}
              </div>
            ))}
          </div>
        )}

        {disabled ? (
          !mine.length && <div className="text-xs text-gray-400 text-center py-3">ไม่มีรูป</div>
        ) : (
          <label className={`block rounded-xl border border-dashed px-3 py-4 text-center text-xs cursor-pointer ${tone} ${busy ? "opacity-50" : ""}`}>
            {/* capture=environment = เปิดกล้องหลังให้เลยบนมือถือ ช่างไม่ต้องหาไฟล์ */}
            <input type="file" accept="image/*" capture="environment" disabled={busy} className="hidden"
              onChange={(e) => { send(e.target.files?.[0]); e.target.value = ""; }} />
            {busy ? "กำลังอัปโหลด…" : mine.length ? "+ เพิ่มรูป" : "แตะเพื่อถ่ายรูปหรือเลือกจากเครื่อง"}
          </label>
        )}
      </div>
    </div>
  );
}

export default function FieldJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
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
        }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);
  useEffect(load, [load]);

  const setPass = (k: string, pass: boolean) =>
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
    setBusy(true); setErr("");
    try {
      const g = await gps();
      const body = {
        checks, note,
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
      const ORDER = ["follow", "pending", "confirmed", "progress", "checked", "closed"];
      const from = ORDER.indexOf(job?.status ?? "follow");
      const path = ORDER.slice(Math.max(0, from) + 1);
      for (const st of path)
        await apiFetch(`/api/om/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status: st }) });
      say("ปิดงานเรียบร้อย");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // โหลดไม่ขึ้น (เช่นไม่มีใบงานนี้) ต้องบอกเหตุผล ไม่ใช่หมุนค้าง
  if (!job) return err
    ? <div className="p-6"><div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{err}</div>
        <a href="/om/services" className="inline-block mt-3 text-sm font-bold text-gray-600 no-underline">‹ กลับหน้างานบริการ</a></div>
    : <Loading />;

  const items = form?.items ?? [];
  const fails = failCount(checks, items);
  const closed = job.status === "closed";
  const needSign = method === "onsite_sign" ? !custSign : method === "tech_proxy" ? !techSign : false;

  // จัดกลุ่มตามหมวด — quality อยู่คอลัมน์ซ้าย ที่เหลืออยู่คอลัมน์ขวา (หมวดแปลก ๆ ก็ยังโผล่)
  const quality = items.filter((i) => i.section === "quality");
  const rest = [...new Set(items.filter((i) => i.section !== "quality").map((i) => i.section))];

  const row = (it: FormItem, n: number) => (
    <ItemRow key={it.code} it={it} n={n} disabled={closed}
      value={checks[it.code] ?? {}} num={measures[it.code] ?? ""}
      onPass={(p) => setPass(it.code, p)} onFix={(f) => setFix(it.code, f)}
      onNum={(v) => setMeasures((s) => ({ ...s, [it.code]: v }))} />
  );

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-2.5 sticky top-0 z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-bold leading-tight">{form?.label_th ?? "ใบตรวจรับงาน / ใบบริการ"}</h1>
          {form && <span className="text-xxs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">v{form.version}</span>}
          {jobNoTxt && <span className="text-xs font-bold text-gray-500 tabular-nums">{jobNoTxt}</span>}
          <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold ${closed ? "bg-emerald-600" : "bg-violet-600"}`}>
            {closed ? "ปิดงานแล้ว" : "กำลังทำ"}
          </span>
          <a href="/om/services" className="ml-auto text-xs font-bold text-gray-600 no-underline border border-gray-200 rounded-full px-3 py-1">‹ กลับ</a>
        </div>
      </div>

      <div className="p-4 max-w-[1400px] mx-auto">
        {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}

        {/* ยังไม่มีใบของชนิดงานนี้ — ยืมใบติดตั้งมาใช้ ต้องบอกช่างให้รู้ ไม่ใช่เงียบ */}
        {form?.fallback && (
          <div className="mb-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-xs text-amber-900">
            งาน{job.service_type ? `“${job.service_type}”` : "ชนิดนี้"}ยังไม่มีใบตรวจของตัวเอง — ใช้ “{form.label_th}” ไปก่อน
          </div>
        )}
        {form === null && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-xs text-red-800">
            ยังไม่มีใบตรวจในระบบเลย — ต้องตั้งใบตรวจที่หน้าตั้งค่าก่อน
          </div>
        )}

        {/* หัวใบงาน — ระบบเติมให้ ช่างไม่ต้องเขียนเหมือนกระดาษ */}
        <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 mb-3 flex gap-x-6 gap-y-2 flex-wrap">
          {[["ลูกค้า", job.customer_name], ["บ้านเลขที่", job.house_number], ["โครงการ", job.project_name],
            ["เบอร์", job.phone], ["ขนาดติดตั้ง", job.kwp_list ? `${job.kwp_list} kW` : "—"],
            ["ประเภทงาน", job.service_type], ["ทีม", job.team_name], ["วันนัด", thDT(job.scheduled_at)]].map(([k, v]) => (
            <div key={String(k)}>
              <div className="text-xxs text-gray-400">{k}</div>
              <div className="text-sm font-bold">{v || "—"}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
          {/* คุณภาพงาน — จำนวนข้อมาจากใบในฐาน ไม่ใช่เลข 7 ที่ฝังไว้ */}
          <div className={CARD}>
            <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{SECTION_TH.quality}</span>
              <span className="ml-auto text-xs text-gray-400">
                {quality.length} ข้อ{fails > 0 && ` · ไม่ผ่าน ${fails}`}
              </span>
            </div>
            <div className="px-4 py-1">
              {quality.length === 0
                ? <div className="py-4 text-sm text-gray-400">ใบนี้ไม่มีข้อตรวจคุณภาพงาน</div>
                : quality.map((it, i) => row(it, i + 1))}
            </div>
          </div>

          <div className="grid gap-3 content-start">
            {/* หมวดที่เหลือของใบ — การทดสอบระบบ ฯลฯ */}
            {rest.map((sec) => {
              const list = items.filter((i) => i.section === sec);
              return (
                <div key={sec} className={CARD}>
                  <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{SECTION_TH[sec] ?? sec}</span>
                    <span className="ml-auto text-xs text-gray-400">{list.length} ข้อ</span>
                  </div>
                  <div className="px-4 py-1">{list.map((it, i) => row(it, i + 1))}</div>
                </div>
              );
            })}

            {/* รูปก่อน / หลัง — แยกสองกล่องตามที่ผู้ใช้สั่ง · ★ ไม่บังคับ ปิดงานได้โดยไม่มีรูป
                ชื่อกล่างเป็นกลาง ไม่ผูกกับงานล้าง เพราะใบนี้ใช้กับงาน O&M ทุกชนิด */}
            <div className="grid gap-3 sm:grid-cols-2">
              <PhotoBox jobId={id} kind="before" label="รูปก่อนทำงาน" photos={photos}
                tone="bg-amber-50 border-amber-200 text-amber-800" disabled={closed} onChanged={setPhotos} />
              <PhotoBox jobId={id} kind="after" label="รูปหลังทำงาน" photos={photos}
                tone="bg-emerald-50 border-emerald-200 text-emerald-800" disabled={closed} onChanged={setPhotos} />
            </div>

            <div className={CARD}>
              <div className={CARD_HEAD}>รายละเอียดอื่น ๆ</div>
              <div className="p-3">
                <input value={note} onChange={(e) => setNote(e.target.value)} disabled={closed}
                  placeholder="เช่น ล้างแผง เครื่องทำงานปกติ เชื่อมไวไฟแล้ว"
                  className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-primary" />
              </div>
            </div>
          </div>
        </div>

        {/* ผลการตรวจ + ลายเซ็น */}
        <div className={`${CARD} mt-3`}>
          <div className={CARD_HEAD}>ผลการตรวจ และลายเซ็น</div>
          <div className="p-4">
            <div className="flex gap-2 mb-3">
              {([["pass", "ผ่าน"], ["fail", "ไม่ผ่าน"]] as const).map(([k, t]) => (
                <button key={k} type="button" disabled={closed} style={{ minHeight: 0 }} onClick={() => setResult(k)}
                  className={`h-9 px-6 rounded-xl border text-sm font-bold cursor-pointer ${result === k
                    ? (k === "pass" ? "bg-green-100 border-green-300 text-green-700" : "bg-red-100 border-red-300 text-red-700")
                    : "border-gray-200 bg-white text-gray-500"}`}>{t}</button>
              ))}
            </div>

            <div className="text-xs font-bold text-gray-600 mb-1.5">ปิดงานด้วยวิธีไหน</div>
            <div className="flex gap-2 flex-wrap mb-3">
              {([["onsite_sign", "ลูกค้าเซ็นที่หน้างาน"], ["line_otp", "ส่งให้ลูกค้ายืนยันทาง LINE"], ["tech_proxy", "ช่างเซ็นแทน"]] as const).map(([k, t]) => (
                <button key={k} type="button" disabled={closed} style={{ minHeight: 0 }} onClick={() => setMethod(k)}
                  className={`h-9 px-4 rounded-xl border text-sm font-bold cursor-pointer ${method === k ? "border-active bg-active-light text-active-dark" : "border-gray-200 bg-white text-gray-700"}`}>{t}</button>
              ))}
            </div>
            {method === "tech_proxy" && (
              <div className="mb-3">
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs text-amber-900 mb-2">
                  ใช้เมื่อติดต่อลูกค้าไม่ได้จริง ๆ เท่านั้น ระบบจะทำเครื่องหมายไว้ว่าไม่ใช่ลายเซ็นลูกค้า
                </div>
                <select value={proxyReason} onChange={(e) => setProxyReason(e.target.value)} disabled={closed}
                  className="w-full max-w-[420px] h-9 rounded-lg border border-gray-200 px-2.5 text-sm bg-white outline-none">
                  {PROXY_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            )}
            {method === "line_otp" && (
              <div className="rounded-xl bg-sky-50 border border-sky-200 px-3.5 py-2 text-xs text-sky-900 mb-3">
                ยังไม่เปิดใช้ — รอเชื่อม LINE OA และ OTP (ตาราง <code>om_otp_requests</code> เตรียมไว้แล้ว)
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <SignPad label="ช่างผู้ปฏิบัติงาน" value={techSign} onChange={setTechSign} />
              <SignPad label="ลูกค้า" value={custSign} onChange={setCustSign} />
              <div>
                <div className="text-xs font-bold text-gray-600 mb-1">
                  ผู้ตรวจสอบ / Q.C. <span className="text-xxs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ยังไม่บังคับ</span>
                </div>
                <div className="h-[104px] rounded-xl border border-dashed border-gray-300 bg-white flex items-center justify-center text-xs text-gray-400">
                  เว้นไว้ก่อน
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-xxs text-gray-500">บันทึกพิกัดและเวลาอัตโนมัติตอนกดปิดงาน</span>
            <span className="ml-auto flex gap-2">
              <button type="button" disabled={busy || closed} onClick={() => save(false)} style={{ minHeight: 0 }}
                className="h-9 px-4 rounded-xl border border-gray-200 bg-white text-sm font-bold text-gray-700 cursor-pointer disabled:opacity-50">บันทึกร่าง</button>
              <button type="button" disabled={busy || closed || needSign} onClick={() => save(true)} style={{ minHeight: 0 }}
                className="h-9 px-6 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">
                {closed ? "ปิดงานแล้ว" : busy ? "กำลังบันทึก…" : "ปิดงาน"}
              </button>
            </span>
          </div>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">{toast}</div>}
    </div>
  );
}
