"use client";

// หน้ารายละเอียดงานบริการของบ้าน 1 หลัง (เฟส 3 แผน 20260922-01)
// ★ ย้ายออกจาก om/services/page.tsx มาเป็นไฟล์ของตัวเอง เพราะตอนนี้มี URL จริงแล้ว
//   (/om/services/[house]) หน้ารายการกับ route ใหม่ต้อง import ตัวเดียวกัน
// ★ ประวัติรับมาทาง prop — หน้าเป็นคนโหลดพร้อมข้อมูลบ้านในคำขอเดียว
//   เดิมยิง /api/om/bookings/[id] แยกอีกรอบ และได้เฉพาะงานที่มีใบงานแล้ว
//   บ้านที่เพิ่งโทร (ยังไม่มีใบงาน) จึงไม่เห็นประวัติตัวเองเลย

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CALL_OUTCOME } from "@/lib/om/booking";
import Timeline from "@/components/ui/Timeline";
import JobHistoryItem from "@/components/om/JobHistoryItem";
import JobFormPanel from "@/components/om/JobFormPanel";
import AssignOwnerButton from "@/components/lead/AssignOwnerButton";
import {
  BUCKET_LABEL, FLOW, TONE, thD, thDT,
  type HistoryRow, type Item, type Team,
} from "@/lib/om/service-view";

