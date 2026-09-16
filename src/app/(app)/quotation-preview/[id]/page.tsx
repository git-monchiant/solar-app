"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getUserIdHeader } from "@/lib/api";

type DraftPreview = {
  lead: Record<string, unknown>;
  optionNo: number;
  packageName: string;
  packagePrice: number;
  packageItems: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  discountLabel: string;
  discountType: string;
  discountValue: number;
  deposit: number;
  subtotal: number;
  total: number;
  outstanding: number;
  terms: Array<{ label?: string; percent?: number; due?: string }>;
  termsText: string;
  note: string;
};
const escapeHtml = (value: unknown) =>
  String(value ?? "-").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] || char,
  );
const money = (value: unknown) =>
  Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
function buildDraftHtml(draft: DraftPreview) {
  const lead = draft.lead;
  const rows = [...draft.packageItems, ...draft.items]
    .map(
      (item, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(item.item_name_snapshot || item.item_name)} ${escapeHtml(item.quantity || "")} ${escapeHtml(item.unit || "")}</td><td>${item.unit_price ? money(Number(item.quantity || 0) * Number(item.unit_price || 0)) : ""}</td></tr>`,
    )
    .join("");
  const terms = draft.terms
    .map(
      (term) =>
        `<tr><td>${escapeHtml(term.label)}</td><td>${escapeHtml(term.percent)}%</td><td>${escapeHtml(term.due)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>@page{size:Letter;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif;color:#172126;font-size:12px}.page{width:215.9mm;height:279.4mm;padding:14mm 16mm;background:#fff;overflow:hidden}.head{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #00a99d;padding-bottom:7mm}.brand{font-size:25px;font-weight:bold;color:#00a99d}.brand b{color:#ef9a19}.title{text-align:right}.title h1{margin:0;border:1px solid #00a99d;padding:4px 20px;font-size:19px}.meta{margin-top:4px;border-collapse:collapse}.meta td{border:1px solid #74808a;padding:2px 5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12mm;margin:6mm 0}.grid p{margin:3px 0}.table{width:100%;border-collapse:collapse}.table th,.table td{border:1px solid #39444c;padding:3px;vertical-align:top}.table th{background:#eef6f5;text-align:center}.table td:first-child{width:10mm;text-align:center}.right{text-align:right}.summary{margin-left:auto;margin-top:0;width:48%;border-collapse:collapse}.summary td{border:1px solid #39444c;padding:3px}.summary td:last-child{text-align:right}.summary .total{background:#cfe9f4;font-weight:bold}.notice{margin-top:6mm;padding:5mm;border-left:4px solid #00a99d;background:#f3fbfa}.footer{position:absolute;bottom:7mm;left:16mm;right:16mm;text-align:center;color:#6b7280}.watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:55px;font-weight:bold;transform:rotate(-25deg);color:rgba(222,51,74,.15);pointer-events:none}</style></head><body><section class="page"><div class="watermark">DRAFT</div><div class="head"><div class="brand">SENA<b>SOLAR</b><small style="display:block;font-size:10px">ENERGY</small></div><div class="title"><h1>ใบเสนอราคา</h1><table class="meta"><tr><td>QUOTATION NO.</td><td>ตัวอย่างก่อนบันทึก</td></tr><tr><td>ชุด</td><td>${draft.optionNo}</td></tr></table></div></div><div class="grid"><div><p>ชื่อโครงการ : ${escapeHtml(lead.project_name || lead.project_alias)}</p><p>ลูกค้า : ${escapeHtml(lead.full_name || lead.customer_name)}</p><p>ที่อยู่ : ${escapeHtml(lead.installation_address || lead.id_card_address)}</p><p>โทรศัพท์ : ${escapeHtml(lead.phone || lead.customer_phone)}</p></div><div><p>แพ็กเกจ : ${escapeHtml(draft.packageName)}</p><p>ผู้จัดทำ : ${escapeHtml(lead.assigned_name || "-")}</p><p>สถานะ : ตัวอย่างก่อนบันทึก</p></div></div><table class="table"><thead><tr><th>ลำดับ</th><th>รายการ</th><th>จำนวนเงิน</th></tr></thead><tbody><tr><td>1</td><td>${escapeHtml(draft.packageName)}</td><td class="right">${money(draft.packagePrice)}</td></tr>${rows}</tbody></table><h3>เงื่อนไขการชำระเงิน</h3><table class="table"><tbody>${terms}</tbody></table><table class="summary"><tbody><tr><td>รวมก่อนลด</td><td>${money(draft.subtotal)}</td></tr><tr><td>${escapeHtml(draft.discountLabel || "ส่วนลด")}</td><td>-${money(draft.subtotal - draft.total)}</td></tr><tr><td>หักเงินจอง</td><td>-${money(draft.deposit)}</td></tr><tr class="total"><td>ยอดที่ต้องชำระ</td><td>${money(draft.outstanding)}</td></tr></tbody></table><div class="footer">หน้า 1 / 2 · ตัวอย่างก่อนบันทึก</div></section><section class="page"><div class="watermark">DRAFT</div><div class="head"><div class="brand">SENA<b>SOLAR</b></div><div class="title"><h1>เงื่อนไขและหมายเหตุ</h1></div></div><div class="notice"><b>เงื่อนไขเพิ่มเติม</b><p>${escapeHtml(draft.termsText || "-")}</p><b>หมายเหตุ</b><p>${escapeHtml(draft.note || "-")}</p></div><div style="margin-top:40mm;text-align:center">เอกสารตัวอย่างนี้สร้างจากข้อมูลในฟอร์ม<br>ยังไม่ได้บันทึกเป็นใบเสนอราคา</div><div class="footer">หน้า 2 / 2 · ตัวอย่างก่อนบันทึก</div></section></body></html>`;
}

export default function QuotationPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (!params.id) return;
    if (params.id === "draft") {
      const key = new URLSearchParams(window.location.search).get("key");
      try {
        const raw = key ? window.localStorage.getItem(key) : null;
        if (!raw) throw new Error("ไม่พบข้อมูลตัวอย่างก่อนบันทึก");
        setHtml(buildDraftHtml(JSON.parse(raw) as DraftPreview));
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "เปิดตัวอย่างใบเสนอราคาไม่สำเร็จ",
        );
      }
      return;
    }
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
  // ใบที่รายการยาวมีมากกว่า 2 หน้า — ยืด iframe ตามจำนวนหน้าที่ได้มาจริง
  const pageCount = Math.max(
    2,
    previewHtml.split('<section class="page').length - 1,
  );
  const previewHeight = Math.round((1120 * pageCount * zoom) / 100 + 80);
  const changeZoom = (delta: number) =>
    setZoom((value) => Math.min(160, Math.max(75, value + delta)));

  return (
    <main className="min-h-screen bg-white p-3 md:p-6">
      <header className="mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-base font-bold text-slate-800">
            ตัวอย่างใบเสนอราคาบนหน้าจอ
          </h1>
          <p className="text-xs text-slate-500">แสดงเฉพาะส่วนใบเสนอราคา (ไม่รวมรายงานสำรวจ)</p>
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
