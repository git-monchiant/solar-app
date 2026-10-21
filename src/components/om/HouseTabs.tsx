"use client";

// แท็บบนหน้ารายละเอียดงานบริการ (/om/services/[house]) นอกจาก Workflow — แผน 20260928-04 ข้อ 6
// ★ แท็บแบบหน้า lead ฝั่งขาย (Customer Info · Equipment · Photos) · เปลือกการ์ดยกจากแท็บ info ของ lead
//   (กล่องขาวมีแถบหัวเทา + ไอคอนสี + ชื่อไทย/คำอธิบาย) · เนื้อในเป็นข้อมูล O&M
// ★ แสดงอย่างเดียว — แก้ข้อมูลบ้าน/สิทธิ์ที่ modal ของหน้าบ้าน/ระบบติดตั้งที่เดียว (ปุ่ม "แก้ไขข้อมูลบ้าน")
//   กันกติกาการแก้ (ตัดสิทธิ์ · ซ่อนบ้าน · ลบ) มีสองที่แล้วเพี้ยนกัน
//   ยกเว้น Serial อุปกรณ์ในแท็บ Equipment - Serial (แผน 20261021-03) — แก้ที่แท็บนี้ที่เดียว modal บ้านไม่มีช่องนี้
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";
import FallbackImage from "@/components/ui/FallbackImage";
import { formatThaiDate } from "@/lib/utils/formatters";
import { statusLabel, statusTone } from "@/lib/om/booking";
import { thD, thDT } from "@/lib/om/service-view";
import { SystemCard, type HouseDetail } from "@/components/om/HouseSystemCard";
import { useOmPhotoUrls } from "@/lib/hooks/useOmPhotoUrls";
import { UploadTile } from "@/components/lead/detail/PhotosTab";
import SerialsUploader from "@/components/lead/detail/SerialsUploader";

const ROLE: Record<string, string> = { owner: "เจ้าของ", resident: "ผู้อยู่อาศัย", contact: "ผู้ติดต่อ" };
const SRC: Record<string, string> = { contract_base: "สิทธิ์ตั้งต้น", renewal: "ต่อสัญญา", purchase: "ซื้อเพิ่ม", import: "import", manual_adjust: "ปรับมือ", expire: "หมดอายุ" };

