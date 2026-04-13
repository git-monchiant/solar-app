"use client";

import { useEffect, useState, use } from "react";

const DEPOSIT_AMOUNT = 1000;
const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

interface Lead {
  id: number;
  full_name: string;
  phone: string;
  project_name: string;
  house_number: string;
  package_name: string;
  confirmed: boolean;
  payment_confirmed: boolean;
}

export default function PublicPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<Lead | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/leads/${id}`, { headers: { "ngrok-skip-browser-warning": "true" } }).then(r => r.json()),
      fetch(`/api/qr?amount=${DEPOSIT_AMOUNT}`, { headers: { "ngrok-skip-browser-warning": "true" } }).then(r => r.json()),
    ])
      .then(([leadData, qrData]) => {
        setLead(leadData);
        setQrDataUrl(qrData.qrDataUrl);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900 mb-1">ไม่พบข้อมูล</div>
          <div className="text-sm text-gray-500">กรุณาติดต่อเจ้าหน้าที่</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Logo header */}
        <div className="rounded-t-xl bg-gradient-to-br from-primary to-primary-dark text-white px-6 py-5 text-center">
          <img
            src="https://senasolarenergy.com/wp-content/uploads/2023/03/SENA-SOLAR-ENERGY_logo-white-1.png"
            alt="Sena Solar Energy"
            className="h-10 w-auto mx-auto mb-2"
          />
          <div className="text-xs font-semibold tracking-wider uppercase text-white/70">Payment Request</div>
          <div className="text-base font-bold mt-0.5">ชำระค่าจอง Survey</div>
        </div>

        {/* Paid state */}
        {lead.payment_confirmed ? (
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div className="text-lg font-bold text-gray-900">ชำระเงินแล้ว</div>
            <div className="text-sm text-gray-500 mt-1">ขอบคุณที่ใช้บริการ Sena Solar Energy</div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">
            {/* Customer info */}
            <div className="pb-4 border-b border-gray-100">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Customer</div>
              <div className="text-base font-bold text-gray-900 mt-0.5">{lead.full_name}</div>
              {(lead.project_name || lead.house_number) && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {lead.project_name}
                  {lead.project_name && lead.house_number && " · "}
                  {lead.house_number && <span className="font-mono">{lead.house_number}</span>}
                </div>
              )}
            </div>

            {/* QR */}
            {qrDataUrl && (
              <div className="py-5">
                <div className="relative max-w-[260px] mx-auto">
                  <img src="/templates/thaiqr.png" alt="Thai QR Payment" className="w-full" />
                  <img
                    src={qrDataUrl}
                    alt="PromptPay QR"
                    className="absolute"
                    style={{ top: "108px", left: "28px", width: "calc(100% - 56px)" }}
                  />
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="text-center py-3 border-t border-gray-100">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Amount</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 mt-1">
                {formatPrice(DEPOSIT_AMOUNT)}
                <span className="text-base font-semibold text-gray-400 ml-1">THB</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">PromptPay · 085-909-9890</div>
            </div>

            {/* Instructions */}
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-xs font-semibold text-amber-800 mb-1">วิธีการชำระเงิน</div>
              <ol className="text-xs text-amber-700 space-y-0.5 list-decimal list-inside">
                <li>เปิดแอพธนาคาร / PromptPay</li>
                <li>สแกน QR ด้านบน</li>
                <li>ตรวจสอบชื่อผู้รับและจำนวนเงิน</li>
                <li>ยืนยันการโอน</li>
                <li>แจ้งสลิปกลับให้เจ้าหน้าที่</li>
              </ol>
            </div>
          </div>
        )}

        <div className="text-center mt-4 text-xs text-gray-400">
          SENA SOLAR ENERGY · Secure Payment
        </div>
      </div>
    </div>
  );
}
