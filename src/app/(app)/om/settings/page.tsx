"use client";

// ตั้งค่า O&M — กติกาการนัด · โทรติดตาม · ซิงค์ REM
// ★ ผู้ใช้เคาะ 31 ส.ค.: ทุกกติกาต้องแก้ได้จากหน้านี้ ห้าม hardcode ในโค้ด
//   ค่าที่ยังรอ business ตอบ ขึ้นธงเตือนไว้ (pending_biz) — ระบบใช้ค่าผ่อนปรนไปก่อน
// ★ 15 ต.ค. 69 (แผน 20261015-06): ไล่ทุกคีย์ใน om_settings เทียบกับโค้ดที่อ่านค่าจริง
//   หน้านี้แสดงเฉพาะค่าที่แก้แล้วมีผล · เดิมกลุ่ม call.* ใช้งานจริงแต่ไม่โผล่ (GROUP ไม่มี)
//   ส่วนบางช่องที่โชว์อยู่ไม่มีโค้ดอ่านเลย แก้ไปก็ไม่เกิดอะไร
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import Header from "@/components/layout/Header";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import ConflictsTab from "@/components/om/ConflictsTab";
import ProjectsTab from "@/components/om/ProjectsTab";
import MatchQueuePanel from "@/components/om/MatchQueuePanel";

interface Setting {
  key: string;
  value: number | boolean | string | null;
  label_th: string;
  group_key: string;
  pending_biz: boolean;
  note: string | null;
  sort_order: number;
}

// ค่าที่เลิกใช้แล้ว — ยังอยู่ใน om_settings (ห้ามลบช่วง 3 เดือนแรก) แต่ไม่แสดง เพราะแก้ไปก็ไม่มีผลกับอะไร
//   ★ 1 ต.ค. 69 เลิกใช้ทีม A/B/C (แผน 20261001-01 เฟส 4): คิวต่อทีม · ปลดทีมเมื่อเลื่อนนัด
//   ★ 1 ต.ค. 69 เลื่อนนัดแล้วไม่กลับเป็นรอยืนยัน · เลิกเตือนนัดกระชั้นกว่า advance_hours_min (ดู OmSlotPicker)
//   ★ 15 ต.ค. 69 ลูกค้าเลื่อนนัดเอง — LIFF ไม่มีปุ่มเลื่อนนัด ไม่มีที่ไหนอ่านค่านี้
//     call.hours / job.* — ไม่เคยมีโค้ดอ่าน (ปิดงานเป็นแบบลูกค้าเซ็นอย่างเดียวแล้ว ไม่มี OTP · Q.C. · ปิดเอง)
//     notify.* — เอาช่องเจ้าของงานออกแล้ว (c7c5c83) ไม่มีใครถูกมอบหมาย จึงไม่มีใครให้เตือน
const RETIRED = new Set([
  "booking.slot_per_team", "reschedule.unassign_team", "reschedule.reset_to_pending",
  "booking.advance_hours_min", "reschedule.by_customer",
  "call.hours", "job.otp_channel", "job.autoclose_hours", "job.qc_required",
  "notify.assign_owner", "notify.job_reminder", "notify.reminder_days",
]);

// คำถามที่รอ business ตอบ — ยังไม่มีโค้ดอ่าน ⇒ ไม่แสดง (กรอกไปก็ไม่มีผล)
//   ★ 15 ต.ค. 69 ผู้ใช้สั่งเอากล่องเหลือง "รอ business ตอบ" ออกจากหน้านี้
//   ตอนนี้ระบบตัดสิทธิ์เฉพาะตอนปิดงาน (bookings/[id] PATCH) ⇒ ยกเลิกได้ตลอด · ยกเลิก/ไม่อยู่บ้านไม่ตัดสิทธิ์
//   ได้คำตอบแล้วต้องแก้โปรแกรมให้อ่านค่า แล้วย้ายคีย์ไปไว้ใน SECTIONS
const PENDING = new Set(["cancel.min_hours_before", "cancel.refund_quota", "noshow.consume_quota"]);

