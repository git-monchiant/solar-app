"use client";

import { getUserContextHeaders } from "@/lib/api";

/** เปิด PDF ใบเสนอราคาในแท็บใหม่ — API ตรวจสิทธิ์ด้วย header จึงเปิดลิงก์ตรงไม่ได้
 *  เปิดแท็บเปล่าก่อน (ตอนยังอยู่ในจังหวะกดปุ่ม — กันตัวบล็อกป๊อปอัป) แล้วค่อยใส่ไฟล์เมื่อโหลดเสร็จ */
export async function openQuotePdf(id: number): Promise<void> {
  const w = window.open("", "_blank");
  try {
    const res = await fetch(`/api/b2b/quotations/${id}/pdf`, { headers: { ...getUserContextHeaders() } });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `HTTP ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch (e) {
    w?.close();
    throw e;
  }
}
