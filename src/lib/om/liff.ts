"use client";

// ยกจากโปรเจกต์เดิม ~/Documents/Solar O&M/src/lib/liff.ts (ปรับ env เป็นของโมดูล O&M)
import type { Liff } from "@line/liff";

let liffInstance: Liff | null = null;
let initPromise: Promise<Liff> | null = null;

// ═══ โหมดจำลอง LIFF สำหรับตอนพัฒนา ═══
// เปิดหน้า LIFF ในเบราว์เซอร์ธรรมดาได้โดยไม่ต้องมี LINE Login channel
// ★★ ห้ามทำงานบน production เด็ดขาด — ต้องเป็น development + ตั้ง env ชัด ๆ สองตัว
const MOCK_ON =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LIFF_MOCK === "1";

function mockLiff(): Liff {
  const userId = process.env.NEXT_PUBLIC_LIFF_MOCK_USER_ID || "U_dev_mock_0000000001";
  const name = process.env.NEXT_PUBLIC_LIFF_MOCK_NAME || "ลูกค้าทดสอบ (โหมดจำลอง)";
  console.warn("[OM LIFF] ★ โหมดจำลอง — ไม่ได้ต่อ LINE จริง · userId =", userId);

  const profile = { userId, displayName: name, pictureUrl: undefined, statusMessage: undefined };
  return {
    init: async () => {},
    isLoggedIn: () => true,
    // ไม่ใช่ใน LINE app — หน้าจอที่เช็คค่านี้จะทำงานเหมือนเปิดจากเบราว์เซอร์จริง
    isInClient: () => false,
    getOS: () => "web",
    getProfile: async () => profile,
    getIDToken: () => null,
    getDecodedIDToken: () => null,
    getContext: () => ({ type: "external", userId }),
    isApiAvailable: (name: string) => name !== "sendMessages" && name !== "scanCodeV2",
    login: () => { console.warn("[OM LIFF] โหมดจำลอง — ล็อกอินอยู่แล้ว"); },
    logout: () => {},
    closeWindow: () => { console.warn("[OM LIFF] โหมดจำลอง — ปิดหน้าต่างไม่ได้ในเบราว์เซอร์"); },
    sendMessages: async () => { throw new Error("โหมดจำลอง — ส่งข้อความเข้า LINE ไม่ได้"); },
    scanCodeV2: async () => { throw new Error("โหมดจำลอง — สแกน QR ไม่ได้"); },
  } as unknown as Liff;
}

export async function initLiff(): Promise<Liff> {
  if (MOCK_ON) {
    liffInstance ??= mockLiff();
    return liffInstance;
  }
  if (liffInstance) return liffInstance;
  if (initPromise) return initPromise;

  const liffId = process.env.NEXT_PUBLIC_OM_LIFF_ID;
  if (!liffId) throw new Error("NEXT_PUBLIC_OM_LIFF_ID is not set");

  initPromise = (async () => {
    const liffModule = await import("@line/liff");
    const liff = liffModule.default;
    await liff.init({ liffId });
    liffInstance = liff;
    return liff;
  })();

  return initPromise;
}

export async function ensureLogin(): Promise<Liff> {
  const liff = await initLiff();
  if (!liff.isLoggedIn()) {
    liff.login();
    return new Promise(() => {});
  }
  return liff;
}

export async function getProfile() {
  const liff = await ensureLogin();
  return liff.getProfile();
}

export async function getIDToken() {
  const liff = await ensureLogin();
  return liff.getIDToken();
}

export async function closeLiffIfInLine(): Promise<boolean> {
  try {
    const liff = await initLiff();
    if (liff.isInClient()) {
      liff.closeWindow();
      return true;
    }
  } catch {
    /* noop */
  }
  return false;
}

// เรียก API ของ LIFF พร้อมแนบตัวตนอัตโนมัติ
// ★ ขอ id token ใหม่ทุกครั้ง (อายุสั้น หลักนาที — cache แล้วจะเจอ 401 สุ่ม)
//   `liff.getIDToken()` อ่านจากหน่วยความจำ ไม่ได้ยิงเน็ต เรียกบ่อยได้
// โหมดจำลอง token เป็น null ⇒ แนบ lineUserId ดิบแทน (เซิร์ฟเวอร์รับเฉพาะ dev)
export async function liffFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  let url = input;
  try {
    const token = await getIDToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else if (MOCK_ON) {
      const liff = await initLiff();
      const profile = await liff.getProfile();
      url += (url.includes("?") ? "&" : "?") + "lineUserId=" + encodeURIComponent(profile.userId);
    }
  } catch {
    // ยังไม่ล็อกอิน — ให้เซิร์ฟเวอร์ตัดสิน
  }
  return fetch(url, { ...init, headers, cache: "no-store" });
}