// ป้าย · คำอธิบาย · หน่วย ของแต่ละค่า — label_th ในฐานบางตัวมีหน่วยในวงเล็บซ้ำกับหน่วยท้ายช่อง
//   และไม่บอกว่าเกินแล้วเกิดอะไร (เลื่อนนัดเกินที่ตั้ง = เตือน ไม่ห้าม — warningsOf ใน reschedule route)
//   ลำดับในแต่ละกลุ่ม = ลำดับที่แสดง
type Meta = { label: string; hint?: string; unit?: string };
const SECTIONS: { title: string; desc: string; items: Record<string, Meta> }[] = [
  {
    title: "การนัดหมาย",
    desc: "ปฏิทินเลือกวันนัด · เลื่อนนัดเกินที่ตั้ง ระบบเตือนแต่ไม่ห้าม",
    items: {
      "booking.advance_days_max":    { label: "นัดล่วงหน้าได้ไกลสุด", unit: "วัน", hint: "วันที่เกินนี้เลือกในปฏิทินไม่ได้" },
      "reschedule.max_times":        { label: "เลื่อนนัดได้", unit: "ครั้ง/นัด", hint: "เกินแล้วขึ้นเตือน + จดในประวัติ · 0 = ไม่จำกัด" },
      "reschedule.min_hours_before": { label: "เลื่อนก่อนถึงนัดอย่างน้อย", unit: "ชั่วโมง", hint: "กระชั้นกว่านี้ขึ้นเตือน · 0 = ไม่เตือน" },
      "reschedule.notify_line":      { label: "แจ้งลูกค้าทาง LINE เมื่อเลื่อนนัด", hint: "เฉพาะบ้านที่ลูกค้าผูก LINE แล้ว" },
    },
  },
  {
    title: "การโทรติดตามลูกค้า",
    desc: "วันนัดโทรครั้งหน้า ถ้าไม่ได้เลือกวันเอง",
    items: {
      "call.retry_days":    { label: "ไม่รับสาย นัดโทรใหม่อีก", unit: "วัน" },
      "call.max_attempts":  { label: "ไม่รับสายครบ ย้ายไปติดต่อไม่ได้", unit: "ครั้ง", hint: "เฉพาะบ้านที่ยังไม่มีงานเดินหน้า" },
      "call.postpone_days": { label: "ลูกค้าขอเลื่อน นัดโทรใหม่อีก", unit: "วัน" },
    },
  },
  {
    title: "ซิงค์ข้อมูลจาก REM",
    desc: "งานเบื้องหลัง · บ้านโอนใหม่เข้าระบบเอง ไม่ต้องกด",
    items: {
      "sync.rem_auto":      { label: "ดึงทะเบียนโอน/เจ้าของอัตโนมัติ" },
      "sync.promo_auto":    { label: "ดึงของแถม/โซลาร์อัตโนมัติ" },
      "sync.rem_every_min": { label: "ดึงทะเบียน + ของแถมทุก", unit: "นาที" },
      "sync.rem_batch":     { label: "ดึงต่อรอบ", unit: "โครงการ", hint: "สูงสุด 200 · มากกว่าจำนวนโครงการ = ครบทุกรอบ" },
      "sync.sweep_auto":    { label: "กวาดงานขายที่ติดตั้งเสร็จเข้า O&M", hint: "ทุก 1 ชั่วโมง (คงที่)" },
    },
  },
];

/** 360 นาที → "= ทุก 6 ชั่วโมง" — ตัวเลขนาทีหลักร้อยอ่านยาก */
const minutesHint = (v: Setting["value"]) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 60) return null;
  const h = Math.floor(n / 60), m = n % 60;
  return `= ทุก ${h} ชั่วโมง${m ? ` ${m} นาที` : ""}`;
};

