"use client";

// สรุปใบตรวจรับงานหน้าเดียว — เนื้อในการ์ดขั้น 05 (เข้างาน) ที่ปิดแล้ว (แผน 20261015-01)
// ★ ผู้ใช้สั่ง 15 ต.ค. 69: ปิดงานแล้วให้สรุปเป็นหน้าเดียวเหมือนขั้นอื่น — แทนใบตรวจตัวเต็ม 3 แท็บย่อย
//   ผังยกจาก renderDoneContent ของ InstallStep ฝั่งขาย: กล่องวันที่ + DoneSection + แถว "หัวข้อ … ค่า"
// ★ หัวข้อมาจากใบตรวจที่ผูกกับใบงาน (form.items) ไม่ hardcode — ใบเก่าที่ใช้ใบรุ่นอื่นยังอ่านถูก
// ข้อมูลชุดเดียวกับใบตรวจ/ใบบริการ PDF: GET /api/om/jobs/[id]/report
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import FallbackImage from "@/components/ui/FallbackImage";
import DoneSection from "@/components/lead/detail/steps/DoneSection";
import { useOmPhotoUrls } from "@/lib/hooks/useOmPhotoUrls";
import { CLOSE_METHOD, type Checks, type FormItem } from "@/lib/om/job-form";
import { thAppt, thDT } from "@/lib/om/service-view";

type Data = {
  job: {
    scheduled_at: string | null; time_slot?: string | null; service_type: string | null;
    team_name: string | null; kwp_list: string | null; customer_name: string | null;
  };
  report: {
    job_no: string | null; checks: Checks; measures: Record<string, number | null>;
    photos: { file: string; kind: string }[]; note: string | null; result: string | null;
    finished_at: string | null; tech_sign: string | null; cust_sign: string | null; cust_name: string | null;
    close_method: string | null; proxy_reason: string | null;
    repair_needed: number | null; repair_detail: string | null;
  } | null;
  form: { label_th: string; version: number; items: FormItem[] } | null;
  qc?: { name: string | null; sign: string | null };
};

// ชื่อหมวด — ชุดเดียวกับหัวกล่องในใบตรวจ (SECTION_META ของ JobFormPanel) · หมวดที่ไม่รู้จักใช้ code ไปก่อน
const SECTION_META: Record<string, { title: string; color: React.ComponentProps<typeof DoneSection>["color"] }> = {
  quality: { title: "คุณภาพงาน (Visual Inspection)", color: "amber" },
  measure: { title: "การทดสอบระบบ (Function Tests)", color: "blue" },
};
const KINDS = [["before", "ก่อนทำงาน"], ["after", "หลังทำงาน"]] as const;

// แถว "หัวข้อ … ค่า" — doneRow ของ InstallStep
const doneRow = (label: React.ReactNode, value: React.ReactNode, opts?: { mono?: boolean; key?: string }) => (
  <div key={opts?.key} className="flex gap-2 items-baseline justify-between lg:justify-start text-sm">
    <span className="text-gray-400 shrink-0 lg:w-40">{label}</span>
    <span className={`text-gray-800 min-w-0 text-right lg:text-left ${opts?.mono ? "font-mono tabular-nums" : ""}`}>{value}</span>
  </div>
);

const passMark = (pass: boolean | undefined, fix?: string) => (
  <span className="inline-flex items-center gap-2">
    {pass === true && <span className="text-emerald-700 font-semibold">✓ ผ่าน</span>}
    {pass === false && <span className="text-red-600 font-semibold">✗ ไม่ผ่าน</span>}
    {pass == null && <span className="text-gray-400">-</span>}
    {fix?.trim() && <span className="text-gray-500 italic text-xs">· {fix.trim()}</span>}
  </span>
);

