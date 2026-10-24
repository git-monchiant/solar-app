// ช่องติดต่อลูกค้า O&M — อีเมล · LINE ID (ผู้ใช้สั่ง 21 ต.ค. 69) · ใช้ทั้ง API และฟอร์ม (ค่าคงที่ล้วน ไม่มีโค้ดฝั่ง server)
// ★ LINE ID = ไอดีที่ลูกค้าบอก (เช่น @somchai) — ไม่ใช่รหัส U… ของบัญชีที่เชื่อมผ่าน LINE OA

export type ContactCheck = { value: string | null; error?: string };

/** ว่าง = null · ตัดช่องว่างหัวท้าย · ต้องมีรูป x@y.z */
export function checkEmail(raw: unknown): ContactCheck {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return { value: null };
  if (v.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { value: null, error: "อีเมลไม่ถูกต้อง" };
  return { value: v };
}

/** ว่าง = null · ตัดช่องว่างทั้งหมด · ตัวอักษรอังกฤษ ตัวเลข . _ - และ @ นำหน้า (LINE OA) */
export function checkLineId(raw: unknown): ContactCheck {
  const v = typeof raw === "string" ? raw.replace(/\s+/g, "") : "";
  if (!v) return { value: null };
  if (v.length > 50 || !/^@?[A-Za-z0-9._-]+$/.test(v))
    return { value: null, error: "LINE ID ไม่ถูกต้อง — ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ . _ -" };
  return { value: v };
}
