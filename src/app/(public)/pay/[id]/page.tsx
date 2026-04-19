"use client";

import { useEffect, useState, use } from "react";

const fmt = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const headers = { "ngrok-skip-browser-warning": "true" };

export default function PublicPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: token } = use(params);

  const [customerName, setCustomerName] = useState<string>("");
  const [amount, setAmount] = useState<number>(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [taxId, setTaxId] = useState<string>("");
  const [companyFull, setCompanyFull] = useState<string>("SENA SOLAR ENERGY CO., LTD.");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const tokRes = await fetch(`/api/pay-tokens/${token}`, { headers });
        if (!tokRes.ok) { setError("ไม่พบข้อมูลการชำระเงิน"); setLoading(false); return; }
        const tok = await tokRes.json() as { customer_name: string; amount: number };
        setCustomerName(tok.customer_name || "");
        setAmount(tok.amount || 0);

        const [settings, qr] = await Promise.all([
          fetch(`/api/settings`, { headers }).then(r => r.ok ? r.json() : {}) as Promise<Record<string, string>>,
          fetch(`/api/qr?amount=${tok.amount}`, { headers }).then(r => r.ok ? r.json() : null) as Promise<{ qrDataUrl?: string } | null>,
        ]);
        if (settings.promptpay_tax_id) setTaxId(settings.promptpay_tax_id);
        if (settings.company_name) setCompanyFull(settings.company_name);
        if (qr?.qrDataUrl) setQrDataUrl(qr.qrDataUrl);
        else setError("สร้าง QR ไม่สำเร็จ");
      } catch (e) {
        console.error(e);
        setError("เกิดข้อผิดพลาด");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900 mb-1">{error}</div>
          <div className="text-sm text-gray-500">กรุณาติดต่อเจ้าหน้าที่</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-br from-primary to-primary-dark text-white p-5 text-center">
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{companyFull}</div>
            <div className="text-lg font-bold mt-1">ชำระเงิน</div>
            {customerName && <div className="text-sm opacity-90 mt-0.5">{customerName}</div>}
          </div>

          <div className="p-5 border-b border-gray-100 text-center">
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ยอดชำระ</div>
            <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 mt-1">{fmt(amount)} <span className="text-base font-medium text-gray-500">บาท</span></div>
          </div>

          <div className="p-5 flex flex-col items-center">
            {qrDataUrl && <img src={qrDataUrl} alt="PromptPay QR" className="w-full max-w-[320px]" />}
            <div className="text-center mt-3">
              <div className="text-xs font-semibold text-gray-700">PromptPay</div>
              <div className="text-[11px] text-gray-500 font-mono tabular-nums mt-0.5">Tax ID: {taxId}</div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-3 border-t border-gray-100 text-center text-xs text-gray-500">
            สแกน QR นี้ด้วยแอปธนาคาร<br />หลังโอนแล้วกรุณาส่งสลิปกลับทาง LINE
          </div>
        </div>
      </div>
    </div>
  );
}
