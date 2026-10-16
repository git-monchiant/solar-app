"use client";

import { getUserContextHeaders } from "@/lib/api";

/** เปิดไฟล์ที่ API ตรวจสิทธิ์ด้วย header (หลักฐานรับเงิน B2B · PDF ใบเสนอราคา) ในแท็บใหม่
 *  เปิดแท็บเปล่าก่อนตอนยังอยู่ในจังหวะกดปุ่ม (กันตัวบล็อกป๊อปอัป) แล้วค่อยใส่ไฟล์เมื่อโหลดเสร็จ */
export async function openAuthedFile(url: string): Promise<void> {
  const w = window.open("", "_blank");
  try {
    const res = await fetch(url, { headers: { ...getUserContextHeaders() } });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
    const blobUrl = URL.createObjectURL(await res.blob());
    if (w) w.location.href = blobUrl;
    else window.location.href = blobUrl;
  } catch (e) {
    w?.close();
    throw e;
  }
}