export default function JobDetail({ item, history, onBack, onSaved, onReload }: {
  item: Item;
  /** ประวัติของบ้านหลังนี้ — หน้าเรียกใช้เป็นคนโหลด (มาพร้อม /api/om/follow?house=) */
  history: HistoryRow[];
  onBack: () => void;
  onSaved: (m: string) => void;
  /** โหลดข้อมูลบ้านใหม่โดยไม่ออกจากหน้า (ใช้ตอนเปลี่ยนเจ้าของงาน) */
  onReload?: () => void;
}) {
  const cur = item.job_status ?? "follow";
  const [step, setStep] = useState(Math.max(0, FLOW.findIndex((f) => f.k === cur)));
  const [outcome, setOutcome] = useState<string>("agreed");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/api/om/teams").then((d) => setTeams(d.teams ?? [])).catch(() => {});
  }, []);

  const saveCall = async () => {
    if (outcome === "agreed" && !when) { setErr("ตกลงนัดแล้วต้องระบุวันและเวลา"); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch("/api/om/follow", {
        method: "POST",
        body: JSON.stringify({
          house_id: item.house_id, booking_id: item.booking_id, outcome,
          note: note || null, next_date: nextDate || null,
          scheduled_at: outcome === "agreed" ? when : null,
          phone: item.phone,
        }),
      });
      onSaved("บันทึกการโทรแล้ว"); onBack();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const patchJob = async (patch: Record<string, unknown>, msg: string) => {
    if (!item.booking_id) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/bookings/${item.booking_id}`, { method: "PATCH", body: JSON.stringify(patch) });
      onSaved(msg); onBack();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="border-b border-gray-200 px-5 py-2.5 flex items-start gap-3 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-bold leading-tight">{item.house_number} — {item.customer_name || "ไม่มีชื่อในฐาน"}</h1>
            <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold ${TONE[item.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[item.bucket] ?? item.bucket}</span>
            {item.team_name ? <span className="text-xxs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">ทีม {item.team_name}</span>
              : item.booking_id && <span className="text-xxs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">⚠ ยังไม่จ่ายทีม</span>}
          </div>
          <div className="flex gap-3 flex-wrap text-xs text-gray-500 mt-0.5">
            <span>{item.project_name}</span>
            <span className="tabular-nums">☎ {item.phone || "ไม่มีเบอร์"}</span>
            <span>สิทธิ์เหลือ <b className="text-gray-800">{Math.max(0, item.balance)}</b> ครั้ง</span>
            <span>{item.last_wash ? <>ล้างล่าสุด <b className="text-gray-800">{thD(item.last_wash)}</b></> : <b className="text-amber-600">ยังไม่เคยล้าง</b>}</span>
            {item.booking_id && <span>ใบงาน #{item.booking_id}</span>}
          </div>
        </div>
        {/* เจ้าของเคส (เฟส 4) — ปุ่มตัวเดียวกับฝั่งขาย ต่างแค่ endpoint ที่บันทึกกับ role ที่ดึงมาเลือก
            ★ ว่างไว้ได้ ไม่ใช่ประตูล็อก — ใครเปิดหน้านี้ก็ยังทำงานต่อได้ (ผู้ใช้เคาะ 10 ก.ย.)
            มีไว้ให้หน้า Today ตอบได้ว่า "งาน O&M ของฉัน" คืออะไร */}
        {item.booking_id && (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xxs text-gray-500 whitespace-nowrap">เจ้าของงาน</span>
            <AssignOwnerButton
              size="md"
              usersRole="solar"
              title="เจ้าของงานบริการ"
              assignedUserId={item.owner_user_id}
              assignedName={item.owner_name}
              onAssign={async (userId) => {
                await apiFetch(`/api/om/bookings/${item.booking_id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ owner_user_id: userId }),
                });
              }}
              onChanged={onReload}
            />
          </div>
        )}
        <button type="button" onClick={onBack} style={{ minHeight: 0 }}
          className="h-8 px-3.5 rounded-full border border-gray-200 text-xs font-bold text-gray-700 bg-white cursor-pointer">‹ กลับรายการ</button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-20 border-r border-gray-200 bg-gray-50 p-2 flex flex-col gap-1.5 shrink-0 overflow-y-auto">
          <div className="text-xxs text-gray-400 text-center font-bold tracking-widest">STEPS</div>
          {FLOW.map((f, i) => {
            const at = Math.max(0, FLOW.findIndex((x) => x.k === cur));
            const cls = i === step ? "bg-active text-white" : i < at ? "text-green-700" : i === at ? "text-gray-700" : "text-gray-400";
            return (
              <button key={f.k} type="button" onClick={() => setStep(i)} style={{ minHeight: 0 }}
                className={`w-full py-1.5 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer ${cls}`}>
                <span className="text-sm font-bold leading-none">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-xxs leading-tight text-center">{f.t}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {err && <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}

          {step === 0 && (
            <div className="max-w-[880px] rounded-2xl border-2 border-active bg-active-light p-4">
              <div className="text-xxs font-bold tracking-widest text-active-dark">STEP 01 · O&amp;M</div>
              <div className="text-base font-bold mb-3">ติดตาม — บันทึกการโทร</div>

              <div className="rounded-xl bg-white p-3.5">
                <div className="text-sm font-bold mb-2">ผลการโทรครั้งนี้ <span className="text-danger">*</span></div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {Object.entries(CALL_OUTCOME).map(([k, v]) => (
                    <button key={k} type="button" style={{ minHeight: 0 }} onClick={() => setOutcome(k)}
                      className={`px-3.5 py-1.5 rounded-xl border text-sm font-bold cursor-pointer ${outcome === k ? "border-active bg-active-light text-active-dark" : "border-gray-200 bg-white text-gray-700"}`}>
                      {v.t}
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {outcome === "agreed" && (
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-gray-600">วันและเวลานัด <span className="text-danger">*</span></span>
                      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                        className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary" />
                    </label>
                  )}
                  {(outcome === "postponed" || outcome === "no_answer") && (
                    <label className="grid gap-1">
                      <span className="text-xs font-bold text-gray-600">นัดโทรใหม่</span>
                      <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)}
                        className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary" />
                      <span className="text-xxs text-gray-400">ไม่ใส่ = ระบบตั้งให้ตามกติกาในหน้าตั้งค่า</span>
                    </label>
                  )}
                  <label className="grid gap-1">
                    <span className="text-xs font-bold text-gray-600">โน้ต</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ลูกค้าไม่อยู่บ้านช่วงเช้า"
                      className="h-9 rounded-lg border border-gray-200 px-2.5 text-sm outline-none focus:border-primary" />
                  </label>
                </div>

                <div className="mt-3 rounded-xl bg-gray-50 border border-gray-200 px-3.5 py-2.5 text-xs leading-relaxed text-gray-600">
                  {outcome === "agreed" && <>กดบันทึกแล้ว <b>สร้างใบงาน</b> ขั้น <b>ทำนัด</b> พร้อมวันเวลาที่เลือก การ์ดจะย้ายออกจากแท็บติดตาม</>}
                  {outcome === "postponed" && <>สร้างใบงานขั้น <b>ติดตาม</b> พร้อมวันนัดโทรใหม่ ยังอยู่แท็บเดิมแต่จะไม่โผล่ซ้ำจนถึงวันนัด</>}
                  {outcome === "no_answer" && <><b>ไม่สร้างใบงาน</b> บันทึกประวัติอย่างเดียว · ครบจำนวนครั้งที่ตั้งไว้จะย้ายไปแท็บติดต่อไม่ได้</>}
                  {outcome === "declined" && <><b>ไม่สร้างใบงาน</b> ย้ายไปแท็บไม่เอา · <b>สิทธิ์ไม่ถูกตัด</b> ยังใช้ได้ถ้าเปลี่ยนใจ</>}
                  {outcome === "wrong_number" && <>ทำเครื่องหมายเบอร์นี้ว่า <b>ใช้ไม่ได้</b> ถ้าไม่เหลือเบอร์อื่นจะตกไปแท็บติดต่อไม่ได้</>}
                </div>

                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy} onClick={saveCall} style={{ minHeight: 0 }}
                    className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">
                    {busy ? "กำลังบันทึก…" : "บันทึกการโทร"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <StepBox n="02" t="ทำนัด — รอลูกค้ายืนยัน">
              {item.scheduled_at ? (
                <>
                  <div className="text-sm mb-3">นัดไว้ <b>{thDT(item.scheduled_at)}</b></div>
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" disabled={busy || !item.booking_id} style={{ minHeight: 0 }}
                      onClick={() => patchJob({ status: "confirmed" }, "ยืนยันนัดแล้ว")}
                      className="h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">ลูกค้ายืนยันแล้ว</button>
                    <button type="button" disabled={busy || !item.booking_id} style={{ minHeight: 0 }}
                      onClick={() => patchJob({ status: "follow" }, "ย้ายกลับไปติดตาม")}
                      className="h-9 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 bg-white cursor-pointer">กลับไปติดตาม</button>
                  </div>
                </>
              ) : <div className="text-sm text-gray-500">ยังไม่มีวันนัด — กลับไปขั้นติดตามเพื่อบันทึกการโทร</div>}
            </StepBox>
          )}

          {step === 2 && (
            <StepBox n="03" t="รอ O&M — จ่ายทีมช่าง">
              <div className="text-sm text-gray-600 mb-2">ปกติจ่ายงานด้วยการลากวางในปฏิทิน ตรงนี้เป็นทางลัดสำหรับงานเดี่ยว</div>
              <div className="flex gap-2 flex-wrap">
                {teams.map((t) => (
                  <button key={t.id} type="button" disabled={busy || !item.booking_id} style={{ minHeight: 0 }}
                    onClick={() => patchJob({ team_id: t.id }, `จ่ายงานให้ทีม ${t.name} แล้ว`)}
                    className={`h-9 px-4 rounded-xl border text-sm font-bold cursor-pointer ${item.team_id === t.id ? "border-active bg-active-light text-active-dark" : "border-gray-200 bg-white text-gray-700"}`}>
                    ทีม {t.name} <span className="font-normal text-gray-400">· ค้าง {t.open_jobs}</span>
                  </button>
                ))}
                {!teams.length && <span className="text-sm text-gray-400">ยังไม่มีทีมช่างในระบบ</span>}
              </div>
              {item.team_id && (
                <button type="button" disabled={busy} style={{ minHeight: 0 }}
                  onClick={() => patchJob({ status: "progress" }, "เริ่มงานแล้ว")}
                  className="mt-3 h-9 px-5 rounded-xl bg-primary text-white text-sm font-bold cursor-pointer disabled:opacity-50">ช่างถึงหน้างานแล้ว</button>
              )}
            </StepBox>
          )}

          {step === 3 && (
            <StepBox n="04" t="เข้า O&M — ช่างทำงานหน้างาน">
              {item.booking_id ? (
                <>
                  {/* ★ เฟส 3: ใบตรวจรับงานฝังมาเลย ไม่ต้องเด้งออกไปหน้าอื่นแล้ว
                      ใบเดียวกับ /om/field/[id] เป๊ะ (components/om/JobFormPanel) แก้ที่เดียวได้ทั้งสองที่
                      wrapClass ตัด h-full/overflow ทิ้ง กันเกิด scroll ซ้อนในกล่องนี้ */}
                  <div className="text-sm text-gray-600 mb-3">
                    ช่างกรอกจากหน้าช่างบนมือถือได้เหมือนเดิม · ตรงนี้คือใบเดียวกัน
                    <a href={`/om/field/${item.booking_id}`}
                      className="ml-2 text-primary font-bold no-underline hover:underline">เปิดเต็มจอ ›</a>
                  </div>
                  <div className="-mx-3.5 -mb-3.5 rounded-b-xl overflow-hidden">
                    <JobFormPanel jobId={String(item.booking_id)} wrapClass="bg-gray-50" embedded />
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">ยังไม่มีใบงาน — ใบตรวจรับงานจะขึ้นเมื่อสร้างนัดแล้ว</div>
              )}
            </StepBox>
          )}

          {step === 4 && (
            <StepBox n="05" t="ปิดงาน">
              <div className="text-sm text-gray-600">
                ปิดงานทำที่หน้าช่าง หลังลูกค้าเซ็นรับหรือยืนยันทาง LINE ·
                ปิดแล้วระบบจะ<b>ตัดสิทธิ์ล้าง 1 ครั้ง</b> เหลือ {Math.max(0, item.balance - 1)} ครั้ง
              </div>
            </StepBox>
          )}

          {/* ไทม์ไลน์ประวัติ — เปลือกกลาง ui/Timeline ตัวเดียวกับหน้า lead ของฝั่งขาย
              เดิมเป็นรายการแบนไม่จัดกลุ่มวัน และตัดข้อความยาวทิ้งด้วย truncate */}
          <div className="mt-5 max-w-[880px]">
            <div className="text-xs font-bold tracking-widest text-gray-500 uppercase mb-2">ประวัติบ้านหลังนี้</div>
            <Timeline
              items={history}
              renderItem={(h, isLast) => <JobHistoryItem h={h} isLast={isLast} />}
              labels={{ today: "วันนี้", yesterday: "เมื่อวาน", locale: "th-TH",
                        empty: "ยังไม่มีประวัติ", emptyHint: "บันทึกการโทรหรือสร้างนัดแล้วจะขึ้นที่นี่" }}
              className="px-0 py-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepBox({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[880px] rounded-2xl border-2 border-active bg-active-light p-4">
      <div className="text-xxs font-bold tracking-widest text-active-dark">STEP {n} · O&amp;M</div>
      <div className="text-base font-bold mb-3">{t}</div>
      <div className="rounded-xl bg-white p-3.5">{children}</div>
    </div>
  );
}
