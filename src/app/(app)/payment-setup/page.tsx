"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/layout/Header";
import { useMe } from "@/lib/roles";
import { useDialog } from "@/components/ui/Dialog";

type Settings = Record<string, string>;

export default function PaymentSetupPage() {
  const { me } = useMe();
  const isAdmin = (me?.roles || []).includes("admin");

  if (!me) return null;
  if (!isAdmin) {
    return (
      <div>
        <Header title="ตั้งค่าการชำระเงิน" subtitle="PAYMENT SETUP" />
        <div className="p-4 md:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-500 text-center">
            ต้องเป็น admin เท่านั้น
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="ตั้งค่าการชำระเงิน" subtitle="PAYMENT SETUP" />
      <div className="p-4 md:p-6">
        <PaymentSetup />
      </div>
    </div>
  );
}

function PaymentSetup() {
  const dialog = useDialog();
  const [settings, setSettings] = useState<Settings>({});
  const [taxIdInput, setTaxIdInput] = useState("");
  const [companyInput, setCompanyInput] = useState("");
  const [bankInput, setBankInput] = useState("");
  const [bankBranchInput, setBankBranchInput] = useState("");
  const [bankNumberInput, setBankNumberInput] = useState("");
  const [bankNameInput, setBankNameInput] = useState("");
  const [modeInput, setModeInput] = useState<"credit_transfer" | "bill_payment">("credit_transfer");
  const [billerIdInput, setBillerIdInput] = useState("");
  const [ref1Input, setRef1Input] = useState("");
  const [ref2Input, setRef2Input] = useState("");
  const [merchantNameInput, setMerchantNameInput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then((s: Settings) => {
      setSettings(s);
      setTaxIdInput(s.promptpay_tax_id || "");
      setCompanyInput(s.company_name || "");
      setBankInput(s.bank_account_bank || "");
      setBankBranchInput(s.bank_account_branch || "");
      setBankNumberInput(s.bank_account_number || "");
      setBankNameInput(s.bank_account_name || "");
      setModeInput(s.promptpay_mode === "credit_transfer" ? "credit_transfer" : "bill_payment");
      setBillerIdInput(s.promptpay_biller_id || "");
      setRef1Input(s.promptpay_ref1 || "");
      setRef2Input(s.promptpay_ref2 || "");
      setMerchantNameInput(s.promptpay_merchant_name || "");
      setTerminalInput(s.promptpay_terminal || "");
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const isOn = (key: string) => settings[key] !== "false";

  const patch = async (payload: Record<string, string | boolean>, sectionKey: string) => {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings(prev => ({ ...prev, ...Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])) }));
      setSavedSection(sectionKey);
      setTimeout(() => setSavedSection(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (key: string) => {
    const current = key === "other_payment_enabled" ? settings[key] === "true" : isOn(key);
    const next = !current;
    const qrOn = key === "promptpay_qr_enabled" ? next : isOn("promptpay_qr_enabled");
    const linkOn = key === "promptpay_link_enabled" ? next : isOn("promptpay_link_enabled");
    const bankOn = key === "bank_account_enabled" ? next : isOn("bank_account_enabled");
    const otherOn = key === "other_payment_enabled" ? next : settings["other_payment_enabled"] === "true";
    if (!qrOn && !linkOn && !bankOn && !otherOn) return;
    await patch({ [key]: next }, "channels");
  };

  const saveCompany = async () => {
    if (taxIdInput && !/^\d{13}$/.test(taxIdInput)) { dialog.alert({ title: "Tax ID ไม่ถูกต้อง", message: "Tax ID ต้องเป็นตัวเลข 13 หลัก", variant: "warning" }); return; }
    await patch({ promptpay_tax_id: taxIdInput, company_name: companyInput }, "company");
  };

  const saveQr = async () => {
    if (modeInput === "bill_payment") {
      if (!billerIdInput || !ref1Input) { dialog.alert({ title: "ข้อมูลไม่ครบ", message: "Bill Payment mode ต้องมี Biller ID และ Ref1", variant: "warning" }); return; }
    }
    await patch({
      promptpay_mode: modeInput,
      promptpay_biller_id: billerIdInput,
      promptpay_ref1: ref1Input,
      promptpay_ref2: ref2Input,
      promptpay_merchant_name: merchantNameInput,
      promptpay_terminal: terminalInput,
    }, "qr");
  };

  const saveBank = async () => {
    if (!bankInput || !bankNumberInput || !bankNameInput) { dialog.alert({ title: "ข้อมูลไม่ครบ", message: "กรุณากรอกธนาคาร / เลขบัญชี / ชื่อบัญชี", variant: "warning" }); return; }
    await patch({
      bank_account_bank: bankInput,
      bank_account_branch: bankBranchInput,
      bank_account_number: bankNumberInput,
      bank_account_name: bankNameInput,
    }, "bank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Section title="ข้อมูลผู้รับชำระเงิน" subtitle="ใช้บนเอกสารและ QR PromptPay" savedAt={savedSection === "company"}>
        <FormRow label="ชื่อบริษัท">
          <input type="text" value={companyInput} onChange={e => setCompanyInput(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </FormRow>
        <FormRow label="Tax ID (13 หลัก)">
          <input type="text" inputMode="numeric" maxLength={13} value={taxIdInput}
            onChange={e => setTaxIdInput(e.target.value.replace(/\D/g, "").slice(0, 13))}
            placeholder="0000000000000"
            className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
        </FormRow>
        <SaveButton saving={saving} onClick={saveCompany} />
      </Section>

      <Section title="PromptPay QR Bill Payment" subtitle="ใช้ Biller ID ผ่าน Digio" savedAt={savedSection === "qr"}>
        <FormRow label="Biller ID (15 หลัก)">
              <input type="text" value={billerIdInput}
                onChange={e => setBillerIdInput(e.target.value.replace(/\D/g, "").slice(0, 15))}
                placeholder="010753700001716"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
            </FormRow>
            <FormRow label="Ref1 (merchant code)">
              <input type="text" value={ref1Input} onChange={e => setRef1Input(e.target.value.toUpperCase().slice(0, 20))}
                placeholder="87UX"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary" />
            </FormRow>
            <FormRow label="Ref2 (customer/terminal ref — optional)">
              <input type="text" value={ref2Input} onChange={e => setRef2Input(e.target.value.toUpperCase().slice(0, 20))}
                placeholder="86289573"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary" />
            </FormRow>
            <FormRow label="Merchant Name (tag 59, max 25 — เว้นว่าง = ใช้ชื่อบริษัท)">
              <input type="text" value={merchantNameInput} onChange={e => setMerchantNameInput(e.target.value.slice(0, 25))}
                placeholder={companyInput.slice(0, 25) || "SENA SOLAR ENERGY"}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </FormRow>
            <FormRow label="Terminal (tag 62/07 — optional)">
              <input type="text" value={terminalInput} onChange={e => setTerminalInput(e.target.value.slice(0, 32))}
                placeholder="SDGO862842802640220"
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary" />
            </FormRow>
        <SaveButton saving={saving} onClick={saveQr} />
      </Section>

      <Section title="บัญชีธนาคาร" subtitle="สำหรับลูกค้าโอนตรงเข้าบัญชี" savedAt={savedSection === "bank"}>
        <FormRow label="ธนาคาร">
          <input type="text" value={bankInput} onChange={e => setBankInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </FormRow>
        <FormRow label="สาขา">
          <input type="text" value={bankBranchInput} onChange={e => setBankBranchInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </FormRow>
        <FormRow label="เลขบัญชี">
          <input type="text" value={bankNumberInput} onChange={e => setBankNumberInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
        </FormRow>
        <FormRow label="ชื่อบัญชี">
          <input type="text" value={bankNameInput} onChange={e => setBankNameInput(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </FormRow>
        <SaveButton saving={saving} onClick={saveBank} />
      </Section>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">ช่องทางการชำระเงิน</h2>
          <p className="text-xs text-gray-500 mt-0.5">เปิด/ปิดช่องทางที่แสดงให้ลูกค้า</p>
        </div>
        <div className="divide-y divide-gray-100">
          {[
            { key: "promptpay_qr_enabled", label: "Thai QR", description: "QR code สำหรับสแกนชำระผ่าน PromptPay" },
            { key: "promptpay_link_enabled", label: "Payment Link", description: "ลิ้งค์หน้าชำระเงินส่งให้ลูกค้า" },
            { key: "bank_account_enabled", label: "Bank Account", description: "บัญชีธนาคารสำหรับลูกค้าโอนตรง" },
            { key: "other_payment_enabled", label: "อื่นๆ", description: "ช่องทางอื่น (เงินสด/เช็ค/...) — ระบุวิธีเป็น text + อัปโหลดหลักฐาน" },
          ].map(t => {
            const on = t.key === "other_payment_enabled" ? settings[t.key] === "true" : isOn(t.key);
            return (
              <div key={t.key} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{t.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
                </div>
                <button type="button" onClick={() => toggle(t.key)} disabled={saving}
                  className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${on ? "bg-primary" : "bg-gray-300"}`}
                  aria-label={`Toggle ${t.label}`}>
                  <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Section({ title, subtitle, savedAt, children }: { title: string; subtitle?: string; savedAt: boolean; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {savedAt && <span className="text-xs font-semibold text-emerald-600">✓ บันทึกแล้ว</span>}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function SaveButton({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <div className="pt-1">
      <button type="button" onClick={onClick} disabled={saving}
        className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 transition-colors">
        {saving ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </div>
  );
}
