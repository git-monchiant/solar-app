"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";

type Settings = Record<string, string>;

const DOC_TYPES: { key: string; label: string; description: string; defaultPrefix: string }[] = [
  { key: "booking", label: "ใบจองคิว", description: "เกิดเมื่อยืนยัน Pre-Survey + จ่ายเงินจอง", defaultPrefix: "SM" },
  { key: "quotation", label: "ใบเสนอราคา", description: "ออกหลังเสร็จ Survey", defaultPrefix: "QT" },
  { key: "survey", label: "ใบสำรวจ", description: "เอกสารสำรวจหน้างาน", defaultPrefix: "SV" },
  { key: "warranty", label: "ใบรับประกัน", description: "ออกเมื่อจบงานติดตั้ง", defaultPrefix: "SSE" },
  { key: "receipt", label: "ใบเสร็จอย่างย่อ", description: "ใบรับเงินมัดจำ/งวด", defaultPrefix: "RC" },
];

type Tab = "running_numbers" | "gmail";

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
      <Header title="Settings" subtitle="APP CONFIGURATION" />

      <div className="p-4 md:p-6 max-w-4xl">
        <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
          <TabBtn active={tab === "running_numbers"} onClick={() => setTab("running_numbers")} label="เลขเอกสาร" />
          <TabBtn active={tab === "gmail"} onClick={() => setTab("gmail")} label="Gmail" />
          <div className="flex-1" />
          <div className="pb-2 pr-1">
            <button
              type="button"
              onClick={logout}
              className="h-9 px-4 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>

        {tab === "running_numbers" && <RunningNumbersSection />}
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
      className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${active ? "text-primary border-primary" : "text-gray-500 border-transparent hover:text-gray-800"}`}
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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{status.email}</div>
          <div className="text-xs text-gray-500">
            เชื่อมเมื่อ {status.connected_at ? new Date(status.connected_at).toLocaleString("th-TH") : "—"}
          </div>
        </div>
        <button type="button" onClick={sync} disabled={busy}
          className="h-9 px-4 rounded-lg text-xs font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
          {busy ? "กำลัง sync..." : "Sync ตอนนี้"}
        </button>
        <button type="button" onClick={onDisconnect} disabled={busy}
          className="h-9 px-3 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50">
          ตัด
        </button>
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
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1 md:hidden">Prefix</label>
                    <input type="text" value={cur.prefix}
                      onChange={e => update(t.key, { prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })}
                      placeholder={t.defaultPrefix}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tracking-wider focus:outline-none focus:border-primary" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1 md:hidden">Digits</label>
                    <select value={cur.digits} onChange={e => update(t.key, { digits: parseInt(e.target.value) })}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary">
                      <option value={3}>3 หลัก</option>
                      <option value={4}>4 หลัก</option>
                      <option value={5}>5 หลัก</option>
                    </select>
                  </div>
                  <div className="text-xs text-gray-500 md:text-right">
                    <span className="md:hidden text-[10px] font-bold uppercase tracking-wider text-gray-400 mr-1">ตัวอย่าง</span>
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
