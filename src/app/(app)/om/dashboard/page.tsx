"use client";

// ภาพรวม O&M (เฟส 6 ของแผน 20260922-01)
// ★ ผู้ใช้เคาะ 24 ก.ย. 69: งาน O&M อยู่ในโมดูล O&M ก่อน ยังไม่ขึ้นการ์ดอื่น
//   ⇒ ทำเป็นเมนู "ภาพรวม" ในโมดูลนี้ ไม่ใช่แท็บใน /dashboard ของฝั่งขาย
// ★ เปลือกการ์ด KPI/ชิป ยกจาก /dashboard ทั้งก้อน (กติกา ui-rules) เปลี่ยนแค่เนื้อใน
//   ต่างกันอย่างเดียว: ชิปของฝั่งขายเปิด popup · ของ O&M เป็นลิงก์ไปลิสต์ที่กรองไว้แล้ว
//   เพราะงาน O&M มีหน้ารายการที่กรองตามแท็บอยู่แล้ว ไม่ต้องทำ popup ซ้อน

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import Loading from "@/components/ui/Loading";
import { useActiveMenuItem } from "@/lib/hooks/useActiveModule";
import { TABS, TONE_SOFT } from "@/lib/om/service-view";

type Data = {
  unread: number;
  buckets: Record<string, number>;
  jobs_total: number;
  houses: { total: number; due: number; never_washed: number; not_due: number };
  quota: { granted: number; used: number; left: number };
  projects: { project_id: string | null; project_name: string | null; total: number; follow: number }[];
  owners: { owner_user_id: number | null; owner_name: string | null; n: number }[];
  teams: { team_id: number; team_name: string; n: number }[];
  months: { ym: string; n: number }[];
};

const n = (v: number) => v.toLocaleString("th-TH");
/** ป้ายใต้แท่ง — ใส่ปีเฉพาะแท่งแรกกับ ม.ค. และไม่ใส่เลยบนมือถือ (12 แท่งใส่ปีทุกแท่งแล้วล้นช่อง) */
function MonthLabel({ ym, withYear }: { ym: string; withYear: boolean }) {
  const [y, m] = ym.split("-").map(Number);
  const mon = new Date(y, m - 1, 1).toLocaleDateString("th-TH", { month: "short" });
  return <>{mon}{withYear && <span className="max-sm:hidden"> {String((y + 543) % 100).padStart(2, "0")}</span>}</>;
}