// ★ 15 ต.ค. 69 ผู้ใช้สั่งเอาป้าย "รอ business ยืนยัน" ออก (call.* ยังมี pending_biz = 1 ในฐาน แต่ไม่แสดง)
function SettingRow({ x, m, saving, saved, onSave }: {
  x: Setting; m: Meta; saving: boolean; saved: boolean;
  onSave: (value: Setting["value"]) => void;
}) {
  const hint = [m.hint, m.unit === "นาที" ? minutesHint(x.value) : null].filter(Boolean).join(" · ");
  const on = x.value === true;
  return (
    // key ของ om_settings ไว้ใน tooltip — เดิมพิมพ์ใต้ทุกแถว รกตาสำหรับแอดมิน
    <div className="px-4 py-3 flex items-center gap-3" title={x.key}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{m.label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>

      {saved && <span className="text-xs font-medium text-emerald-600 shrink-0">✓ บันทึกแล้ว</span>}

      {typeof x.value === "boolean" ? (
        // สวิตช์ชุดเดียวกับหน้าตั้งค่าช่องทางชำระเงิน (payment-setup)
        <button type="button" role="switch" aria-checked={on} aria-label={m.label}
          onClick={() => onSave(!on)} disabled={saving} style={{ minHeight: 0 }}
          className={`shrink-0 relative w-12 h-7 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-primary" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      ) : typeof x.value === "string" ? (
        // ค่าข้อความ (ถ้ามีคีย์ใหม่แบบนี้) — API บันทึกได้แค่ตัวเลข/true-false จึงแสดงอย่างเดียว
        <span className="shrink-0 text-sm font-medium text-gray-700">{x.value}</span>
      ) : (
        // กว้างคงที่ ทุกช่องในคอลัมน์เท่ากัน ไม่ว่าหน่วยจะสั้น (วัน) หรือยาว (โครงการ)
        <label className={`shrink-0 w-32 md:w-36 flex items-center h-9 rounded-lg border border-gray-200 bg-white focus-within:border-primary ${saving ? "opacity-60" : ""}`}>
          <input
            // key = ค่าที่บันทึกแล้ว → ช่องรีเซ็ตเป็นค่าที่ API ตอบกลับ (เช่น "05" → 5)
            key={String(x.value)}
            type="number" min={0} inputMode="numeric"
            defaultValue={x.value === null ? "" : String(x.value)}
            placeholder="—"
            disabled={saving}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              const cur = x.value === null ? "" : String(x.value);
              if (v !== cur) onSave(v === "" ? null : Number(v));
            }}
            style={{ minHeight: 0 }}
            className="flex-1 min-w-0 h-full pl-2 pr-1 text-right text-sm font-medium text-gray-900 bg-transparent outline-none"
          />
          {m.unit && <span className="pr-3 text-xs text-gray-500 whitespace-nowrap">{m.unit}</span>}
        </label>
      )}
    </div>
  );
}

function RulesTab() {
  const [items, setItems] = useState<Setting[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [okKey, setOkKey] = useState<string | null>(null);

  const load = () =>
    apiFetch("/api/om/settings")
      .then((d) => setItems(d.settings ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));

  useEffect(() => { load(); }, []);

  const save = async (key: string, value: Setting["value"]) => {
    setSaving(key); setErr("");
    try {
      const d = await apiFetch("/api/om/settings", {
        method: "PATCH", body: JSON.stringify({ key, value }),
      });
      setItems((prev) => prev?.map((x) => (x.key === key ? { ...x, value: d.value } : x)) ?? null);
      setOkKey(key); setTimeout(() => setOkKey(null), 1600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setSaving(null); }
  };

  if (!items) return <Loading />;

  const byKey = new Map(items.map((x) => [x.key, x]));
  // คีย์ใหม่ที่หน้านี้ยังไม่รู้จัก — แสดงท้ายสุด ไม่ให้หายเงียบ (call.* เคยใช้งานจริงแต่ไม่โผล่ในหน้านี้)
  const known = new Set([...RETIRED, ...PENDING, ...SECTIONS.flatMap((s) => Object.keys(s.items))]);
  const others = items.filter((x) => !known.has(x.key));
  const sections = [
    ...SECTIONS.map((s) => ({
      title: s.title, desc: s.desc,
      rows: Object.entries(s.items).flatMap(([k, m]) => { const x = byKey.get(k); return x ? [{ x, m }] : []; }),
    })),
    {
      title: "อื่น ๆ", desc: "ค่าที่เพิ่มในฐานแต่หน้านี้ยังไม่ได้จัดกลุ่ม",
      rows: others.map((x) => ({ x, m: { label: x.label_th, hint: x.note ?? undefined } as Meta })),
    },
  ].filter((s) => s.rows.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {err && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 rounded-xl">{err}</div>}

      <div className="grid gap-3 items-start lg:grid-cols-2 2xl:grid-cols-3">
        {sections.map((s) => (
          <section key={s.title} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">{s.title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {s.rows.map(({ x, m }) => (
                <SettingRow key={x.key} x={x} m={m}
                  saving={saving === x.key} saved={okKey === x.key}
                  onSave={(v) => save(x.key, v)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-xs text-gray-400 px-1">
        แก้แล้วมีผลทันที ไม่ต้อง deploy ใหม่ · ช่องตัวเลขบันทึกเมื่อกด Enter หรือคลิกออกจากช่อง
      </p>
    </div>
  );
}

// ★ ผู้ใช้เคาะ 9 ก.ย. 69: "ไม่อยากเพิ่มเมนู" — งานจัดการที่เหลือยัดเข้าหน้านี้เป็นแท็บ
//   กติกา (ของเดิม) · ค่าขัดกัน (414 รายการรอตัดสิน) · โครงการ (แก้ชื่อ/ดูสถานะ sync) · คิวจับคู่
const TABS = [
  { k: "rules", t: "กติกา" },
  { k: "conflicts", t: "ค่าขัดกัน" },
  { k: "projects", t: "โครงการ" },
  { k: "queue", t: "คิวจับคู่" },
  // ★ 15 ต.ค. 69 ผู้ใช้สั่งซ่อนแท็บ "ใบตรวจรับงาน" — มีใบกลางใบเดียว ไม่เคยแก้ตั้งแต่ 16 ก.ย.
  //   ซ่อนแค่แท็บ: ช่างกรอกขั้น 05 / กันปิดงานไม่ครบ / PDF อ่านใบจากฐานตรง ไม่ผ่านแท็บนี้
  //   components/om/JobFormsTab.tsx + /api/om/job-forms ยังอยู่ครบ — เปิดคืน = ใส่ { k: "forms", t: "ใบตรวจรับงาน" }
  //   กลับที่นี่ + import JobFormsTab + {tab === "forms" && <JobFormsTab />} ด้านล่าง
] as const;
type TabKey = (typeof TABS)[number]["k"];

export default function OmSettingsPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const [tab, setTab] = useState<TabKey>("rules");
  const [counts, setCounts] = useState<{ conflicts: number; projects: number; queue: number } | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/om/conflicts?size=10").then((d) => d.total ?? 0).catch(() => 0),
      apiFetch("/api/om/projects").then((d) => d.stats?.total ?? 0).catch(() => 0),
      apiFetch("/api/om/sweep?status=pending").then((d) => (d.queue ?? []).length).catch(() => 0),
    ]).then(([conflicts, projects, queue]) => setCounts({ conflicts, projects, queue }));
  }, []);

  const n = (k: TabKey) =>
    k === "conflicts" ? counts?.conflicts : k === "projects" ? counts?.projects : k === "queue" ? counts?.queue : undefined;

  // ★ 28 ก.ย. 69 (แผน 20260928-04 ข้อ 1): หัวหน้าจอ = Header ฝั่งขาย · หัวเรื่อง = ชื่อเมนู
  //   แถบแท็บย้ายเข้าใต้หัว (คลาสแถวแท็บเดียวกับ ListPageHeader) — เดิมเป็นกล่องแท็บลอยไม่มีหัวหน้าจอ
  //   ตัวเลขค้างตัดสินยังเป็นสีส้มตามเดิม ให้เห็นว่ามีงานรอ
  return (
    <div>
      <Header title={activeItem?.label ?? "ตั้งค่า O&M"} subtitle="O&M · CONFIGURATION">
        <div className="flex items-center px-5 border-t border-gray-100 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button key={t.k} type="button" onClick={() => setTab(t.k)}
              className={`px-2.5 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === t.k ? "text-active border-active" : "text-gray-500 border-transparent hover:text-gray-700"}`}>
              {t.t}
              {n(t.k) !== undefined && (
                <span className={`ml-1 text-xs normal-case ${
                  tab === t.k ? "text-active" : t.k !== "projects" && (n(t.k) ?? 0) > 0 ? "text-amber-600 font-bold" : "text-gray-400"}`}>
                  ({(n(t.k) ?? 0).toLocaleString()})
                </span>
              )}
            </button>
          ))}
        </div>
      </Header>

      <div className="p-3 md:p-4 flex flex-col gap-3">
        {tab === "rules" && <RulesTab />}
        {tab === "conflicts" && <ConflictsTab onChanged={(left) => setCounts((c) => (c ? { ...c, conflicts: left } : c))} />}
        {tab === "projects" && <ProjectsTab />}
        {tab === "queue" && <MatchQueuePanel />}
      </div>
    </div>
  );
}
