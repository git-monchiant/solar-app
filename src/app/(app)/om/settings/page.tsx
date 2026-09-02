"use client";

// ตั้งค่า O&M — กติกาการจอง · เลื่อนนัด · ยกเลิก
// ★ ผู้ใช้เคาะ 31 ส.ค.: ทุกกติกาต้องแก้ได้จากหน้านี้ ห้าม hardcode ในโค้ด
//   ค่าที่ยังรอ business ตอบ ขึ้นธงเตือนไว้ (pending_biz) — ระบบใช้ค่าผ่อนปรนไปก่อน
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Loading from "@/components/ui/Loading";

interface Setting {
  key: string;
  value: number | boolean | string | null;
  label_th: string;
  group_key: string;
  pending_biz: boolean;
  note: string | null;
  sort_order: number;
}

const GROUP: Record<string, { title: string; desc: string }> = {
  booking:    { title: "การจองนัด",   desc: "ลูกค้าจองผ่าน LIFF ได้แค่ไหน · ความจุต่อทีม" },
  reschedule: { title: "การเลื่อนนัด", desc: "ใครเลื่อนได้ · เลื่อนได้กี่ครั้ง · เลื่อนแล้วเกิดอะไร" },
  cancel:     { title: "การยกเลิก / ลูกค้าไม่อยู่บ้าน", desc: "เงื่อนไขคืนสิทธิ์ล้างแผง" },
};

// หน่วยท้ายช่องกรอก — ช่วยให้อ่านออกว่าเลขนี้คืออะไร
const UNIT: Record<string, string> = {
  "booking.slot_per_team": "คิว",
  "booking.advance_days_max": "วัน",
  "booking.advance_hours_min": "ชั่วโมง",
  "reschedule.max_times": "ครั้ง",
  "reschedule.min_hours_before": "ชั่วโมง",
  "cancel.min_hours_before": "ชั่วโมง",
};

export default function OmSettingsPage() {
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

  const pending = items.filter((x) => x.pending_biz && x.value === null);
  const groups = Object.keys(GROUP).filter((g) => items.some((x) => x.group_key === g));

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4">
      {err && <div className="border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 rounded-xl">{err}</div>}

      {pending.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-4">
          <div className="text-base font-bold text-amber-800">★ รอ business ตอบ {pending.length} เรื่อง</div>
          <div className="text-xs text-amber-700 mt-1">
            ระหว่างรอ ระบบใช้ค่าผ่อนปรนที่สุด (ยกเลิกได้ตลอด · ไม่ตัดสิทธิ์) — กรอกค่าเมื่อได้คำตอบแล้ว
          </div>
          <ul className="mt-2 text-xs text-amber-800 font-semibold list-disc pl-5">
            {pending.map((x) => <li key={x.key}>{x.label_th}</li>)}
          </ul>
        </div>
      )}

      {groups.map((g) => (
        <section key={g} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="font-bold text-base text-gray-900">{GROUP[g].title}</div>
            <div className="text-xs text-gray-400">{GROUP[g].desc}</div>
          </div>

          {items.filter((x) => x.group_key === g).map((x) => {
            const isBool = typeof x.value === "boolean" || /by_customer|reset_to_pending|unassign_team|notify_line|refund_quota|consume_quota/.test(x.key);
            return (
              <div key={x.key} className="px-5 py-3 border-t border-gray-100 flex items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                    {x.label_th}
                    {x.pending_biz && x.value === null && (
                      <span className="text-xxs font-bold px-2 rounded-full bg-amber-100 text-amber-700 border border-amber-200">รอ business</span>
                    )}
                    {okKey === x.key && <span className="text-xxs font-bold text-emerald-600">บันทึกแล้ว</span>}
                  </div>
                  {x.note && <div className="text-xs text-gray-400 mt-0.5">{x.note}</div>}
                  <div className="text-xxs text-gray-300 font-mono mt-0.5">{x.key}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isBool ? (
                    <select
                      value={x.value === null ? "" : String(x.value)}
                      disabled={saving === x.key}
                      onChange={(e) => save(x.key, e.target.value === "" ? null : e.target.value === "true")}
                      className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary"
                    >
                      <option value="true">ใช่</option>
                      <option value="false">ไม่</option>
                      {x.pending_biz && <option value="">— ยังไม่กำหนด —</option>}
                    </select>
                  ) : (
                    <>
                      <input
                        type="number" min={0}
                        defaultValue={x.value === null ? "" : String(x.value)}
                        placeholder={x.pending_biz ? "ยังไม่กำหนด" : ""}
                        disabled={saving === x.key}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const cur = x.value === null ? "" : String(x.value);
                          if (v !== cur) save(x.key, v === "" ? null : Number(v));
                        }}
                        className="h-9 w-28 rounded-lg border border-gray-200 px-3 text-sm font-semibold outline-none focus:border-primary"
                      />
                      {UNIT[x.key] && <span className="text-xs text-gray-400 font-semibold">{UNIT[x.key]}</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ))}

      <p className="text-xs text-gray-400 px-1">
        ค่าเหล่านี้มีผลทันทีกับการจอง/เลื่อนนัดทั้งฝั่งแอดมินและ LIFF ลูกค้า — ไม่ต้อง deploy ใหม่
      </p>
    </div>
  );
}