/** กล่องแบบแท็บ info ของหน้า lead — แถบหัวเทา (ไอคอน + ชื่อ + คำอธิบาย) · ปุ่มขวาได้ */
function Card({ icon, tone, title, sub, right, children }: {
  icon: string; tone: string; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-gray-800 leading-tight">{title}</div>
          {sub && <div className="text-[11px] text-gray-500 leading-tight">{sub}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const ICON = {
  house: "m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  users: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  ticket: "M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z",
  sun: "M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
  photo: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  // ไอคอนแท็บ Equipment - Serial (ชุดเดียวกับหน้า lead)
  chip: "M3.75 7.5l16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0012 6.75zM7.5 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
};

/** ข้อมูลบ้าน 1 หลัง — GET /api/om/houses/[id] ตัวเดียวกับ modal หน้าบ้าน · ver เปลี่ยน = โหลดใหม่ (ค่าเดิมค้างไว้จนได้ของใหม่) */
function useHouse(houseId: number, ver = 0) {
  const [d, setD] = useState<HouseDetail | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    apiFetch(`/api/om/houses/${houseId}`).then(setD).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [houseId, ver]);
  return { d, err };
}

const Err = ({ m }: { m: string }) => (
  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{m}</div>
);

/** ลิงก์ไปแก้ที่ modal บ้าน — เปิดแท็บใหม่ ไม่ทิ้งหน้างานที่ทำอยู่ (โหมด focus ไม่มีเมนูให้กลับ) */
const EditLink = ({ houseId }: { houseId: number }) => (
  <a href={`/om/houses?house=${houseId}`} target="_blank" rel="noreferrer"
    className="shrink-0 h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center no-underline">
    แก้ไขข้อมูลบ้าน ›
  </a>
);

// ─────────────── Customer Info = บ้าน + ลูกค้า + สิทธิ์ ───────────────
export function HouseInfoTab({ houseId }: { houseId: number }) {
  const { d, err } = useHouse(houseId);
  if (err) return <Err m={err} />;
  if (!d) return <Loading />;
  const h = d.house;
  const types = d.serviceTypes ?? [];
  const bals = d.balances ?? [];
  const cleaningId = types.find((t) => t.code === "cleaning")?.id ?? 0;
  const cycle = types.find((t) => t.code === "cleaning")?.cycle_months ?? null;
  const balance = Math.max(0, bals.find((b) => b.service_type_code === "cleaning")?.balance ?? 0);
  const otherBals = bals.filter((b) => b.service_type_code !== "cleaning" && b.total_granted !== 0);
  // ลำดับ "ครั้งที่" นับแยกตามชนิดงาน (แบบเดียวกับ modal บ้าน)
  const redIndex = new Map<number, number>();
  { const n = new Map<number, number>();
    for (const r of d.redemptions) { const k = (n.get(r.service_type_id) ?? 0) + 1; n.set(r.service_type_id, k); redIndex.set(r.id, k); } }
  const termText = (g: HouseDetail["grants"][number]) => {
    const yrs = Number(g.contract_term);
    return !(yrs > 0) || g.qty <= 0 || g.qty % yrs !== 0 ? "" : `สัญญา ${yrs} ปี · ${g.qty / yrs} ครั้ง/ปี`;
  };

  const fields: [string, React.ReactNode][] = [
    ["บ้านเลขที่", h.house_number || "—"],
    ["โครงการ", <>{h.project_name || "—"}{h.project_id && <span className="ml-1 text-xxs text-gray-400">รหัส {h.project_id}</span>}</>],
    ["segment", h.segment],
    ["สถานะยูนิต", h.unit_status || "—"],
    ["แบบบ้าน", h.model_name || "—"],
    ["เนื้อที่", h.titledeed_area ? `${h.titledeed_area} ตร.ว.` : "—"],
  ];

  return (
    <div className="space-y-3">
      {h.om_excluded_reason && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <b>ซ่อนออกจากงาน O&amp;M แล้ว</b> — {h.om_excluded_reason} · ข้อมูลทั้งหมดยังอยู่ครบ
        </div>
      )}

      <Card icon={ICON.house} tone="bg-sky-100 text-sky-600" title="ข้อมูลบ้าน" sub="House — จาก REM / ระบบขาย / ไฟล์นำเข้า"
        right={<EditLink houseId={houseId} />}>
        <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          {fields.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">{k}</div>
              <div className="text-sm font-semibold text-gray-800 truncate">{v}</div>
            </div>
          ))}
          <div className="col-span-2 md:col-span-3 flex flex-wrap items-center gap-2">
            {h.is_vip && <span className="text-xxs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">VIP</span>}
            <span className={`text-xxs font-bold px-2 py-0.5 rounded-full ${h.has_solar ? "bg-teal-50 text-teal-700" : "bg-red-100 text-red-700"}`}>
              {h.has_solar ? "มีระบบโซลาร์" : "ไม่มีโซลาร์"}</span>
            {h.latitude && h.longitude && (
              <a href={`https://www.google.com/maps?q=${h.latitude},${h.longitude}`} target="_blank" rel="noreferrer"
                className="text-xs font-bold text-active hover:underline">📍 เปิดแผนที่</a>
            )}
          </div>
          {h.note && (
            <div className="col-span-2 md:col-span-3">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">note ทีม <span className="normal-case tracking-normal font-normal">— ลูกค้าไม่เห็น</span></div>
              <div className="text-sm text-gray-700 whitespace-pre-line">{h.note}</div>
            </div>
          )}
        </div>
      </Card>

      <Card icon={ICON.users} tone="bg-emerald-100 text-emerald-600" title={`ลูกค้า (${d.customers.length})`} sub="Customers — เจ้าของ / ผู้อยู่อาศัย / ผู้ติดต่อ">
        {d.customers.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">ยังไม่ผูกลูกค้า</div>}
        {d.customers.map((c) => (
          <div key={c.link_id} className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
            <div className="flex-1 min-w-0">
              <b className="text-gray-900">{c.full_name}</b>
              <div className="text-xs text-gray-500">
                {c.phone ? <a href={`tel:${c.phone}`} className="tabular-nums text-gray-600 no-underline hover:text-active">{c.phone}</a> : "ไม่มีเบอร์"}
              </div>
            </div>
            <span className={`text-xxs font-bold px-2 py-0.5 rounded-full ${c.role === "owner" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
              {ROLE[c.role] ?? c.role}</span>
          </div>
        ))}
      </Card>

      <Card icon={ICON.ticket} tone="bg-teal-100 text-teal-600" title="สิทธิ์ล้างแผง" sub="Entitlements — ได้ / ใช้ / คงเหลือ"
        right={<span className="text-xl font-bold text-primary-dark shrink-0">{balance} <small className="text-xxs font-medium text-gray-500">ครั้ง คงเหลือ</small></span>}>
        {/* ครบรอบถัดไป — สูตรเดียวกับแท็บติดตาม (แผน 20260928-02) */}
        {d.systems.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 text-xs text-gray-600">
            {cycle ? <>ล้างทุก {cycle} เดือน · </> : null}
            {h.wash_due
              ? <b className="text-orange-600">ถึงรอบล้างแล้ว{h.next_wash ? "" : " · ยังไม่เคยล้าง"}</b>
              : <>ครบรอบถัดไป <b className="text-gray-900">{formatThaiDate(h.next_wash)}</b></>}
            {h.wash_due && balance <= 0 ? <span className="text-red-600"> · สิทธิ์หมด ต้องเสนอราคาก่อนนัด</span> : null}
          </div>
        )}
        {otherBals.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-1.5">
            {otherBals.map((b) => (
              <span key={b.service_type_id} className="text-xxs font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">
                {b.service_type_label} เหลือ {Math.max(0, b.balance)}/{b.total_granted}
              </span>
            ))}
          </div>
        )}
        {d.grants.map((g) => (
          <div key={`g${g.id}`} className="flex items-center gap-2.5 px-4 py-1.5 border-b border-gray-100 text-xxs text-gray-500">
            <b className={`min-w-[38px] ${g.qty < 0 ? "text-red-600" : "text-gray-700"}`}>{g.qty > 0 ? "+" : ""}{g.qty}</b>
            {/* แถวเพิ่ม/ลด (ปรับมือ) โชว์แค่เหตุผล — ชุดเดียวกับหน้าบ้าน / ระบบติดตั้ง (15 ต.ค. 69) */}
            {g.source !== "manual_adjust" && <span className="font-bold px-2 rounded-full bg-emerald-50 text-emerald-700">{SRC[g.source] ?? g.source}</span>}
            {g.service_type_id !== cleaningId && <span className="font-bold px-2 rounded-full bg-sky-50 text-sky-700">{g.service_type}</span>}
            <span className="flex-1 truncate">{termText(g) && <b className="text-gray-700">{termText(g)} · </b>}
              {g.reason || (g.source === "manual_adjust" ? <span className="text-gray-400">ไม่ระบุเหตุผล</span> : "")}</span>
            {g.source === "manual_adjust" && (g.created_by_name || g.created_dt) && (
              <span className="shrink-0 text-gray-400 whitespace-nowrap">โดย {g.created_by_name ?? "—"}{g.created_dt ? ` · ${thDT(g.created_dt)}` : ""}</span>
            )}
          </div>
        ))}
        {d.redemptions.map((r) => (
          <div key={`r${r.id}`} className="flex items-center gap-2.5 px-4 py-1.5 border-b border-gray-100 last:border-0 text-xxs text-gray-500">
            <b className="text-gray-700 min-w-[38px]">−1</b>
            <span className={`font-bold px-2 rounded-full ${r.service_type_id === cleaningId ? "bg-gray-100 text-gray-500" : "bg-sky-50 text-sky-700"}`}>
              {r.service_type_id === cleaningId ? `ล้างครั้งที่ ${redIndex.get(r.id)}` : `${r.service_type} ครั้งที่ ${redIndex.get(r.id)}`}</span>
            <span className="flex-1 truncate">{r.service_date}{r.note ? ` · ${r.note}` : ""}</span>
          </div>
        ))}
        {!d.grants.length && !d.redemptions.length && <div className="px-4 py-3 text-sm text-gray-400">ยังไม่มีรายการสิทธิ์</div>}
      </Card>
    </div>
  );
}

// ─────────────── Equipment - Serial = Serial อุปกรณ์ (ยกแท็บฝั่งขาย) + ระบบติดตั้ง ───────────────
// ★ 21 ต.ค. 69 แผน 20261021-03 — ผู้ใช้สั่ง "ให้เหมือนงานขาย ครบทุก function"
//   ส่วนบน = SerialsUploader ตัวเดียวกับแท็บ Equipment - Serial ของหน้า lead ทั้งก้อน (wizard · AI อ่านป้าย · รูปย่อกรอบแดง)
//   ต่อ API ของ O&M · ไม่ล็อก แก้ได้ตลอด ทุกการเพิ่ม/ลบลง Activity Log (ผู้ใช้เคาะ D1) · Account ดูอย่างเดียว
//   ส่วนล่าง = การ์ดระบบติดตั้งเดิม (D2) — โหลดใหม่หลังแก้ Serial เพราะ API เขียนแถวแรกกลับลงช่องอินเวอร์เตอร์/แบต
/** ชิปยี่ห้ออินเวอร์เตอร์ — ข้อมูล O&M มี ABB 463 · HUAWEI 250 · SMA 8 ระบบ (D3) · แผง/แบตใช้ชุดเดิมของฝั่งขาย */
const OM_BRANDS = { inverters: ["Huawei", "ABB", "DEYE", "SMA"] } as const;

export function HouseEquipmentTab({ houseId, bookingId, readOnly, onChange }: {
  houseId: number;
  /** ใบงานที่เปิดอยู่ — ผูกแถว Activity Log กับใบนั้นด้วย (แบบปุ่ม Note) */
  bookingId?: number | null;
  readOnly?: boolean;
  /** หลังแก้ Serial — หน้างานโหลด Activity Log ใหม่ */
  onChange?: () => void;
}) {
  const [ver, setVer] = useState(0);
  const { d, err } = useHouse(houseId, ver);
  if (err) return <Err m={err} />;
  if (!d) return <Loading />;
  return (
    <div className="space-y-3">
      {/* ★ 21 ต.ค. 69 ผู้ใช้สั่งตรวจการจัดวาง: ใส่กรอบการ์ดแบบเดียวกับการ์ดระบบติดตั้ง/แท็บอื่น
          (เดิมวางลอยบนพื้นขาวแล้วต่อด้วยการ์ดมีกรอบ — สองหน้าตาซ้อนกัน) · เนื้อในเป็นตัวเดียวกับหน้า lead */}
      <Card icon={ICON.chip} tone="bg-indigo-100 text-indigo-600" title="Serial อุปกรณ์"
        sub="Serial — อินเวอร์เตอร์ · แผงโซลาร์ · แบตเตอรี่ · การเพิ่ม/ลบทุกครั้งบันทึกใน Activity Log">
        {d.systems.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">บ้านนี้ยังไม่มีระบบติดตั้ง — เพิ่ม Serial ไม่ได้</div>}
        {d.systems.map((s, i) => (
          <div key={s.id} className="border-b border-gray-100 last:border-0">
            {/* บ้านหลายระบบ (ตอนนี้ยังไม่มี) — หัวบอกว่าเป็น Serial ของระบบไหน */}
            {d.systems.length > 1 && (
              <div className="px-4 pt-3 text-xs font-bold text-gray-500">ระบบที่ {i + 1}{s.kwp ? ` · ${s.kwp} kWp` : ""}</div>
            )}
            {/* ★ รู้ขนาด/ยี่ห้ออินเวอร์เตอร์จากไฟล์บัญชีแต่ไม่มี Serial (758 ระบบ) — เดิม Inverter 0 ขัดกับการ์ดข้างล่างที่ขึ้น 3.2 kW
                inverter_sn = Serial ตัวแรกที่ API เขียนกลับ ⇒ ว่าง = ยังไม่มี Serial */}
            {!s.inverter_sn && (!!s.inverter_kw || !!s.inverter_brand) && (
              <div className="px-4 pt-3 text-xs text-gray-500">
                ระบบติดตั้งระบุอินเวอร์เตอร์{" "}
                <b className="text-gray-700">{[s.inverter_brand, s.inverter_kw ? `${s.inverter_kw} kW` : null].filter(Boolean).join(" ")}</b>
                {" "}แต่ยังไม่มี Serial
              </div>
            )}
            <SerialsUploader
              endpoint={`/api/om/installations/${s.id}/devices${bookingId ? `?booking=${bookingId}` : ""}`}
              brandSuggestions={OM_BRANDS}
              readOnly={readOnly}
              onChange={() => { setVer((v) => v + 1); onChange?.(); }}
            />
          </div>
        ))}
      </Card>
      <HouseSystemsCard d={d} houseId={houseId} />
    </div>
  );
}

/** การ์ดระบบติดตั้ง (การ์ดเดียวกับ modal บ้าน) */
function HouseSystemsCard({ d, houseId }: { d: HouseDetail; houseId: number }) {
  return (
    <Card icon={ICON.sun} tone="bg-amber-100 text-amber-600" title={`ระบบติดตั้ง (${d.systems.length})`}
      sub="Equipment — ขนาด · อินเวอร์เตอร์ · ประกัน · PO · ที่มาข้อมูล" right={<EditLink houseId={houseId} />}>
      {/* ★ ผู้ใช้เคาะ 2 ก.ย.: ของแถมไม่ต้องโชว์เป็นรายการและห้ามโชว์ราคา (ข้อความเดียวกับ modal บ้าน) */}
      {!!d.promo?.n_items && (
        <div className="px-4 pt-3 text-xxs text-gray-500">
          พบรายการของแถมใน REM {d.promo.n_items} รายการ
          {d.promo.n_solar > 0 && (
            <span className="text-active-dark font-bold">
              {" · ☀ มีโซลาร์"}{d.promo.solar_kw ? ` ${d.promo.solar_kw} kW` : ""}{d.promo.om_years ? ` · O&M ${d.promo.om_years} ปี` : ""}
            </span>
          )}
          {d.promo.contract_id && <span className="text-gray-400"> · {d.promo.contract_id}</span>}
        </div>
      )}
      {d.systems.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">ไม่มีระบบติดตั้ง</div>}
      {/* ระบบเดียว (ทุกบ้านตอนนี้) = การ์ดเต็มกว้าง สเปกซ้าย · ที่มาข้อมูลขวา · หลายระบบ = 2 ใบต่อแถวแบบเดิม */}
      <div className={`p-4 grid gap-3 items-start ${d.systems.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {d.systems.map((s, i) => <SystemCard key={s.id} sel={d} s={s} i={i} className="" wide={d.systems.length === 1} />)}
      </div>
    </Card>
  );
}

// ─────────────── Photos = รูปก่อน/หลังของทุกใบงานของบ้าน ───────────────
type JobPhoto = { file: string; kind: string; at: string; size: number };
type JobPhotos = { id: number; scheduled_at: string | null; service_type: string | null; status: string; photos: JobPhoto[] };

/** ใบงานที่ช่างถึงหน้างานแล้ว — เพิ่มรูปก่อน/หลังจากแท็บนี้ได้ (ยังไม่เข้างาน/ยกเลิก ไม่มีรูปหน้างานให้เพิ่ม) */
const CAN_ADD = ["progress", "checked", "closed"];

/** รูปทุกใบงานของบ้าน — ไม่มี API ใหม่ อ่าน GET /api/om/jobs/[id]/report ทีละใบ (บ้านหนึ่งมีไม่กี่ใบ)
 *  ★ รูปเสิร์ฟผ่าน /api/om/jobs/<id>/photos/<file> ที่ตรวจสิทธิ์ก่อนเสมอ (ไฟล์อยู่นอก public/)
 *  ★ 15 ต.ค. 69 ผู้ใช้สั่ง "เพิ่มปุ่มเพิ่มรูปเหมือนงานขาย" — ยกช่อง + เพิ่มรูป (UploadTile) ของแท็บ Photos ฝั่งขาย
 *    เพิ่มได้แม้ปิดงานแล้ว (แบบ "รูปติดตั้งอื่นๆ" ฝั่งขาย) · ลบรูปทำที่ใบตรวจรับงานเท่านั้น */
export function JobPhotosTab({ bookingIds }: { bookingIds: number[] }) {
  const [jobs, setJobs] = useState<JobPhotos[] | null>(null);
  const [err, setErr] = useState("");
  const key = bookingIds.join(",");
  useEffect(() => {
    const ids = key ? key.split(",").map(Number) : [];
    Promise.all(ids.map((id) => apiFetch(`/api/om/jobs/${id}/report`)
      .then((d: { job: { scheduled_at: string | null; service_type: string | null; status: string }; report: { photos?: JobPhoto[] } | null }) =>
        ({ id, scheduled_at: d.job.scheduled_at, service_type: d.job.service_type, status: d.job.status, photos: d.report?.photos ?? [] }))
      .catch(() => ({ id, scheduled_at: null, service_type: null, status: "", photos: [] as JobPhoto[] }))))
      .then((list) => setJobs(list.sort((a, b) => (b.scheduled_at ?? "").localeCompare(a.scheduled_at ?? "") || b.id - a.id)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [key]);

  const [upErr, setUpErr] = useState("");
  const upload = (jobId: number, kind: string) => async (file: File) => {
    setUpErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      // ★ ห้ามตั้ง Content-Type เอง — เบราว์เซอร์ต้องใส่ boundary ของ multipart ให้
      const d = await apiFetch(`/api/om/jobs/${jobId}/photos`, { method: "POST", body: fd });
      setJobs((prev) => prev && prev.map((j) => (j.id === jobId ? { ...j, photos: d.photos ?? j.photos } : j)));
    } catch (e) { setUpErr(e instanceof Error ? e.message : String(e)); }
  };

  const shown = (jobs ?? []).filter((j) => j.photos.length > 0 || CAN_ADD.includes(j.status));
  const KINDS = ["before", "after"] as const;
  // แกลเลอรีเดียวทั้งบ้าน — เปิดรูปไหนก็เลื่อนดูต่อได้ทุกใบงาน (แบบ HANDOVER PHOTOS ฝั่งขาย)
  // ★ ลำดับต้องตรงกับที่วาดด้านล่างเป๊ะ (ใบงาน → ก่อน → หลัง) ไม่งั้นกดรูปแล้ว lightbox เปิดผิดรูป
  const items = shown.flatMap((j) => KINDS.flatMap((kind) => j.photos.filter((p) => p.kind === kind).map((p) => ({
    src: `/api/om/jobs/${j.id}/photos/${p.file}`,
    label: `ใบงาน #${j.id} · ${kind === "before" ? "ก่อนทำงาน" : "หลังทำงาน"}`,
  }))));
  // ★ <img src> ตรงไปที่ API ไม่ได้ (แนบ header สิทธิ์ไม่ได้ → 403) — ดึงเป็น blob URL ก่อน (เรียกก่อน return ใด ๆ)
  const blobs = useOmPhotoUrls(items.map((i) => i.src));

  if (err) return <Err m={err} />;
  if (!jobs) return <Loading />;
  const gallery = items.map((i) => ({ url: blobs[i.src] ?? "", label: i.label }));
  let gi = 0;

  return (
    <Card icon={ICON.photo} tone="bg-violet-100 text-violet-600" title={`รูปหน้างาน (${gallery.length})`}
      sub="Photos — รูปก่อน / หลังทำงาน จากใบตรวจรับงานทุกใบของบ้านนี้">
      {upErr && <div className="px-4 pt-3"><Err m={upErr} /></div>}
      {!shown.length && (
        <div className="px-4 py-10 text-center text-sm text-gray-400">
          {jobs.length ? "ยังไม่มีรูปในใบตรวจรับงานของบ้านนี้" : "บ้านนี้ยังไม่มีใบงาน"}
        </div>
      )}
      {shown.map((j) => (
        <div key={j.id} className="border-b border-gray-100 last:border-0 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
            <b className="text-gray-800">ใบงาน #{j.id}</b>
            {j.service_type && <span className="text-gray-500">· {j.service_type}</span>}
            {j.scheduled_at && <span className="text-gray-500">· นัด {thD(j.scheduled_at)}</span>}
            {j.status && <span className={`text-xxs font-semibold px-2 py-0.5 rounded-full text-white ${statusTone(j.status)}`}>{statusLabel(j.status)}</span>}
          </div>
          {KINDS.map((kind) => {
            const list = j.photos.filter((p) => p.kind === kind);
            const canAdd = CAN_ADD.includes(j.status);
            if (!list.length && !canAdd) return null;
            return (
              <div key={kind} className="mb-2 last:mb-0">
                <div className="text-xxs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  {kind === "before" ? "ก่อนทำงาน" : "หลังทำงาน"} · {list.length} รูป
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {list.map((p) => {
                    const idx = gi++;
                    return gallery[idx].url ? (
                      <FallbackImage key={p.file} src={gallery[idx].url} alt={gallery[idx].label}
                        className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                        gallery={gallery} galleryIndex={idx} />
                    ) : <div key={p.file} className="w-full aspect-square rounded-lg border border-gray-200 bg-gray-100 animate-pulse" />;
                  })}
                  {canAdd && <UploadTile onFile={upload(j.id, kind)} />}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}
