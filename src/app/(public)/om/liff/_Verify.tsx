"use client";
// ยืนยันตัวตนในหน้า MyHome — เข้ามาไม่เจอบ้านก็ยืนยันได้เลย (ไม่แยก LIFF ต่างหาก)
// ลูกค้าไม่ได้เลือกบ้านเอง: ระบบหาจากทะเบียนด้วยเบอร์ แล้วให้ยืนยันทีละหลังว่าใช่ของตนไหม
import { useEffect, useState } from "react";
import { liffFetch } from "@/lib/om/liff";

const TEAL = "#009793";
interface House { id: number; house_number: string | null; project_name: string | null }

export default function Verify({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"phone" | "otp" | "houses" | "queued">("phone");
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [houses, setHouses] = useState<House[]>([]);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [cool, setCool] = useState(0);

  useEffect(() => {
    if (cool <= 0) return;
    const t = setTimeout(() => setCool((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cool]);

  const call = async (body: Record<string, unknown>) => {
    const r = await liffFetch("/api/om/liff/verify", { method: "POST", body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "ทำรายการไม่สำเร็จ");
    return j;
  };

  const askCode = async () => {
    setErr(""); setBusy(true);
    try {
      const j = await call({ step: "request", phone });
      if (!j.found) { setStep("queued"); return; }   // เบอร์ไม่อยู่ในทะเบียน → คิวเจ้าหน้าที่
      setRef(j.ref); setDevCode(j.dev_code ?? null); setCode(""); setCool(60); setStep("otp");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const submitCode = async () => {
    setErr(""); setBusy(true);
    try {
      const j = await call({ step: "confirm", ref, code });
      setHouses(j.houses || []);
      setAnswers({});
      setStep("houses");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setErr(""); setBusy(true);
    try {
      await call({
        step: "link", ref,
        house_ids: houses.filter((h) => answers[h.id] === true).map((h) => h.id),
        rejected_ids: houses.filter((h) => answers[h.id] === false).map((h) => h.id),
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const allAnswered = houses.length > 0 && houses.every((h) => answers[h.id] !== undefined);
  const nYes = houses.filter((h) => answers[h.id] === true).length;

  return (
    <section className="mx-5 mt-6 border border-zinc-200 p-5">
      {err && <div className="mb-3 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{err}</div>}

      {step === "phone" && (
        <>
          <div className="text-lg font-bold">ยืนยันตัวตน</div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-500">
            กรอกเบอร์โทรที่ให้ไว้กับโครงการ ระบบจะส่งรหัส SMS ไปตรวจสอบว่าเป็นคุณจริง
          </p>
          <input value={phone} inputMode="tel" maxLength={10} placeholder="08x-xxx-xxxx"
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            className="mt-4 w-full border border-zinc-200 px-4 py-3 text-base font-semibold outline-none focus:border-[#009793]" />
          <button type="button" onClick={askCode} disabled={busy || phone.length < 10} style={{ minHeight: 0, background: TEAL }}
            className="mt-3 w-full py-3 text-base font-bold text-white disabled:opacity-40">
            ส่งรหัสยืนยัน
          </button>
          <p className="mt-3 text-xs font-medium leading-relaxed text-zinc-400">
            หากเปลี่ยนเบอร์แล้ว ระบบจะส่งเรื่องให้เจ้าหน้าที่ตรวจสอบให้
          </p>
        </>
      )}

      {step === "otp" && (
        <>
          <button type="button" onClick={() => setStep("phone")} style={{ minHeight: 0 }}
            className="text-sm font-bold text-zinc-500">← เปลี่ยนเบอร์</button>
          <div className="mt-2 text-lg font-bold">กรอกรหัส 6 หลัก</div>
          <p className="mt-1 text-sm font-medium text-zinc-500">
            ส่งไปที่ {phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")} · Ref: <span className="font-mono">{ref}</span>
          </p>
          {devCode && (
            <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              โหมดทดสอบ — รหัสคือ <span className="font-mono">{devCode}</span> (ของจริงจะส่งทาง SMS)
            </div>
          )}
          <input value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="——————"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="mt-3 w-full border border-zinc-200 py-3 text-center text-2xl font-semibold tracking-[0.4em] outline-none focus:border-[#009793]" />
          <button type="button" onClick={submitCode} disabled={busy || code.length < 6} style={{ minHeight: 0, background: TEAL }}
            className="mt-3 w-full py-3 text-base font-bold text-white disabled:opacity-40">ยืนยัน</button>
          <button type="button" onClick={askCode} disabled={busy || cool > 0} style={{ minHeight: 0 }}
            className="mt-2 w-full border border-zinc-200 py-2.5 text-sm font-bold text-zinc-500 disabled:opacity-40">
            {cool > 0 ? `ขอรหัสใหม่ได้ใน ${cool} วิ` : "ขอรหัสใหม่"}
          </button>
        </>
      )}

      {step === "houses" && (
        <>
          <div className="text-lg font-bold">พบบ้านในทะเบียน {houses.length} หลัง</div>
          <p className="mt-1 text-sm font-medium text-zinc-500">ตรวจสอบทีละหลัง — ใช่บ้านของคุณไหม?</p>
          <div className="mt-3 border-t border-zinc-200">
            {houses.map((h) => (
              <div key={h.id} className={`flex items-center gap-3 border-b border-zinc-100 py-3 ${answers[h.id] === false ? "opacity-50" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className={`text-base font-bold ${answers[h.id] === false ? "line-through" : ""}`}>{h.house_number || "—"}</div>
                  <div className="truncate text-xs font-medium text-zinc-500">{h.project_name || "—"}</div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => setAnswers({ ...answers, [h.id]: true })} style={{ minHeight: 0, ...(answers[h.id] === true ? { background: TEAL, borderColor: TEAL, color: "#fff" } : {}) }}
                    className="border border-zinc-200 px-3 py-1.5 text-sm font-bold text-zinc-500">✓ ใช่</button>
                  <button type="button" onClick={() => setAnswers({ ...answers, [h.id]: false })} style={{ minHeight: 0 }}
                    className={`border px-3 py-1.5 text-sm font-bold ${answers[h.id] === false ? "border-red-600 bg-red-600 text-white" : "border-zinc-200 text-zinc-500"}`}>ไม่ใช่</button>
                </div>
              </div>
            ))}
          </div>
          {houses.some((h) => answers[h.id] === false) && (
            <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              หลังที่ตอบ &quot;ไม่ใช่&quot; จะไม่ถูกผูกกับบัญชี และส่งให้เจ้าหน้าที่ตรวจสอบทะเบียน
            </div>
          )}
          <button type="button" onClick={finish} disabled={busy || !allAnswered} style={{ minHeight: 0, background: TEAL }}
            className="mt-3 w-full py-3 text-base font-bold text-white disabled:opacity-40">
            {!allAnswered ? "ตอบให้ครบทุกหลังก่อน" : nYes > 0 ? `ยืนยัน — บ้านของฉัน ${nYes} หลัง` : "ยืนยัน — ไม่มีบ้านของฉันเลย"}
          </button>
        </>
      )}

      {step === "queued" && (
        <div className="py-4 text-center">
          <div className="text-3xl">🕐</div>
          <div className="mt-2 text-lg font-bold">ส่งเรื่องให้เจ้าหน้าที่แล้ว</div>
          <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-500">
            เบอร์นี้ยังไม่อยู่ในทะเบียน อาจเพราะเพิ่งเปลี่ยนเบอร์หรือซื้อบ้านต่อจากเจ้าของเดิม<br />
            เจ้าหน้าที่จะตรวจสอบและติดต่อกลับ
          </p>
          <button type="button" onClick={() => { setStep("phone"); setErr(""); }} style={{ minHeight: 0 }}
            className="mt-4 w-full border border-zinc-200 py-2.5 text-sm font-bold text-zinc-500">ลองเบอร์อื่น</button>
        </div>
      )}
    </section>
  );
}
