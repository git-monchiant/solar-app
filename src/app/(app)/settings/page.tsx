"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Header from "@/components/Header";

interface PaymentToggle {
  key: string;
  label: string;
  description: string;
}

const PAYMENT_TOGGLES: PaymentToggle[] = [
  { key: "payment_qr_enabled", label: "Thai QR", description: "QR code สำหรับสแกนชำระผ่าน PromptPay" },
  { key: "payment_link_enabled", label: "Payment Link", description: "ลิ้งค์หน้าชำระเงินส่งให้ลูกค้า" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/settings").then(setSettings).catch(console.error).finally(() => setLoading(false));
  }, []);

  const isOn = (key: string) => settings[key] !== "false";

  const toggle = async (key: string) => {
    const next = !isOn(key);
    setSaving(key);
    setSettings(prev => ({ ...prev, [key]: String(next) }));
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
    } finally {
      setSaving(null);
    }
  };

  const enabledCount = PAYMENT_TOGGLES.filter(t => isOn(t.key)).length;

  return (
    <div>
      <Header title="Settings" subtitle="APP CONFIGURATION" />

      <div className="p-4 md:p-6 max-w-3xl">
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-900">วิธีการชำระเงิน</h2>
            <p className="text-xs text-gray-500 mt-0.5">เลือกช่องทางการชำระเงินที่ต้องการแสดงให้ลูกค้า</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {PAYMENT_TOGGLES.map(t => {
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
                      disabled={saving === t.key || (on && enabledCount <= 1)}
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

          {!loading && enabledCount <= 1 && (
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
              ต้องเปิดอย่างน้อย 1 ช่องทางการชำระเงิน
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
