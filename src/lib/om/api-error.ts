// ★ 21 ต.ค. 69 แผน 20261021-01: route O&M เคยส่ง e.message ตรงไปหน้าจอ — SQL/driver ล้มแล้วผู้ใช้เห็น error อังกฤษ
//   ข้อความภาษาไทยที่ตั้งใจ throw (error ธุรกิจ) ยังส่งผ่านได้ · ที่เหลือ log ฝั่งเซิร์ฟเวอร์แล้วตอบข้อความกลาง
// ★ ดูอักษรตัวแรก ไม่ใช่ "มีอักษรไทยที่ไหนก็ได้" — error ของ SQL ที่ยกข้อมูลไทยมาด้วย (duplicate key value is (…))
//   และ error ระบบที่ขึ้นต้นอังกฤษ ("REM /x ตอบ 500: …" · "logBooking: …") ต้องไม่หลุดไปหน้าจอ

const THAI_START = /^\s*[฀-๿]/;

/** ข้อความ error ที่ส่งถึงหน้าจอ — error ธุรกิจภาษาไทยที่ตั้งใจ throw ผ่านได้ · error ระบบ (SQL/driver/อังกฤษ) log ฝั่งเซิร์ฟเวอร์แล้วตอบข้อความกลาง */
export function omErrorText(e: unknown, fallback: string, where?: string): string {
  if (e instanceof Error && THAI_START.test(e.message)) return e.message;
  console.error(where ?? "om api", e);
  return fallback;
}
