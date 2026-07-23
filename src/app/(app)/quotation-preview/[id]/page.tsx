"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getUserIdHeader } from "@/lib/api";

export default function QuotationPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!params.id) return;
    fetch(`/api/quotation-pdf/${params.id}?format=html`, {
      headers: { ...getUserIdHeader() },
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "เปิดตัวอย่างใบเสนอราคาไม่สำเร็จ");
        }
        return response.text();
      })
      .then(setHtml)
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "เปิดตัวอย่างใบเสนอราคาไม่สำเร็จ",
        ),
      );
  }, [params.id]);

  const closePreview = () => {
    window.close();
    setTimeout(() => router.back(), 150);
  };
  const previewHtml = html.replace(
    "</head>",
    `<style>@media screen{html,body{background:#e2e8f0!important;padding:12px 0!important}.page{margin:0 auto 18px!important;background:#fff!important;box-shadow:0 2px 8px rgba(15,23,42,.18);page-break-after:auto!important}}</style><style>body{zoom:${zoom}%}</style></head>`,
  );
  const previewWidth = Math.round((860 * zoom) / 100);
  const previewHeight = Math.round((2240 * zoom) / 100 + 80);
  const changeZoom = (delta: number) =>
    setZoom((value) => Math.min(160, Math.max(75, value + delta)));

  return (
    <main className="min-h-screen bg-white p-3 md:p-6">
      <header className="mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-base font-bold text-slate-800">
            ตัวอย่างใบเสนอราคาบนหน้าจอ
          </h1>
          <p className="text-xs text-slate-500">แสดงเฉพาะใบเสนอราคา 2 หน้า</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-primary/30 bg-white text-sm font-semibold text-primary">
            <button
              type="button"
              onClick={() => changeZoom(-10)}
              disabled={zoom <= 75}
              aria-label="ย่อเอกสาร"
              className="px-3 py-2 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(100)}
              className="border-x border-primary/20 px-3 py-2 hover:bg-primary/5"
            >
              {zoom}%
            </button>
            <button
              type="button"
              onClick={() => changeZoom(10)}
              disabled={zoom >= 160}
              aria-label="ขยายเอกสาร"
              className="px-3 py-2 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={closePreview}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            ปิด
          </button>
        </div>
      </header>
      {error ? (
        <div className="mx-auto max-w-5xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : !html ? (
        <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          กำลังสร้างตัวอย่างใบเสนอราคา...
        </div>
      ) : (
        <div className="mx-auto max-w-5xl overflow-auto">
          <iframe
            title="ตัวอย่างใบเสนอราคา"
            srcDoc={previewHtml}
            style={{ width: previewWidth, height: previewHeight }}
            className="mx-auto block border-0 bg-transparent"
          />
        </div>
      )}
    </main>
  );
}
