"use client";

import { openAuthedFile } from "@/components/b2b/openAuthedFile";

/** เปิด PDF ใบเสนอราคาในแท็บใหม่ — API ตรวจสิทธิ์ด้วย header จึงเปิดลิงก์ตรงไม่ได้ */
export const openQuotePdf = (id: number): Promise<void> => openAuthedFile(`/api/b2b/quotations/${id}/pdf`);
