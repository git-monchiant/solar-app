"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/Header";

type Settings = Record<string, string>;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [taxIdInput, setTaxIdInput] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [bankInput, setBankInput] = useState("");
  const [bankBranchInput, setBankBranchInput] = useState("");
  const [bankNumberInput, setBankNumberInput] = useState("");
  const [bankNameInput, setBankNameInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      setTaxIdInput(s.promptpay_tax_id || "");
      setCompanyInput(s.company_name || "");
      setBankInput(s.bank_account_bank || "");
      setBankBranchInput(s.bank_account_branch || "");
      setBankNumberInput(s.bank_account_number || "");
      setBankNameInput(s.bank_account_name || "");
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const isOn = (key: string) => settings[key] !== "false";

  const patch = async (payload: Record<string, string | boolean>) => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(prev => ({ ...prev, ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])) }));
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: string) => {
    const next = !isOn(key);
    const qrOn = key === "promptpay_qr_enabled" ? next : isOn("promptpay_qr_enabled");
    const linkOn = key === "promptpay_link_enabled" ? next : isOn("promptpay_link_enabled");
    const bankOn = key === "bank_account_enabled" ? next : isOn("bank_account_enabled");
    if (!qrOn && !linkOn && !bankOn) return; // keep at least one channel on
    await patch({ [key]: next });
  };

  const saveTaxId = async () => {
    if (!/^\d{13}$/.test(taxIdInput)) {
      alert("Tax ID ต้องเป็นตัวเลข 13 หลัก");
      return;
    }
    await patch({ promptpay_tax_id: taxIdInput, company_name: companyInput });
  };

  const saveBank = async () => {
    if (!bankInput || !bankNumberInput || !bankNameInput) {
      alert("กรุณากรอกธนาคาร / เลขบัญชี / ชื่อบัญชี");
      return;
    }
    await patch({
      bank_account_bank: bankInput,
      bank_account_branch: bankBranchInput,
      bank_account_number: bankNumberInput,
      bank_account_name: bankNameInput,
    });
  };

  return (
    <div>
      <Header title="Settings" subtitle="APP CONFIGURATION" />

      <div className="p-4 md:p-6 max-w-3xl space-y-4">
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">PromptPay</h2>
            <p className="text-xs text-gray-500 mt-0.5">ข้อมูลผู้รับชำระเงิน</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">Tax ID (13 หลัก)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={13}
                  value={taxIdInput}
                  onChange={e => setTaxIdInput(e.target.value.replace(/\D/g, "").slice(0, 13))}
                  placeholder="0000000000000"
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชื่อบริษัท</label>
                <input
                  type="text"
                  value={companyInput}
                  onChange={e => setCompanyInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={saveTaxId}
                  disabled={saving}
                  className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors"
                >
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                {savedAt && <span className="text-xs font-semibold text-emerald-600">✓ บันทึกแล้ว</span>}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">บัญชีธนาคาร</h2>
            <p className="text-xs text-gray-500 mt-0.5">สำหรับลูกค้าโอนตรงเข้าบัญชี</p>
          </div>

          {!loading && (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ธนาคาร</label>
                <input type="text" value={bankInput} onChange={e => setBankInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">สาขา</label>
                <input type="text" value={bankBranchInput} onChange={e => setBankBranchInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขบัญชี</label>
                <input type="text" value={bankNumberInput} onChange={e => setBankNumberInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชื่อบัญชี</label>
                <input type="text" value={bankNameInput} onChange={e => setBankNameInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button type="button" onClick={saveBank} disabled={saving}
                  className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">ช่องทางการชำระเงิน</h2>
            <p className="text-xs text-gray-500 mt-0.5">เปิด/ปิดช่องทางที่แสดงให้ลูกค้า</p>
          </div>

          {!loading && (
            <div className="divide-y divide-gray-100">
              {[
                { key: "promptpay_qr_enabled", label: "Thai QR", description: "QR code สำหรับสแกนชำระผ่าน PromptPay" },
                { key: "promptpay_link_enabled", label: "Payment Link", description: "ลิ้งค์หน้าชำระเงินส่งให้ลูกค้า" },
                { key: "bank_account_enabled", label: "Bank Account", description: "บัญชีธนาคารสำหรับลูกค้าโอนตรง" },
              ].map(t => {
                const on = isOn(t.key);
                return (
                  <div key={t.key} className="px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{t.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggle(t.key)}
                      disabled={saving}
                      className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-primary" : "bg-gray-300"}`}
                      aria-label={`Toggle ${t.label}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
