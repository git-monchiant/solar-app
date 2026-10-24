"use client";

// ฟอร์ม "+ เพิ่มบ้าน" O&M (แผน 20261014-08) — ลูกค้าที่ไม่ได้มาจาก REM / งานขาย (ติดตั้งเจ้าอื่น · นอกโครงการเสนา)
// ★ โครงจาก NewLeadModal: ModalBase + ปุ่ม ยกเลิก/บันทึก ที่ footer · ช่องกรอกชุดเดียวกับ modal ลูกค้า/บ้าน O&M
// ★ เช็คซ้ำระหว่างพิมพ์ (/api/om/houses/check) — server เช็คซ้ำอีกรอบตอนบันทึก (409 + conflicts)
// ★ ไม่สร้าง lead — บันทึกแล้วไปหน้างานบริการของบ้าน ออกใบเสนอราคาที่นั่นแล้ว lead om_only เกิดเอง
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getUserContextHeaders } from "@/lib/api";
import ModalBase from "@/components/ui/ModalBase";
import Dropdown from "@/components/ui/Dropdown";
import { isPlaceholderPhone } from "@/lib/utils/formatters";
import type { HouseConflict } from "@/lib/om/manual-house";

const EMPTY = {
  title: "", first_name: "", last_name: "", phone: "", id_card: "", email: "", contact_line_id: "",
  project_id: "", house_number: "", address: "", coords: "", note: "",
  inverter_brand: "", inverter_kw: "", size_kwp: "", battery_brand: "", battery_kwh: "", install_date: "",
};
const INPUT = "h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary";
const digits = (s: string) => s.replace(/\D/g, "");
const todayBangkok = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

// พิกัด: วาง "13.7563, 100.5018" หรือลิงก์ Google Maps (…?q=13.75,100.50 / …@13.75,100.50,17z) ก็ได้
function parseCoords(s: string): { lat: string; lng: string } | null {
  const m = s.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
  return m ? { lat: m[1], lng: m[2] } : null;
}

type Person = { id: number; name: string | null; kinds: Set<string>; houses: HouseConflict[] };

