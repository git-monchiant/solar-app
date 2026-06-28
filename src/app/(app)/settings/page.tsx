"use client";
import { CheckIcon, DocumentIcon } from "@/components/ui/icons";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import { useFileViewer } from "@/lib/hooks/useFileViewer";

type Settings = Record<string, string>;

const DOC_TYPES: { key: string; label: string; description: string; defaultPrefix: string }[] = [
  { key: "booking", label: "ใบจองคิว", description: "เกิดเมื่อยืนยัน Pre-Survey + จ่ายเงินจอง", defaultPrefix: "SM" },
  { key: "quotation", label: "ใบเสนอราคา", description: "ออกหลังเสร็จ Survey", defaultPrefix: "QT" },
  { key: "survey", label: "ใบสำรวจ", description: "เอกสารสำรวจหน้างาน", defaultPrefix: "SV" },
  { key: "warranty", label: "ใบรับประกัน", description: "ออกเมื่อจบงานติดตั้ง", defaultPrefix: "SSE" },
  { key: "receipt", label: "ใบเสร็จอย่างย่อ", description: "ใบรับเงินมัดจำ/งวด", defaultPrefix: "RC" },
];

type Tab = "running_numbers" | "warranty_signer" | "gmail" | "customer_docs" | "channels";

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("running_numbers");

  const logout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      localStorage.removeItem("activeRoles");
      window.location.href = "/login";
      return;
    }
    router.replace("/login");
  };

  return (
    <div>
      <Header
        title="Settings"
        subtitle="APP CONFIGURATION"
        rightContent={
          <button
            type="button"
            onClick={logout}
            className="h-9 px-4 rounded-lg text-xs font-semibold text-red-600 border border-red-200 bg-white/80 backdrop-blur hover:bg-red-50 transition-colors shrink-0"
          >
            ออกจากระบบ
          </button>
        }
      />

      <div className="p-4 md:p-6">
        <div className="border-b border-gray-200 mb-4 -mx-4 md:mx-0 px-4 md:px-0">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            <TabBtn active={tab === "running_numbers"} onClick={() => setTab("running_numbers")} label="เลขเอกสาร" />
            <TabBtn active={tab === "warranty_signer"} onClick={() => setTab("warranty_signer")} label="ผู้ลงนามใบรับประกัน" />
            <TabBtn active={tab === "customer_docs"} onClick={() => setTab("customer_docs")} label="เอกสารลูกค้า" />
            <TabBtn active={tab === "channels"} onClick={() => setTab("channels")} label="ช่องทางติดต่อ" />
            <TabBtn active={tab === "gmail"} onClick={() => setTab("gmail")} label="Gmail" />
          </div>
        </div>

        {tab === "running_numbers" && <RunningNumbersSection />}
        {tab === "warranty_signer" && <WarrantySignerSection />}
        {tab === "customer_docs" && <CustomerDocsSection />}
        {tab === "channels" && <ChannelsSection />}
        {tab === "gmail" && <GmailSection />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${active ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-gray-800"}`}
    >
      {label}
    </button>
  );
}

type GmailStatus = { connected: boolean; email: string | null; connected_at: string | null };

function GmailSection() {
  const [status, setStatus] = useState<GmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    apiFetch("/api/oauth/gmail/status").then(setStatus).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await apiFetch("/api/oauth/gmail/start") as { url: string };
      window.location.href = url;
    } catch (e) {
      console.error(e);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("ตัดการเชื่อม Gmail?")) return;
    setBusy(true);
    try {
      await apiFetch("/api/oauth/gmail/status", { method: "DELETE" });
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Gmail Integration</h2>
        <p className="text-xs text-gray-500 mt-0.5">เชื่อม Gmail บริษัทเพื่อดึง lead registration อัตโนมัติ (read-only)</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="p-5">
          {status?.connected ? (
            <ConnectedView status={status} busy={busy} setBusy={setBusy} onDisconnect={disconnect} />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500">ยังไม่ได้เชื่อม Gmail</div>
              <button type="button" onClick={connect} disabled={busy}
                className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
                {busy ? "กำลังเปิด..." : "เชื่อม Gmail"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ConnectedView({ status, busy, setBusy, onDisconnect }: {
  status: GmailStatus;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDisconnect: () => void;
}) {
  const [result, setResult] = useState<{ imported: number; skipped: number; scanned: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sync = async () => {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await apiFetch("/api/oauth/gmail/sync", { method: "POST" }) as { imported: number; skipped: number; scanned: number };
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckIcon className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">{status.email}</div>
            <div className="text-xs text-gray-500">
              เชื่อมเมื่อ {status.connected_at ? new Date(status.connected_at).toLocaleString("th-TH") : "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:shrink-0">
          <button type="button" onClick={sync} disabled={busy}
            className="flex-1 md:flex-none h-9 px-4 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
            {busy ? "กำลัง sync..." : "Sync ตอนนี้"}
          </button>
          <button type="button" onClick={onDisconnect} disabled={busy}
            className="h-9 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
            ตัด
          </button>
        </div>
      </div>
      {result && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          ✓ Sync สำเร็จ — สแกน {result.scanned} ฉบับ, เพิ่ม lead ใหม่ {result.imported}, ข้าม (มีแล้ว) {result.skipped}
        </div>
      )}
      {err && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>
      )}
    </div>
  );
}

function RunningNumbersSection() {
  const [settings, setSettings] = useState<Settings>({});
  const [drafts, setDrafts] = useState<Record<string, { prefix: string; digits: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      const d: Record<string, { prefix: string; digits: number }> = {};
      for (const t of DOC_TYPES) {
        d[t.key] = {
          prefix: s[`doc_prefix_${t.key}`] || t.defaultPrefix,
          digits: parseInt(s[`doc_digits_${t.key}`] || "3"),
        };
      }
      setDrafts(d);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const update = (key: string, patch: Partial<{ prefix: string; digits: number }>) => {
    setDrafts(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const dirty = DOC_TYPES.some(t => {
    const cur = drafts[t.key];
    if (!cur) return false;
    const savedPrefix = settings[`doc_prefix_${t.key}`] || t.defaultPrefix;
    const savedDigits = parseInt(settings[`doc_digits_${t.key}`] || "3");
    return cur.prefix !== savedPrefix || cur.digits !== savedDigits;
  });

  const save = async () => {
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const t of DOC_TYPES) {
        const cur = drafts[t.key];
        if (!cur) continue;
        payload[`doc_prefix_${t.key}`] = cur.prefix.trim() || t.defaultPrefix;
        payload[`doc_digits_${t.key}`] = String(cur.digits);
      }
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(prev => ({ ...prev, ...payload }));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const yy = new Date().getFullYear().toString().slice(-2);
  const preview = (prefix: string, digits: number) => `${prefix}-${yy}${"1".padStart(digits, "0")}`;

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">เลขเอกสารอัตโนมัติ</h2>
          <p className="text-xs text-gray-500 mt-0.5">รูปแบบ: <span className="font-mono">PREFIX-YY{"NNN..."}</span> (รีเซ็ตเลขทุกปี)</p>
        </div>
        {savedAt && <span className="text-xs font-semibold text-emerald-600">✓ บันทึกแล้ว</span>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100">
            {DOC_TYPES.map(t => {
              const cur = drafts[t.key] || { prefix: t.defaultPrefix, digits: 3 };
              return (
                <div key={t.key} className="px-5 py-4 grid grid-cols-1 md:grid-cols-[1fr,140px,120px,1fr] gap-3 md:gap-4 md:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{t.label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                  </div>
                  <div>
                    <label className="text-xxs font-bold uppercase tracking-wider text-gray-400 block mb-1 md:hidden">Prefix</label>
                    <input type="text" value={cur.prefix}
                      onChange={e => update(t.key, { prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })}
                      placeholder={t.defaultPrefix}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tracking-wider focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-xxs font-bold uppercase tracking-wider text-gray-400 block mb-1 md:hidden">Digits</label>
                    <select value={cur.digits} onChange={e => update(t.key, { digits: parseInt(e.target.value) })}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary">
                      <option value={3}>3 หลัก</option>
                      <option value={4}>4 หลัก</option>
                      <option value={5}>5 หลัก</option>
                    </select>
                  </div>
                  <div className="text-xs text-gray-500 md:text-right">
                    <span className="md:hidden text-xxs font-bold uppercase tracking-wider text-gray-400 mr-1">ตัวอย่าง</span>
                    <span className="font-mono text-sm font-semibold text-gray-700">{preview(cur.prefix || t.defaultPrefix, cur.digits)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3">
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            {!dirty && <span className="text-xs text-gray-400">— ไม่มีการเปลี่ยนแปลง</span>}
          </div>
        </>
      )}
    </section>
  );
}

// Pick the default signer that warranty certificates print under. Saved as
// app_settings.warranty_signer_user_id; the warranty data route reads it as
// the default when no per-lead warranty_issued_by is set.
type UserOpt = { id: number; full_name: string; has_signature: 0 | 1 | boolean };

function WarrantySignerSection() {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [original, setOriginal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/users") as Promise<UserOpt[]>,
      apiFetch("/api/settings") as Promise<Settings>,
    ])
      .then(([userList, settings]) => {
        // Filter to users whose signature blob lives in users.signature_data
        // (the canonical store). The /api/users response exposes a boolean
        // has_signature so we don't have to fetch each blob.
        setUsers(userList.filter(u => !!u.has_signature));
        const id = settings.warranty_signer_user_id ? parseInt(settings.warranty_signer_user_id) : null;
        setCurrent(id);
        setOriginal(id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const dirty = current !== original;

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warranty_signer_user_id: current === null ? "" : String(current) }),
      });
      setOriginal(current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">ผู้ลงนามใบรับประกัน</h2>
        <p className="text-xs text-gray-500 mt-1">ตั้งค่า user เริ่มต้นที่ชื่อ + ลายเซ็นจะปรากฏบนใบรับประกันทุกฉบับ — ใช้แทน lead.warranty_issued_by ที่ยังไม่ถูกกำหนด</p>
      </div>
      {loading ? (
        <div className="p-5 text-sm text-gray-500">กำลังโหลด...</div>
      ) : (
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">User ที่จะลงนาม</label>
            <select
              value={current ?? ""}
              onChange={(e) => setCurrent(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
            >
              <option value="">— ไม่ระบุ (ใช้ผู้ที่กดออกใบ หรือเจ้าของ lead) —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
            {users.length === 0 && (
              <div className="text-xs text-amber-700 mt-2">
                ยังไม่มี user ที่อัพโหลดลายเซ็นในระบบ — ให้ user ไปที่หน้า Profile → ลายเซ็น ก่อน
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            {!dirty && <span className="text-xs text-gray-400">— ไม่มีการเปลี่ยนแปลง</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// Feature toggle for the SMS + LINE outbound channels. Defaults:
//   sms_enabled  — OFF (must be explicitly turned on)
//   line_enabled — ON  (missing/anything-but-"0" allows; dev sets "0" to kill
//                       outbound sends so testers can't push to real customers)
function ChannelsSection() {
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsOriginal, setSmsOriginal] = useState(false);
  const [lineEnabled, setLineEnabled] = useState(true);
  const [lineOriginal, setLineOriginal] = useState(true);
  // True when LINE_ENABLED=false in the deployment's env. UI greys out the
  // checkbox so it's obvious nothing can be flipped from here.
  const [lineEnvLocked, setLineEnvLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      const sms = s.sms_enabled === "1";
      setSmsEnabled(sms); setSmsOriginal(sms);
      const envLocked = s.__env_line_locked === "1";
      setLineEnvLocked(envLocked);
      // LINE: default true unless explicitly "0" (mirrors the API gate so the
      // UI matches what the backend actually does). When env-locked, force the
      // UI state to false regardless of DB so it doesn't lie about what'll send.
      const line = !envLocked && s.line_enabled !== "0";
      setLineEnabled(line); setLineOriginal(line);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const dirty = smsEnabled !== smsOriginal || lineEnabled !== lineOriginal;
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sms_enabled: smsEnabled ? "1" : "0",
          line_enabled: lineEnabled ? "1" : "0",
        }),
      });
      setSmsOriginal(smsEnabled);
      setLineOriginal(lineEnabled);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">ช่องทางติดต่อลูกค้า</h2>
        <p className="text-xs text-gray-500 mt-1">เปิด/ปิดช่องทางการติดตามลูกค้าทั้งระบบ — ปิดแล้วปุ่มจะไม่ขึ้นในหน้า follow-up</p>
      </div>
      {loading ? (
        <div className="p-5 text-sm text-gray-500">กำลังโหลด...</div>
      ) : (
        <div className="p-5 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={smsEnabled}
              onChange={(e) => setSmsEnabled(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-primary"
            />
            <div>
              <div className="text-sm font-semibold text-gray-900">เปิดใช้งาน SMS</div>
              <div className="text-xs text-gray-500 mt-0.5">ถ้าปิด: ปุ่ม SMS จะหายไปจากหน้า follow-up + API ส่งจะถูก block</div>
            </div>
          </label>
          <label className={`flex items-start gap-3 ${lineEnvLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
            <input
              type="checkbox"
              checked={lineEnabled}
              disabled={lineEnvLocked}
              onChange={(e) => setLineEnabled(e.target.checked)}
              className="w-5 h-5 mt-0.5 accent-primary"
            />
            <div>
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                เปิดใช้งาน LINE
                {lineEnvLocked && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-100 text-red-700">LOCKED BY ENV</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {lineEnvLocked
                  ? "deploy นี้ถูก hard-disable ด้วย LINE_ENABLED=false — เปิดไม่ได้จากที่นี่"
                  : "ถ้าปิด: API ส่ง LINE ถูก block — ใช้บน dev เพื่อกันส่งผิดไปลูกค้าจริง"}
              </div>
            </div>
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={saving || !dirty}
              className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            {!dirty && <span className="text-xs text-gray-400">— ไม่มีการเปลี่ยนแปลง</span>}
          </div>
        </div>
      )}
    </section>
  );
}

// PDF checklist ที่ลูกค้าต้องเตรียมก่อนขอขนานไฟ (กับ MEA/PEA). อัพโหลดที่นี่ครั้งเดียว
// ใช้ได้ทุก lead — ส่ง URL เก็บไว้ที่ app_settings.customer_checklist_pdf_url.
// step ไหนที่ download — รอ user บอก (จะใส่ลิงก์ลง step นั้นภายหลัง)
function CustomerDocsSection() {
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileViewer = useFileViewer();

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setUrl(s.customer_checklist_pdf_url || null);
      setName(s.customer_checklist_pdf_name || null);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (file.type !== "application/pdf") {
      setErr("ไฟล์ต้องเป็น PDF เท่านั้น");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setBusy(true);
    const prevUrl = url;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("filename", "customer_checklist");
      const res = await apiFetch("/api/upload", { method: "POST", body: fd }) as { url: string };
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_checklist_pdf_url: res.url,
          customer_checklist_pdf_name: file.name,
        }),
      });
      // Drop the previous file from disk only after the settings row points at
      // the new one — safe order: new URL is live before old file is removed.
      if (prevUrl) {
        apiFetch(`/api/upload?file=${encodeURIComponent(prevUrl)}`, { method: "DELETE" }).catch(() => {});
      }
      setUrl(res.url);
      setName(file.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัพโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!url) return;
    if (!confirm("ลบไฟล์ checklist นี้?")) return;
    setBusy(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_checklist_pdf_url: "", customer_checklist_pdf_name: "" }),
      });
      apiFetch(`/api/upload?file=${encodeURIComponent(url)}`, { method: "DELETE" }).catch(() => {});
      setUrl(null);
      setName(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-900">Checklist เอกสารขอขนานไฟ</h2>
        <p className="text-xs text-gray-500 mt-1">PDF รายการเอกสารที่ลูกค้าต้องเตรียม เพื่อใช้ขอขนานไฟ — อัพโหลดที่นี่ครั้งเดียว แล้วเปิดให้ลูกค้าดาวน์โหลดที่ขั้นตอนที่กำหนด</p>
      </div>
      {loading ? (
        <div className="p-5 text-sm text-gray-500">กำลังโหลด...</div>
      ) : (
        <div className="p-5 space-y-4">
          {url ? (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50/50">
              <div className="w-10 h-10 rounded-md bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <DocumentIcon className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{name || "checklist.pdf"}</div>
                <a href={url} onClick={fileViewer.handler(url, name || "checklist.pdf")} className="text-xs text-primary hover:underline font-medium">
                  เปิดดู / ดาวน์โหลด ↗
                </a>
              </div>
              <button type="button" onClick={remove} disabled={busy}
                className="h-9 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
                ลบ
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-500 px-1">ยังไม่ได้อัพโหลดไฟล์ — กดปุ่มข้างล่างเพื่ออัพโหลด PDF</div>
          )}
          <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onPick} disabled={busy} className="hidden" />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
              className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
              {busy ? "กำลังอัพโหลด..." : url ? "อัพโหลดไฟล์ใหม่ (แทนของเดิม)" : "อัพโหลด PDF"}
            </button>
            <span className="text-xs text-gray-400">PDF เท่านั้น · ไม่เกิน 20 MB</span>
          </div>
          {err && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</div>
          )}
        </div>
      )}
      {fileViewer.modal}
    </section>
  );
}
