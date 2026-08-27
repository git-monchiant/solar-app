"use client";

// หน้า "บ้านของฉัน" — LIFF ฝั่งลูกค้า O&M
// CI เฉพาะฝั่ง LIFF (ผู้ใช้เคาะ 26 ส.ค.): โลโก้จริง senasolarenergy.com + teal #009793 + ส้มทอง #DE8F00
// หลายบ้าน = แบบ A ตัวสลับบ้าน (mockup 20260826_04) — คนมีหลังเดียวไม่เห็นตัวสลับ
import { useEffect, useState } from "react";
import { getProfile, liffFetch } from "@/lib/om/liff";

const TEAL = "#009793";
const ORANGE = "#DE8F00";

interface LinkedHouse {
  id: number;
  house_number: string | null;
  project_name: string | null;
  balance: number;
  is_active: boolean;
}

interface MeData {
  linked: boolean;
  identity_status?: string;
  houses?: LinkedHouse[];
  house?: { house_number: string | null; segment: string; unit_status: string | null; project_name: string | null; brand: string | null };
  installation?: {
    inverter_brand: string | null;
    rem_size_kwp: number | null;
    warranty_start: string | null;
    warranty_install_until: string | null;
    warranty_inverter_until: string | null;
    warranty_panel_until: string | null;
  } | null;
  remaining?: number;
  redemptions?: { service_date: string; status: string }[];
}

const TH_DATE = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

function WarrantyRow({ label, years, until }: { label: string; years: number; until: string | null | undefined }) {
  const expired = until ? new Date(until) < new Date() : null;
  return (
    <div className="flex items-center justify-between border-b border-zinc-100 py-3">
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="text-xs font-medium text-zinc-400">{years} ปีนับจากวันเริ่มประกัน</div>
      </div>
      {until == null ? (
        <span className="text-xs font-semibold" style={{ color: ORANGE }}>⚠ ไม่มีวันประกัน</span>
      ) : (
        <div className={`text-sm font-bold ${expired ? "text-red-600" : "text-emerald-600"}`}>
          {expired ? "หมดแล้ว" : "ถึง " + TH_DATE(until)}
        </div>
      )}
    </div>
  );
}

