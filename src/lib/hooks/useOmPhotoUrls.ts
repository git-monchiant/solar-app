"use client";

import { useEffect, useState } from "react";
import { getUserContextHeaders } from "@/lib/api";

/**
 * รูปหน้างาน O&M → blob URL ที่ <img> ใช้ได้
 *
 * ★ รูปเสิร์ฟผ่าน /api/om/jobs/<id>/photos/<file> ซึ่งตรวจสิทธิ์ด้วย header x-user-id (ไฟล์อยู่นอก public/)
 *   แต่ <img src> ของเบราว์เซอร์แนบ header เองไม่ได้ ⇒ ได้ 403 ทุกรูป
 *   (เจอ 28 ก.ย. 69 แผน 20260928-04: รูปก่อน/หลังในใบตรวจไม่เคยขึ้นเลยตั้งแต่ทำฟีเจอร์รูป)
 * ⇒ ดึงด้วย fetch ที่แนบ header แล้วแปลงเป็น blob URL แทน — ไม่ต้องเปิดช่องให้ดูรูปโดยไม่ตรวจสิทธิ์
 *   ล้าง blob URL ทิ้งเมื่อรายการเปลี่ยนหรือ component หาย (กันหน่วยความจำรั่ว)
 *
 * คืน map: url ต้นทาง → blob URL (ยังโหลดไม่เสร็จ/โหลดไม่ได้ = ไม่มีคีย์นั้น)
 */
export function useOmPhotoUrls(srcs: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = srcs.join("|");

  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const list = key ? key.split("|") : [];
    Promise.all(list.map(async (src) => {
      try {
        const r = await fetch(src, { headers: getUserContextHeaders() });
        if (!r.ok) return null;
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        // โหลดเสร็จหลัง component หายไปแล้ว — ทิ้งทันที ไม่งั้น URL ค้างไม่มีใครล้าง
        if (!alive) { URL.revokeObjectURL(url); return null; }
        made.push(url);
        return [src, url] as const;
      } catch { return null; }
    })).then((pairs) => {
      if (alive) setMap(Object.fromEntries(pairs.filter((p): p is readonly [string, string] => !!p)));
    });
    return () => { alive = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [key]);

  return map;
}