export default function OmNewHouseModal({ onClose, onOpenHouse }: {
  onClose: () => void;
  /** เปิด modal บ้านเดิมในหน้าบ้าน (บ้านที่ถูกซ่อน — ปุ่มเอากลับเข้าระบบอยู่ที่นั่น) */
  onOpenHouse: (houseId: number) => void;
}) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [projects, setProjects] = useState<{ project_id: string; name_th: string }[] | null>(null);
  const [conflicts, setConflicts] = useState<HouseConflict[]>([]);
  const [pick, setPick] = useState<{ id: number; name: string | null } | null>(null);   // ใช้ลูกค้าเดิม
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/om/houses/check?with=projects")
      .then((d) => setProjects(d.projects ?? []))
      .catch((e) => { setProjects([]); setError(e instanceof Error ? e.message : String(e)); });
  }, []);

  // เช็คซ้ำเมื่อข้อมูลครบพอ: เบอร์ 10 หลัก · เลขบัตร 13 หลัก · โครงการ + บ้านเลขที่
  const phone = digits(f.phone), idCard = digits(f.id_card);
  const fakePhone = isPlaceholderPhone(phone);   // 0000000000 ฯลฯ — ไม่รับ (แผน 20261015-05)
  const houseNumber = f.house_number.trim();
  useEffect(() => {
    const q = new URLSearchParams();
    if (/^0\d{9}$/.test(phone) && !isPlaceholderPhone(phone)) q.set("phone", phone);
    if (/^\d{13}$/.test(idCard)) q.set("id_card", idCard);
    if (f.project_id && houseNumber) { q.set("project", f.project_id); q.set("house_number", houseNumber); }
    if (![...q.keys()].length) { setConflicts([]); return; }
    const t = setTimeout(() => {
      apiFetch(`/api/om/houses/check?${q}`).then((d) => setConflicts(d.conflicts ?? [])).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [phone, idCard, f.project_id, houseNumber]);

  const houseHit = conflicts.find((c) => c.kind === "house") ?? null;
  const reuseHouseId = houseHit?.house_state === "dormant" ? houseHit.house_id : null;
  const houseBlocked = !!houseHit && houseHit.house_state !== "dormant";
  // คนที่ชน — รวมรายคน (เบอร์กับเลขบัตรอาจชนคนเดียวกัน)
  const people = useMemo(() => {
    const m = new Map<number, Person>();
    for (const c of conflicts) {
      if (c.kind === "house" || c.customer_id == null) continue;
      const p = m.get(c.customer_id) ?? { id: c.customer_id, name: c.customer_name, kinds: new Set(), houses: [] };
      p.kinds.add(c.kind);
      if (c.house_id != null && !p.houses.some((h) => h.house_id === c.house_id)) p.houses.push(c);
      m.set(c.customer_id, p);
    }
    return [...m.values()];
  }, [conflicts]);
  const needPick = people.length > 0 && !pick;

  const coords = f.coords.trim() ? parseCoords(f.coords) : null;
  const problems = [
    !pick && !f.first_name.trim() && "ชื่อลูกค้า",
    !pick && !/^0\d{9}$/.test(phone) && "เบอร์โทร 10 หลัก",
    pick && phone && !/^0\d{9}$/.test(phone) && "เบอร์โทร 10 หลัก",
    fakePhone && "เบอร์โทรที่ใช้งานได้ (ใช้เลขซ้ำหรือเลขเรียงไม่ได้)",
    idCard && !/^\d{13}$/.test(idCard) && "เลขบัตร 13 หลัก",
    !houseNumber && "บ้านเลขที่",
    !f.project_id && !f.address.trim() && "ที่อยู่ (บ้านนอกโครงการ)",
    f.coords.trim() && !coords && "พิกัด",
  ].filter(Boolean) as string[];
  const noSpec = !f.inverter_brand.trim() && !f.inverter_kw.trim() && !f.size_kwp.trim();
  const canSubmit = !saving && !problems.length && !houseBlocked && !needPick;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true); setError(null);
    try {
      // raw fetch — ต้องอ่าน 409 + conflicts (apiFetch โยนแค่ข้อความ)
      const res = await fetch("/api/om/houses", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getUserContextHeaders() },
        body: JSON.stringify({
          customer_id: pick?.id ?? null, house_id: reuseHouseId,
          title: f.title, first_name: f.first_name, last_name: f.last_name, phone, id_card: idCard,
          email: f.email, contact_line_id: f.contact_line_id,
          project_id: f.project_id || null, house_number: houseNumber, address: f.address, note: f.note,
          latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
          inverter_brand: f.inverter_brand, inverter_kw: f.inverter_kw, size_kwp: f.size_kwp,
          battery_brand: f.battery_brand, battery_kwh: f.battery_kwh, install_date: f.install_date,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(body.conflicts)) {
        setConflicts(body.conflicts);
        setError(body.error || "ข้อมูลซ้ำกับที่มีในระบบ");
        return;
      }
      if (!res.ok) throw new Error(body.error || "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      onClose();
      router.push(`/om/services/${body.house_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const projectOptions = [
    { value: "", label: "นอกโครงการ (ลูกค้าทั่วไป)" },
    ...(projects ?? []).map((p) => ({ value: p.project_id, label: p.name_th })),
  ];
  const houseLabel = (h: HouseConflict) =>
    `${h.house_number || "(ไม่มีบ้านเลขที่)"} · ${h.project_name ?? "นอกโครงการ"}`;

  return (
    <ModalBase
      title="เพิ่มบ้าน / ลูกค้า O&M"
      onClose={onClose}
      size="lg"
      footer={
        <div className="grid gap-2">
          {problems.length > 0 && (
            <div className="text-xs text-gray-500">กรุณากรอก: {problems.join(" · ")}</div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white">
              ยกเลิก
            </button>
            <button type="button" onClick={submit} disabled={!canSubmit}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:bg-primary-dark transition-colors">
              {saving ? "กำลังบันทึก…" : reuseHouseId ? "เปิดใช้บ้านเดิม" : "บันทึก"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        {/* ── ลูกค้า */}
        <Sec t="ลูกค้า" />
        {pick ? (
          <div className="flex items-center gap-2 rounded-lg bg-active-light px-3 py-2 text-sm">
            <span>ใช้ลูกค้าเดิม <b>{pick.name || `รหัส ${pick.id}`}</b></span>
            <button type="button" style={{ minHeight: 0 }} onClick={() => setPick(null)}
              className="ml-auto h-7 px-3 rounded-lg border border-gray-200 bg-white text-xs font-bold cursor-pointer">เปลี่ยน</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr_1fr]">
            <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">คำนำหน้า</span>
              <select value={f.title} onChange={set("title")}
                className="h-9 rounded-lg border border-gray-200 px-2 text-sm font-semibold outline-none focus:border-primary">
                <option value="">ไม่ระบุ</option>{["นาย", "นาง", "นางสาว", "คุณ", "ดร."].map((t) => <option key={t}>{t}</option>)}
              </select></label>
            <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">ชื่อ *</span>
              <input value={f.first_name} onChange={set("first_name")} className={INPUT} /></label>
            <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">นามสกุล</span>
              <input value={f.last_name} onChange={set("last_name")} className={INPUT} /></label>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">เบอร์โทร {pick ? "" : "*"}</span>
            <input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="08xxxxxxxx" className={INPUT} />
            {fakePhone && <span className="text-xs text-red-600">เบอร์โทรไม่ถูกต้อง — กรุณากรอกเบอร์ที่ติดต่อลูกค้าได้</span>}</label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">เลขบัตรประชาชน</span>
            <input value={f.id_card} onChange={set("id_card")} inputMode="numeric" placeholder="ไม่บังคับ — ใช้ตรวจสอบรายชื่อซ้ำ" className={INPUT} /></label>
          {/* ★ 21 ต.ค. 69 ผู้ใช้สั่งเพิ่มช่อง — ไม่บังคับ · ลูกค้าเดิมเติมเฉพาะช่องที่ยังว่าง */}
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">อีเมล</span>
            <input value={f.email} onChange={set("email")} type="email" inputMode="email" placeholder="ไม่บังคับ" className={INPUT} /></label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">LINE ID</span>
            <input value={f.contact_line_id} onChange={set("contact_line_id")} placeholder="ไม่บังคับ — เช่น somchai หรือ @somchai" className={INPUT} /></label>
        </div>
        {/* คนที่ชน — ต้องเลือกใช้คนเดิม ระบบไม่สร้างคนซ้ำ (เปลี่ยนเบอร์/เลขบัตรได้ถ้าไม่ใช่คนเดียวกัน) */}
        {needPick && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 grid gap-2">
            <div className="text-xs font-bold text-amber-800">มีลูกค้าที่ใช้เบอร์โทร / เลขบัตรนี้อยู่แล้ว — หากเป็นบุคคลเดียวกัน กด “ใช้ลูกค้ารายนี้”</div>
            {people.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0">
                  <b>{p.name || `รหัส ${p.id}`}</b>
                  <span className="text-xs text-gray-500"> · {[...p.kinds].map((k) => (k === "phone" ? "เบอร์โทร" : "เลขบัตร")).join("/")}ตรงกัน</span>
                  {p.houses.map((h) => (
                    <a key={h.house_id} href={`/om/services/${h.house_id}`} target="_blank" rel="noreferrer"
                      className="ml-2 text-xs font-bold text-active hover:underline">บ้าน {houseLabel(h)} ↗</a>
                  ))}
                </span>
                <button type="button" style={{ minHeight: 0 }} onClick={() => setPick({ id: p.id, name: p.name })}
                  className="ml-auto h-7 px-3 rounded-lg bg-primary text-white text-xs font-bold cursor-pointer">ใช้ลูกค้ารายนี้</button>
              </div>
            ))}
          </div>
        )}

        {/* ── บ้าน */}
        <Sec t="บ้าน" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 min-w-0"><span className="text-xs font-bold text-gray-700">โครงการ</span>
            {projects === null ? <span className="h-9 text-xs text-gray-400 flex items-center">กำลังโหลดโครงการ…</span> : (
              <Dropdown className="w-full font-normal" value={f.project_id}
                onChange={(v) => setF((p) => ({ ...p, project_id: v }))} options={projectOptions} searchable />
            )}</label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">บ้านเลขที่ *</span>
            <input value={f.house_number} onChange={set("house_number")} placeholder="99/12" className={INPUT} /></label>
        </div>
        {houseHit && (
          houseHit.house_state === "dormant" ? (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              มีบ้าน <b>{houseLabel(houseHit)}</b> ในระบบอยู่แล้ว (ยังไม่เปิดใช้งาน O&M{houseHit.customer_name ? ` · ${houseHit.customer_name}` : ""})
              — เมื่อกดบันทึก ระบบจะ<b>เปิดใช้บ้านเดิม</b>แทนการสร้างใหม่ ข้อมูลเดิมไม่ถูกเขียนทับ
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex flex-wrap items-center gap-2">
              <span>
                บ้าน <b>{houseLabel(houseHit)}</b>{houseHit.customer_name ? ` · ${houseHit.customer_name}` : ""}{" "}
                {houseHit.house_state === "hidden" ? "ถูกซ่อนออกจากงาน O&M — เปิดข้อมูลบ้านแล้วกด “นำกลับเข้าระบบ”" : "มีในระบบ O&M แล้ว"}
              </span>
              {houseHit.house_state === "hidden" ? (
                <button type="button" style={{ minHeight: 0 }} onClick={() => onOpenHouse(houseHit.house_id!)}
                  className="ml-auto h-7 px-3 rounded-lg border border-red-200 bg-white text-xs font-bold cursor-pointer">เปิดบ้าน</button>
              ) : (
                <a href={`/om/services/${houseHit.house_id}`}
                  className="ml-auto h-7 px-3 rounded-lg border border-red-200 bg-white text-xs font-bold inline-flex items-center">เปิดบ้านเดิม</a>
              )}
            </div>
          )
        )}
        <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">ที่อยู่ {f.project_id ? "" : "*"}</span>
          <textarea value={f.address} onChange={set("address")} rows={2}
            placeholder={f.project_id ? "ไม่บังคับ — บ้านในโครงการค้นหาได้จากบ้านเลขที่" : "ถนน · ตำบล · อำเภอ · จังหวัด — สำหรับช่างเดินทางไปหน้างาน"}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-primary" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">พิกัด</span>
            <input value={f.coords} onChange={set("coords")} placeholder="13.7563, 100.5018 หรือลิงก์ Google Maps" className={INPUT} />
            {coords && (
              <a href={`https://www.google.com/maps?q=${coords.lat},${coords.lng}`} target="_blank" rel="noreferrer"
                className="text-xs font-bold text-active hover:underline">📍 เปิดแผนที่ตรวจสอบ</a>
            )}</label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">หมายเหตุ <small className="font-medium text-gray-400">— ลูกค้าไม่เห็น</small></span>
            <input value={f.note} onChange={set("note")} placeholder="เช่น ชื่อบริษัทที่ติดตั้ง" className={INPUT} /></label>
        </div>

        {/* ── ระบบโซลาร์ (ไม่บังคับ · ผู้ใช้เลือก D2 = A) */}
        <Sec t="ระบบโซลาร์ที่ติดอยู่" />
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
          <label className="grid gap-1 col-span-2 sm:col-span-1"><span className="text-xs font-bold text-gray-700">ยี่ห้ออินเวอร์เตอร์</span>
            <input value={f.inverter_brand} onChange={set("inverter_brand")} placeholder="HUAWEI" className={INPUT} /></label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">อินเวอร์เตอร์ kW</span>
            <input value={f.inverter_kw} onChange={set("inverter_kw")} inputMode="decimal" className={INPUT} /></label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">ขนาดระบบ kWp</span>
            <input value={f.size_kwp} onChange={set("size_kwp")} inputMode="decimal" className={INPUT} /></label>
          <label className="grid gap-1 col-span-2 sm:col-span-1"><span className="text-xs font-bold text-gray-700">ยี่ห้อแบตเตอรี่</span>
            <input value={f.battery_brand} onChange={set("battery_brand")} placeholder="เว้นว่างได้หากไม่มี" className={INPUT} /></label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">แบตเตอรี่ kWh</span>
            <input value={f.battery_kwh} onChange={set("battery_kwh")} inputMode="decimal" className={INPUT} /></label>
          <label className="grid gap-1"><span className="text-xs font-bold text-gray-700">วันติดตั้ง</span>
            <input type="date" value={f.install_date} onChange={set("install_date")} max={todayBangkok()} className={INPUT} /></label>
        </div>
        {noSpec && (
          <div className="text-xs text-amber-700">
            ⚠ ไม่ได้กรอกยี่ห้อ / ขนาด — ใบเสนอราคาจะไม่แสดงขนาด kW อัตโนมัติ (พิมพ์เพิ่มในใบเสนอราคาได้) และตรวจสอบแพ็กเกจที่ตรงกับขนาดระบบไม่ได้
          </div>
        )}
        <div className="text-xs text-gray-500">
          บ้านที่เพิ่มเองไม่มีสิทธิ์ล้างแผงฟรี — ลูกค้าซื้อแพ็กเกจผ่านใบเสนอราคา O&M ได้ทันทีหลังบันทึก
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        )}
      </div>
    </ModalBase>
  );
}

// หัวข้อส่วน — แบบ Sec ในหน้าบ้าน (แถบเทาเต็มความกว้าง modal)
function Sec({ t }: { t: string }) {
  return (
    <div className="-mx-5 px-5 py-2 border-y border-gray-100 bg-gray-50 first:-mt-4 first:border-t-0">
      <b className="text-xs font-bold">{t}</b>
    </div>
  );
}