export default function OmLiffMyHome() {
  const [name, setName] = useState("");
  const [me, setMe] = useState<MeData | null>(null);
  const [error, setError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = () =>
    liffFetch("/api/om/liff/me")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || `โหลดไม่สำเร็จ (${r.status})`);
        setMe(await r.json());
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));

  useEffect(() => {
    getProfile().then((p) => setName(p.displayName)).catch(() => {});
    load();
  }, []);

  const switchHouse = async (houseId: number) => {
    if (switching) return;
    setSwitching(true);
    try {
      await liffFetch("/api/om/liff/me", { method: "POST", body: JSON.stringify({ house_id: houseId }) });
      await load();
      setSheetOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSwitching(false);
    }
  };

  const multi = (me?.houses?.length ?? 0) > 1;

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-white text-zinc-900">
      <header className="px-5 pt-6 pb-2">
        {/* โลโก้จริง — เฉพาะฝั่ง LIFF */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/om/sena-solar-logo.svg" alt="SENA Solar Energy" className="h-10 w-auto" />
        <h1 className="mt-5 text-[2.1rem] font-bold leading-[1.05] tracking-tight">บ้านของฉัน</h1>
        {name && <p className="mt-2 text-base font-medium text-zinc-500">สวัสดี {name}</p>}
      </header>

      {error && (
        <div className="mx-5 mt-4 border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>
      )}

      {!me && !error && <div className="px-5 py-16 text-center text-sm font-medium text-zinc-400">กำลังโหลดข้อมูล…</div>}

      {me && !me.linked && (
        <section className="mx-5 mt-6 border border-zinc-200 p-5 text-center">
          <div className="text-lg font-bold">ยังไม่ได้ยืนยันตัวตน</div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-500">
            ผูกบัญชี LINE กับบ้านของคุณเพื่อดูสิทธิ์ล้างแผง ประกัน และประวัติบริการ
          </p>
          <p className="mt-3 text-xs font-medium text-zinc-400">
            (หน้ายืนยันตัวตนด้วยเบอร์โทร + OTP กำลังจะเปิดใช้ — ระหว่างนี้ติดต่อแอดมินทางแชต)
          </p>
        </section>
      )}

      {me?.linked && me.house && (
        <>
          {/* บ้านที่กำลังดู — มีหลายหลังถึงจะกดสลับได้ */}
          <button
            type="button"
            onClick={() => multi && setSheetOpen(true)}
            style={{ minHeight: 0 }}
            className={`mx-5 mt-5 flex items-center gap-3 border border-zinc-200 p-4 text-left transition-colors ${multi ? "cursor-pointer hover:border-[#009793]" : "cursor-default"}`}
          >
            <div className="flex-1 min-w-0">
              {multi && (
                <div className="text-xxs font-medium uppercase tracking-[0.2em] text-zinc-400">
                  บ้านที่กำลังดู · {me.houses!.length} หลัง
                </div>
              )}
              <div className="text-xl font-bold tracking-tight">บ้านเลขที่ {me.house.house_number || "—"}</div>
              <div className="mt-0.5 truncate text-sm font-medium text-zinc-500">
                {me.house.project_name || "—"}
                {me.installation?.rem_size_kwp ? ` · ${me.installation.rem_size_kwp} kWp` : ""}
              </div>
            </div>
            {multi && <div className="shrink-0 text-lg text-zinc-400">▾</div>}
          </button>

          {/* สิทธิ์ล้างแผง */}
          <section className="mx-5 mt-5 flex items-center justify-between border border-zinc-200 p-5">
            <div>
              <div className="text-xxs font-medium uppercase tracking-[0.22em] text-zinc-500">สิทธิ์ล้างแผงคงเหลือ</div>
              <div className="mt-1 text-xs font-medium text-zinc-400">{multi ? "ของบ้านหลังนี้เท่านั้น" : "ใช้ตอนจองนัดล้างแผง"}</div>
            </div>
            <div className="text-right">
              <span className="text-4xl font-bold tracking-tight" style={{ color: TEAL }}>{me.remaining ?? 0}</span>
              <span className="ml-1 text-sm font-medium text-zinc-500">ครั้ง</span>
            </div>
          </section>

          {/* ประกัน 3 รายการ */}
          <section className="mx-5 mt-8">
            <div className="mb-1 text-xxs font-medium uppercase tracking-[0.22em] text-zinc-500">การรับประกัน</div>
            {me.installation?.warranty_start && (
              <div className="mb-2 text-xs font-medium text-zinc-400">เริ่ม {TH_DATE(me.installation.warranty_start)}</div>
            )}
            <div className="border-t border-zinc-200">
              <WarrantyRow label="ประกันติดตั้ง" years={2} until={me.installation?.warranty_install_until} />
              <WarrantyRow label="ประกัน Inverter" years={5} until={me.installation?.warranty_inverter_until} />
              <WarrantyRow label="ประกันแผง" years={10} until={me.installation?.warranty_panel_until} />
            </div>
          </section>

          {/* ประวัติล้างแผง */}
          <section className="mx-5 mt-8 pb-10">
            <div className="mb-1 text-xxs font-medium uppercase tracking-[0.22em] text-zinc-500">ประวัติล้างแผงล่าสุด</div>
            {me.redemptions && me.redemptions.length > 0 ? (
              <div className="border-t border-zinc-200">
                {me.redemptions.map((r, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-100 py-3">
                    <div className="text-sm font-bold">ล้างแผงครั้งที่ {me.redemptions!.length - i}</div>
                    <div className="text-sm font-medium text-zinc-500">{TH_DATE(r.service_date)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-t border-zinc-200 py-4 text-sm font-medium text-zinc-400">ยังไม่มีประวัติ</div>
            )}
          </section>

          {/* bottom sheet เลือกบ้าน */}
          {multi && sheetOpen && (
            <>
              <div className="fixed inset-0 z-40 bg-black/45" onClick={() => setSheetOpen(false)} />
              <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl bg-white pb-6">
                <div className="mx-auto mt-2.5 mb-1 h-1 w-10 rounded-full bg-zinc-200" />
                <div className="px-5 pt-2 text-base font-bold">เลือกบ้าน</div>
                <div className="px-5 pb-2 text-xs font-medium text-zinc-500">สิทธิ์และประกันแยกรายหลัง</div>
                {me.houses!.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    disabled={switching}
                    onClick={() => switchHouse(h.id)}
                    style={{ minHeight: 0 }}
                    className="flex w-full items-center gap-3 border-t border-zinc-100 px-5 py-3.5 text-left hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg"
                      style={h.is_active ? { borderColor: TEAL, background: "#f0fdfa" } : { borderColor: "#e4e4e7" }}
                    >
                      🏠
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold">{h.house_number || "—"}</div>
                      <div className="truncate text-xs font-medium text-zinc-500">{h.project_name || "—"}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      {h.is_active && <div className="text-base font-bold" style={{ color: TEAL }}>✓</div>}
                      <div className="text-xs font-bold" style={{ color: h.balance > 0 ? ORANGE : "#a1a1aa" }}>
                        {h.balance > 0 ? `เหลือ ${h.balance} ครั้ง` : "สิทธิ์หมด"}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
