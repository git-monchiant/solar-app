"use client";

import { useEffect, useState, use } from "react";

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

interface PayData {
  id: number;
  lead_id: number;
  qr_image_base64: string;
  amount: number;
  status: string;
  paid_at: string | null;
  customer: {
    full_name: string;
    phone: string;
    project_name: string;
    installation_address: string;
  };
}

const headers = { "ngrok-skip-browser-warning": "true" };

export default function PublicPayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<PayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const isToken = !/^\d+$/.test(id);
    if (isToken) {
      fetch(`/api/payments/by-token/${id}`, { headers })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((d: PayData) => setData(d))
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false));
    } else {
      fetch(`/api/payments/create`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: parseInt(id) }),
      })
        .then(r => r.json())
        .then((tx: { access_token?: string }) => {
          if (tx.access_token) {
            window.location.href = `/pay/${tx.access_token}`;
          } else {
            setNotFound(true);
            setLoading(false);
          }
        })
        .catch(() => { setNotFound(true); setLoading(false); });
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-900 mb-1">ไม่พบข้อมูล</div>
          <div className="text-sm text-gray-500">กรุณาติดต่อเจ้าหน้าที่</div>
        </div>
      </div>
    );
  }

  const paid = data.status === "authorized";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="rounded-t-xl bg-gradient-to-br from-primary to-primary-dark text-white px-6 py-5 text-center">
          <img
            src="https://senasolarenergy.com/wp-content/uploads/2023/03/SENA-SOLAR-ENERGY_logo-white-1.png"
            alt="Sena Solar Energy"
            className="h-10 w-auto mx-auto mb-2"
          />
          <div className="text-xs font-semibold tracking-wider uppercase text-white/70">Payment Request</div>
          <div className="text-base font-bold mt-0.5">ชำระค่าจอง Survey</div>
        </div>

        {paid ? (
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
            <div className="pb-4 border-b border-gray-100">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Customer</div>
              <div className="text-base font-bold text-gray-900 mt-0.5">{data.customer.full_name}</div>
              {(data.customer.project_name || data.customer.installation_address) && (
                <div className="text-xs text-gray-500 mt-0.5">
                  {data.customer.project_name}
                  {data.customer.project_name && data.customer.installation_address && " · "}
                  {data.customer.installation_address && <span className="font-mono">{data.customer.installation_address}</span>}
                </div>
              )}
            </div>

            {data.qr_image_base64 && (
              <div className="py-5">
                <div className="max-w-[260px] mx-auto">
                  <img
                    src={`data:image/png;base64,${data.qr_image_base64}`}
                    alt="Thai QR Payment"
                    className="w-full rounded-xl border border-gray-200"
                  />
                </div>
              </div>
            )}

            <div className="text-center py-3 border-t border-gray-100">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Amount</div>
              <div className="text-3xl font-bold font-mono tabular-nums text-gray-900 mt-1">
                {formatPrice(data.amount)}
                <span className="text-base font-semibold text-gray-400 ml-1">THB</span>
              </div>
              <div className="text-xs text-gray-500 mt-1">SENA SOLAR ENERGY</div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-xs font-semibold text-amber-800 mb-1">วิธีการชำระเงิน</div>
              <ol className="text-xs text-amber-700 space-y-0.5 list-decimal list-inside">
                <li>เปิดแอพธนาคาร / PromptPay</li>
                <li>สแกน QR ด้านบน</li>
                <li>ตรวจสอบชื่อผู้รับและจำนวนเงิน</li>
                <li>ยืนยันการโอน</li>
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