export default function JobReportSummary({ bookingId, startedAt }: {
  bookingId: number;
  /** เวลาช่างเริ่มงาน — เหตุการณ์ start ใน Activity log (หน้ารายละเอียดมีอยู่แล้ว ไม่ต้องยิงเพิ่ม) */
  startedAt?: string | null;
}) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    apiFetch(`/api/om/jobs/${bookingId}/report`).then(setD).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [bookingId]);

  // รูปก่อน → หลัง · ★ ลำดับ gallery ต้องตรงกับที่วาดด้านล่าง ไม่งั้นกดรูปแล้ว lightbox เปิดผิดรูป
  const photos = KINDS.flatMap(([k, t]) => (d?.report?.photos ?? []).filter((p) => p.kind === k)
    .map((p) => ({ kind: k, src: `/api/om/jobs/${bookingId}/photos/${p.file}`, label: t })));
  // ★ <img src> ตรงไปที่ API ไม่ได้ (แนบ header สิทธิ์ไม่ได้ → 403) — ดึงเป็น blob URL ก่อน (เรียกก่อน return ใด ๆ)
  const blobs = useOmPhotoUrls(photos.map((p) => p.src));

  if (err) return <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>;
  if (!d) return <Loading />;
  const { job, report: r, form, qc } = d;
  const items = (form?.items ?? []).filter((i) => i.kind === "bool" || i.kind === "num");   // text/photo ยังไม่มีที่เก็บคำตอบ
  const checks = r?.checks ?? {}, measures = r?.measures ?? {};
  const bools = items.filter((i) => i.kind === "bool");
  const passed = bools.filter((i) => checks[i.code]?.pass === true).length;
  const failed = bools.filter((i) => checks[i.code]?.pass === false).length;

  // หมวด — quality ขึ้นก่อน ที่เหลือตามลำดับที่เจอ (สูตรเดียวกับใบตรวจ)
  const sections = [...new Set(["quality", ...items.map((i) => i.section)])]
    .map((sec) => ({ sec, list: items.filter((i) => i.section === sec) }))
    .filter((s) => s.list.length > 0);
  // ข้อวัดค่าที่ group_label เดียวกันและอยู่ติดกัน = แถวเดียว (แบบใบตรวจ)
  const grouped = (list: FormItem[]) => list.reduce<FormItem[][]>((out, it) => {
    const head = out[out.length - 1]?.[0];
    if (it.kind === "num" && it.group_label && head?.kind === "num" && head.group_label === it.group_label) out[out.length - 1].push(it);
    else out.push([it]);
    return out;
  }, []);
  const numText = (it: FormItem) => {
    const v = measures[it.code];
    return v == null || String(v) === "" ? "-" : `${v}${it.unit ? ` ${it.unit}` : ""}`;
  };

  const gallery = photos.map((p) => ({ url: blobs[p.src] ?? "", label: p.label }));
  // short = ป้ายบนมือถือ (3 ช่องเรียงแถวเดียว ป้ายเต็มโดนตัด)
  const signs: { label: string; short: string; sign: string | null; name: string | null }[] = [
    { label: "ช่างผู้ปฏิบัติงาน", short: "ช่าง", sign: r?.tech_sign ?? null, name: job.team_name },
    { label: "ลูกค้า", short: "ลูกค้า", sign: r?.cust_sign ?? null, name: r?.cust_name || job.customer_name },
    { label: "ผู้ตรวจสอบ / Q.C.", short: "Q.C.", sign: qc?.sign ?? null, name: qc?.name ?? null },
  ];

  return (
    <div className="space-y-3">
      {/* วันที่ — ★ 15 ต.ค. 69 ผู้ใช้สั่งเป็นข้อความธรรมดาไม่ต้องมีกรอบ (เดิมกล่อง 3 ใบแบบ InstallStep) */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span><span className="text-gray-400">วันนัด</span> <span className="font-medium text-gray-800">{thAppt(job.scheduled_at, job.time_slot)}</span></span>
        {startedAt && (
          <span><span className="text-gray-400">ช่างเริ่มงาน</span> <span className="font-medium text-gray-800">{thDT(startedAt)}</span></span>
        )}
        {r?.finished_at && (
          <span><span className="text-gray-400">วันปิดงาน</span> <span className="font-medium text-emerald-700">{thDT(r.finished_at)}</span></span>
        )}
      </div>

      <DoneSection color="indigo" title="ใบบริการ">
        <div className="space-y-0.5">
          {doneRow("เลขที่เอกสาร", r?.job_no || "-", { mono: true })}
          {doneRow("ประเภทงาน", job.service_type || "-")}
          {doneRow("ทีมช่าง", job.team_name || "-")}
          {doneRow("ขนาดติดตั้ง", job.kwp_list ? `${job.kwp_list} kW` : "-")}
          {doneRow("ใบตรวจรับงาน", form ? `${form.label_th} · v${form.version}` : "-")}
          {doneRow("ผลตรวจ", r?.result === "pass" ? <span className="text-emerald-700 font-semibold">✓ ผ่าน</span>
            : r?.result === "fail" ? <span className="text-red-600 font-semibold">✗ ไม่ผ่าน</span> : "-")}
        </div>
      </DoneSection>

      {sections.map(({ sec, list }) => (
        <DoneSection key={sec} color={SECTION_META[sec]?.color ?? "gray"} title={SECTION_META[sec]?.title ?? sec}>
          <div className="space-y-0.5">
            {grouped(list).map((g) => g.length > 1
              ? doneRow(g[0].group_label, g.map(numText).join(" · "), { mono: true, key: g.map((x) => x.code).join("+") })
              : g[0].kind === "bool"
                ? doneRow(g[0].label_th, passMark(checks[g[0].code]?.pass, checks[g[0].code]?.fix), { key: g[0].code })
                : doneRow(g[0].label_th, numText(g[0]), { mono: true, key: g[0].code }))}
          </div>
        </DoneSection>
      ))}

      {/* ยอดรวม + บันทึก — ไว้หลังรายละเอียดแบบ InstallStep (อ่านรายข้อก่อน แล้วค่อยสรุป) */}
      <DoneSection color="gray" title="สรุป · บันทึกเพิ่มเติม">
        <div className="space-y-0.5">
          {doneRow("ผลตรวจรายข้อ", !bools.length ? "-"
            // ช่างกดผลตรวจผ่านโดยไม่ติ๊กรายข้อ (มีจริง เช่นใบ #148) — "✓ 0 / 7" สีเขียวชวนเข้าใจผิด
            : passed + failed === 0 ? <span className="text-gray-400">ไม่ได้ระบุผลรายข้อ · 0 / {bools.length}</span> : (
            <>
              <span className="text-emerald-700 font-semibold">✓ {passed}</span>
              {failed > 0 && <> · <span className="text-red-600 font-semibold">✗ {failed}</span></>}
              <span className="text-gray-400"> / {bools.length}</span>
            </>
          ))}
          {doneRow("บันทึกเพิ่มเติม", r?.note ? <span className="whitespace-pre-wrap">{r.note}</span> : "-")}
          {/* ใบงานซ่อมพักไว้ (แผน 20261014-07) แต่ใบเก่าที่ช่างแจ้งไว้ยังต้องเห็น — แบบใบบริการ PDF */}
          {r?.repair_needed === 1 && doneRow("พบงานซ่อม", <span className="text-amber-700 font-semibold whitespace-pre-wrap">{r.repair_detail || "-"}</span>)}
        </div>
      </DoneSection>

      {photos.length > 0 && (
        <DoneSection color="emerald" title={`รูปก่อน / หลังทำงาน (${photos.length})`}>
          <div className="space-y-2">
            {KINDS.map(([k, t]) => {
              const at = photos.map((p, i) => ({ ...p, i })).filter((p) => p.kind === k);
              if (!at.length) return null;
              return (
                <div key={k}>
                  <div className="text-xs font-semibold text-gray-500 mb-1">{t} · {at.length} รูป</div>
                  <div className="flex flex-wrap gap-1.5">
                    {at.map((p) => gallery[p.i].url ? (
                      <FallbackImage key={p.src} src={gallery[p.i].url} alt={p.label}
                        className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition cursor-pointer"
                        gallery={gallery} galleryIndex={p.i} />
                    ) : <div key={p.src} className="w-16 h-16 rounded border border-gray-200 bg-gray-100 animate-pulse" />)}
                  </div>
                </div>
              );
            })}
          </div>
        </DoneSection>
      )}

      <DoneSection color="violet" title="ลายเซ็น">
        <div className="grid grid-cols-3 gap-2 max-w-2xl">
          {signs.map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="text-xs text-gray-400 mb-1 truncate">
                <span className="max-md:hidden">{s.label}</span><span className="md:hidden">{s.short}</span>
              </div>
              <div className="h-16 rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden">
                {s.sign
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.sign} alt={`ลายเซ็น${s.label}`} className="max-h-full max-w-full object-contain" />
                  : <span className="text-xs text-gray-300">ไม่มีลายเซ็น</span>}
              </div>
              <div className="mt-1 text-xs text-center text-gray-600 truncate" title={s.name ?? undefined}>{s.name || "-"}</div>
            </div>
          ))}
        </div>
        {/* ใบเก่าที่ปิดด้วยวิธีอื่น (ตัวเลือกถูกเอาออก 1 ต.ค. 69) — บอกไว้ ไม่งั้นช่องลูกค้าว่างดูเหมือนข้อมูลหาย */}
        {r?.close_method && r.close_method !== "onsite_sign" && (
          <div className="mt-2 space-y-0.5">
            {doneRow("วิธีปิดงาน", CLOSE_METHOD[r.close_method as keyof typeof CLOSE_METHOD] ?? r.close_method)}
            {r.close_method === "tech_proxy" && r.proxy_reason && doneRow("เหตุผล", r.proxy_reason)}
          </div>
        )}
      </DoneSection>
    </div>
  );
}