/** ชิปตัวเลข — เปลือกเดียวกับ Chip ของ /dashboard · ไม่ใส่ href = ตัวเลขที่ยังไม่มีลิสต์ให้กดดู */
function Chip({ n: num, l, tone, detail, href }: { n: number | string; l: React.ReactNode; tone: string; detail?: string; href?: string }) {
  const body = (
    <>
      <div className="text-xl font-bold font-mono tabular-nums leading-none">{num}</div>
      {/* ป้ายยาวขึ้น 2 บรรทัดได้ (ชิปรวมแท็บ ติดต่อไม่ได้ · ไม่เอา · สิทธิ์หมด) */}
      <div className="text-xxs mt-2 leading-tight line-clamp-2 opacity-75">{l}</div>
      {/* รายละเอียดอยู่ใต้ป้าย — ป้ายต้องติดกับเลขที่มันอธิบาย */}
      {detail && <div className="text-xxs font-mono tabular-nums opacity-60 leading-tight truncate">{detail}</div>}
    </>
  );
  const cls = `block rounded-lg px-2 py-3 text-center min-w-0 ${tone}`;
  return href
    ? <Link href={href} className={`${cls} cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

export default function OmDashboardPage() {
  const { item: activeItem } = useActiveMenuItem();   // หัวเรื่อง = ชื่อเมนู (กติกา ui-rules)
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/api/om/dashboard")
      .then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  const peak = Math.max(1, ...(d?.months ?? []).map((m) => m.n));

  return (
    <div>
      <Header title={activeItem?.label ?? "ภาพรวม"} subtitle="O&M · บ้านในความดูแล · สิทธิ์ · งานค้าง" />

      {/* เต็มความกว้างแบบ /dashboard — เดิมจำกัด 1600px ชิดซ้าย จอกว้างเหลือที่ว่างฝั่งขวา */}
      <main className="p-3 md:p-4 space-y-3">
        {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}
        {!d ? <Loading /> : (
          <>
            {/* แจ้งเตือนของ O&M เอง — กระดิ่งกลางบน Header เป็นของฝั่งขาย ไม่ยุ่งกัน (ข้อ 4.1) */}
            {d.unread > 0 && (
              <Link href="/om/notifications"
                className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 hover:bg-amber-100">
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{d.unread}</span>
                <span className="flex-1 text-sm font-semibold text-amber-900">มีแจ้งเตือนงาน O&M ที่ยังไม่อ่าน</span>
                <span className="text-xs font-semibold text-amber-700">เปิดดู →</span>
              </Link>
            )}

            {/* แถว 1 — 3 การ์ดหลัก: ทะเบียนบ้าน · สิทธิ์ · งานในลิสต์ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-bold text-gray-500">บ้านในความดูแล</span>
                  <span className="text-xs font-semibold text-gray-400">มีระบบติดตั้งแล้ว</span>
                </div>
                <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 leading-none">{n(d.houses.total)}</div>
                {/* ถึงรอบ + ยังไม่ถึงรอบ = ทั้งหมด · "ไม่เคยล้าง" เป็นส่วนหนึ่งของถึงรอบ จึงอยู่ในชิปเดียวกัน
                    ★ 14 ต.ค. 69 เดิมวาง 3 ชิปเรียงกัน อ่านเป็น 3 กอง (1,695 + 756 + 133 ≠ 1,828)
                      และถอดลิงก์ออก — แท็บติดตามมีแค่ส่วนหนึ่งของบ้านที่ถึงรอบ กดแล้วเลขไม่ตรง */}
                <div className="mt-auto pt-4 grid grid-cols-2 gap-1.5">
                  <Chip n={n(d.houses.due)} l="ถึงรอบล้าง" detail={`ในนี้ไม่เคยล้างเลย ${n(d.houses.never_washed)}`}
                    tone="bg-orange-50 text-orange-700" />
                  <Chip n={n(d.houses.not_due)} l="ยังไม่ถึงรอบ" tone="bg-emerald-50 text-emerald-700" />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-bold text-teal-700">สิทธิ์ล้างคงเหลือ</span>
                  <span className="text-xs font-semibold text-gray-400">ครั้ง</span>
                </div>
                <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 leading-none">{n(d.quota.left)}</div>
                <div className="mt-auto pt-4 grid grid-cols-2 gap-1.5">
                  <Chip n={n(d.quota.granted)} l="ให้ไว้ทั้งหมด" tone="bg-gray-100 text-gray-700" />
                  <Chip n={n(d.quota.used)} l="ใช้ไปแล้ว" tone="bg-teal-50 text-teal-700" />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm font-bold text-violet-700">งานในลิสต์บริการ</span>
                  <Link href="/om/services" className="text-xs font-semibold text-violet-600 hover:underline">เปิดลิสต์ →</Link>
                </div>
                <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 leading-none">{n(d.jobs_total)}</div>
                <div className="mt-2 text-xxs text-gray-400 leading-relaxed">
                  เลขเดียวกับตัวเลขบนการ์ด O&M หน้าแรก — ทุกแท็บในลิสต์ ยกเว้นปิดงาน
                </div>
                {/* 3 กองที่รวมกันได้เลขใหญ่ (ผู้ใช้เคาะ 14 ต.ค. 69 · เดิมการ์ดนี้มีแต่เลขเดียว โล่งกว่าอีก 2 ใบ)
                    ใบงานเปิดอยู่ = ส่วนที่เหลือ จึงรวมได้เท่าเลขใหญ่เสมอ ไม่ต้องไล่ชื่อแท็บให้ครบ */}
                {(() => {
                  const g = (k: string) => d.buckets[k] ?? 0;
                  const stuck = g("unreachable") + g("declined") + g("noquota");
                  return (
                    <div className="mt-auto pt-4 grid grid-cols-3 gap-1.5">
                      <Chip n={n(g("follow"))} l="ต้องโทร" tone={TONE_SOFT.follow} href="/om/services?tab=follow" />
                      <Chip n={n(d.jobs_total - g("follow") - stuck)} l="ใบงานเปิดอยู่" tone="bg-violet-50 text-violet-700" />
                      {/* ตัดบรรทัดได้แค่ตรง · — ปล่อยให้เบราว์เซอร์ตัดเองได้ "สิทธิ์ / หมด" · "ไม่ / เอา" */}
                      <Chip n={n(stuck)} tone="bg-rose-50 text-rose-700"
                        l={["ติดต่อไม่ได้", "ไม่เอา", "สิทธิ์หมด"].map((t, i) => (
                          <span key={t}>{i > 0 && " · "}<span className="whitespace-nowrap">{t}</span></span>
                        ))} />
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* แถว 2 — งานแยกตามแท็บ ชุดเดียวกับหน้ารายการ กดแล้วเด้งไปแท็บนั้นเลย */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4">
              {/* ★ 14 ต.ค. 69 ชื่อเดิม "งานค้างแยกตามขั้น" แต่มีแท็บปิดงานด้วย · 10 แท็บใน 9 คอลัมน์ ช่องสุดท้ายตกไปแถวสองตัวเดียว */}
              <div className="text-sm font-bold text-gray-500 mb-3">งานแยกตามแท็บ</div>
              <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5">
                {TABS.map((t) => (
                  <Chip key={t.k} n={n(d.buckets[t.k] ?? 0)} l={t.t}
                    tone={TONE_SOFT[t.k] ?? "bg-gray-50 text-gray-600"}
                    href={`/om/services?tab=${t.k}`} />
                ))}
              </div>
            </div>

            {/* แถว 3 — โครงการ + งานล้างย้อนหลัง */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border border-gray-200 p-4">
                <div className="text-sm font-bold text-gray-500 mb-3">โครงการที่ต้องโทรมากที่สุด</div>
                {d.projects.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">ยังไม่มีข้อมูล</div> : (
                  <div className="space-y-1">
                    {d.projects.map((p) => (
                      <Link key={p.project_id ?? "-"}
                        href={`/om/services?tab=follow&group=${encodeURIComponent(p.project_id ?? "")}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-700">{p.project_name || "(ไม่ระบุโครงการ)"}</span>
                        {/* มือถือซ่อนแท่ง ให้ชื่อโครงการมีที่ (ไม่งั้นเหลือแค่ "เสนาวิล...") */}
                        <span className="max-sm:hidden w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden shrink-0">
                          <span className="block h-full bg-gray-700 rounded-full"
                            style={{ width: `${Math.round((p.follow / Math.max(1, d.projects[0].follow)) * 100)}%` }} />
                        </span>
                        <span className="w-12 text-right text-sm font-bold font-mono tabular-nums text-gray-900">{n(p.follow)}</span>
                        <span className="w-14 text-right text-xxs font-mono tabular-nums text-gray-400">/ {n(p.total)}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xxs text-gray-400">เลขหนา = ยังโทรได้ · เลขจาง = ทั้งหมดในลิสต์ของโครงการนั้น</div>
              </div>

              <div className="rounded-2xl bg-white border border-gray-200 p-4 flex flex-col">
                <div className="text-sm font-bold text-gray-500 mb-3">งานล้างที่ทำจริง ย้อนหลัง 12 เดือน</div>
                {/* ★ 14 ต.ค. 69 แท่งไม่ขึ้นเลย — คอลัมน์สูงตามเนื้อหา height % ของแท่งเลยเป็น 0
                    ⇒ คอลัมน์ยืดเต็มความสูงกราฟ แท่งเป็น absolute ในราง flex-1 (absolute คิด % จากความสูงจริงเสมอ)
                    API เติมเดือนที่ไม่มีงานเป็น 0 ให้ครบ 12 แท่งแล้ว · แท่งท้ายสุด = เดือนนี้ ยังไม่จบเดือน จึงสีอ่อน */}
                {d.months.every((m) => m.n === 0) ? <div className="text-sm text-gray-400 py-6 text-center">ยังไม่มีข้อมูล</div> : (
                  <>
                    <div className="flex-1 min-h-56 flex gap-1.5 pt-6">
                      {d.months.map((m, i) => {
                        const now = i === d.months.length - 1;
                        return (
                          <div key={m.ym} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                            <div className="relative flex-1 w-full">
                              <div className={`absolute inset-x-0 bottom-0 rounded-t ${now ? "bg-teal-500/35" : "bg-teal-500/80"}`}
                                style={{ height: m.n ? `${Math.max(2, Math.round((m.n / peak) * 100))}%` : 0 }}>
                                <span className={`absolute inset-x-0 bottom-full mb-0.5 text-center text-xxs font-mono tabular-nums leading-none ${m.n ? "text-gray-600" : "text-gray-300"}`}>{n(m.n)}</span>
                              </div>
                            </div>
                            <span className="text-xxs max-sm:text-[11px] text-gray-400 truncate w-full text-center leading-none">
                              <MonthLabel ym={m.ym} withYear={i === 0 || m.ym.endsWith("-01")} />
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xxs text-gray-400">แท่งสีอ่อน = เดือนนี้ ยังไม่จบเดือน</div>
                  </>
                )}
              </div>
            </div>

            {/* แถว 4 — ใครถืองานอยู่
                ★ 1 ต.ค. 69 เอาการ์ด "ทีมช่าง · งานที่ถืออยู่" ออก — เลิกใช้ทีม A/B/C (แผน 20261001-01 เฟส 4)
                  API ยังส่ง teams มา (ลำดับผลลัพธ์อ้างด้วย index) แต่ไม่แสดงแล้ว */}
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl bg-white border border-gray-200 p-4">
                <div className="text-sm font-bold text-gray-500 mb-3">เจ้าของเคส · ใบงานที่ยังไม่ปิด</div>
                {d.owners.length === 0 ? <div className="text-sm text-gray-400 py-6 text-center">ยังไม่มีใบงานค้าง</div> : (
                  <div className="space-y-1">
                    {d.owners.map((o) => (
                      <div key={o.owner_user_id ?? 0} className="flex items-center gap-3 px-2 py-1.5">
                        <span className={`flex-1 text-sm ${o.owner_name ? "text-gray-700" : "text-amber-600 font-semibold"}`}>
                          {o.owner_name || "ยังไม่มีเจ้าของ"}
                        </span>
                        <span className="text-sm font-bold font-mono tabular-nums text-gray-900">{n(o.n)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
