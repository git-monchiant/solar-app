// Huawei ESCP warranty fetcher.
//
// Reverse-engineered from the public wechat warranty portal
// (https://app.huawei.com/escpportal/pub/wechat.html). Given an inverter/device
// serial number it returns the warranty record + the official warranty
// certificate PDF that the portal generates.
//
// The portal gates every query behind a 4-digit numeric captcha. We solve it
// automatically with the same Gemini Vision pipeline used elsewhere in the app
// (gemini-2.5-flash, GEMINI_API_KEY). The captcha value is bound to the session
// cookie (escp_portal_client_id, issued when the captcha image is fetched), so
// all requests share one cookie jar.
//
// Flow:  session -> captcha image -> Gemini OCR -> captchaValidate
//        -> findHardWareVyborgForWeb (warranty data)
//        -> findBatchId -> generatedDocument -> findEdocid -> downloadPdf

const BASE = "https://app.huawei.com/escpportal";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const REFERER = `${BASE}/pub/wechat.html?Language=EN&buType=2&maxSnNumber=500`;
const CAPTCHA_ATTEMPTS = 5;

export interface HuaweiWarrantyInfo {
  sn: string;
  model: string;                  // e.g. "SUN2000-5KTL-L1"
  description: string;            // e.g. "Inverter,SUN2000-5KTL-L1,Solar Inverter"
  servicePackage: string;         // e.g. "PV Basic Warranty"
  startDate: string;              // "YYYY/MM/DD" as returned by Huawei
  endDate: string;                // "YYYY/MM/DD"
  advancedWarrantyStatus: string; // "-" when none
  pdfAvailable: boolean;          // portal exposes a certificate PDF
}

export interface HuaweiWarrantyResult {
  // null when the SN is unknown to Huawei (empty result set).
  info: HuaweiWarrantyInfo | null;
  // The certificate PDF bytes, when one could be generated.
  pdf: Buffer | null;
}

// ---- raw Huawei API shapes --------------------------------------------------
interface HardwareRow {
  barcode: string;
  snModel: string | null;
  servicePackage: string | null;
  startDate: string | null;
  endDate: string | null;
  itemDescription_EN: string | null;
  advancedWarrantyStatusName: string | null;
  pdfFlag: string | null;          // "Y" / "N"
  contractNo: string | null;
  endCustomerName: string | null;
  lifePower: string | null;
}

// ---- minimal cookie jar -----------------------------------------------------
type Jar = Map<string, string>;

function applySetCookie(jar: Jar, res: Response): void {
  // getSetCookie() is the only way to read multiple Set-Cookie headers; it
  // lives on undici's Headers (Node 18.7+) but isn't in the DOM lib types.
  const getter = (res.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie?.bind(res.headers);
  const cookies = getter ? getter() : [];
  for (const c of cookies) {
    const pair = c.split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

function cookieHeader(jar: Jar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function hreq(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    // Next.js patches global fetch with caching — opt out so the session,
    // captcha and query responses are never served stale.
    cache: "no-store",
    headers: {
      "User-Agent": UA,
      Referer: REFERER,
      "X-Requested-With": "XMLHttpRequest",
      ...(jar.size ? { Cookie: cookieHeader(jar) } : {}),
      ...(init.headers || {}),
    },
  });
  applySetCookie(jar, res);
  return res;
}

// ---- captcha (Gemini Vision) ------------------------------------------------
async function solveCaptchaWithGemini(jpeg: Buffer): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  const base64 = jpeg.toString("base64");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt =
    "This image is a CAPTCHA showing exactly 4 digits (0-9). " +
    "Read the four digits left to right. " +
    "Return ONLY the 4 digits, no spaces, no words. Example: 2873";
  const res = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64 } }] }],
      generationConfig: { temperature: 0 },
    }),
  });
  const data: {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { code?: number; message?: string };
  } = await res.json();
  if (data.error) {
    console.error("[huawei-warranty] Gemini captcha error:", data.error);
    return null;
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("[huawei-warranty] captcha Gemini raw:", text);
  const digits = (text.match(/\d/g) || []).join("");
  return digits.length >= 4 ? digits.slice(0, 4) : digits || null;
}

// Open a session, then fetch/solve/validate a captcha until one is accepted.
// Returns the validated paramCode (the captcha digits) or null.
async function getValidatedCaptcha(jar: Jar): Promise<string | null> {
  for (let attempt = 1; attempt <= CAPTCHA_ATTEMPTS; attempt++) {
    const img = await hreq(jar, `${BASE}/servlet/captcha?yzm=${Date.now()}`);
    const buf = Buffer.from(await img.arrayBuffer()); // also sets escp_portal_client_id
    const code = await solveCaptchaWithGemini(buf);
    if (!code) continue;
    const v = await hreq(jar, `${BASE}/servlet/captchaValidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Origin: "https://app.huawei.com",
      },
      body: `paramCode=${encodeURIComponent(code)}`,
    });
    const txt = (await v.text()).trim();
    console.log(`[huawei-warranty] captcha attempt ${attempt}: "${code}" -> ${txt}`);
    if (txt === "yes") return code;
  }
  return null;
}

// ---- warranty query + PDF generation ---------------------------------------
async function queryHardware(jar: Jar, sn: string, code: string): Promise<HardwareRow[]> {
  const url =
    `${BASE}/services/portal/vyborgTask/findHardWareVyborgForWeb?page=Y` +
    `&barcode=${encodeURIComponent(sn)}&language=en&source=escp&userIp=` +
    `&buType=2&paramCode=${code}&_=${Date.now()}`;
  const r = await hreq(jar, url, { headers: { "Content-Type": "application/json" } });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? (j as HardwareRow[]) : [];
}

async function generatePdf(jar: Jar, row: HardwareRow): Promise<Buffer> {
  const batchId = (
    await (await hreq(jar, `${BASE}/services/portal/vyborgTask/findBatchId`)).text()
  ).trim();
  const payload = [{
    sn: row.barcode,
    signedAccount: row.endCustomerName || "",
    batchId,
    lang: "EN",
    contractNo: row.contractNo || "",
    serviceStart: (row.startDate || "").replaceAll("/", "-"),
    serviceEnd: (row.endDate || "").replaceAll("/", "-"),
    servicePackage: row.servicePackage || "",
    customerName: "",
    plantName: "",
    plantAddress: "",
    itemModel: row.snModel || "",
    lifePower: row.lifePower || "",
  }];
  await hreq(jar, `${BASE}/services/portal/vyborgTask/generatedDocument`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://app.huawei.com" },
    body: JSON.stringify(payload),
  });
  // The edoc is generated asynchronously — poll for FILEEDOCID then download.
  for (let i = 0; i < 15; i++) {
    const r = await hreq(jar, `${BASE}/services/portal/vyborgTask/findEdocid/${batchId}`);
    const j: { FILEEDOCID?: string } = await r.json().catch(() => ({}));
    if (j.FILEEDOCID) {
      const pdf = await hreq(jar, `${BASE}/servlet/downloadPdf?edocId=${j.FILEEDOCID}`);
      return Buffer.from(await pdf.arrayBuffer());
    }
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error("Huawei did not return an edocId for the warranty document");
}

function mapInfo(row: HardwareRow, sn: string): HuaweiWarrantyInfo {
  return {
    sn,
    model: row.snModel || "",
    description: row.itemDescription_EN || "",
    servicePackage: row.servicePackage || "",
    startDate: row.startDate || "",
    endDate: row.endDate || "",
    advancedWarrantyStatus: row.advancedWarrantyStatusName || "",
    pdfAvailable: row.pdfFlag === "Y",
  };
}

/**
 * Fetch the Huawei warranty record + certificate PDF for a device serial number.
 *
 * @param serialNo  The inverter/device barcode (e.g. "HV2440054046").
 * @returns `info` is null when the SN is unknown to Huawei. `pdf` is null when
 *          no certificate is available or generation failed (info is still
 *          returned in that case).
 * @throws  When a session/captcha could not be established at all.
 */
export async function fetchHuaweiWarranty(serialNo: string): Promise<HuaweiWarrantyResult> {
  const sn = serialNo.trim();
  if (!sn) throw new Error("serial number is required");

  const jar: Jar = new Map();
  await hreq(jar, REFERER); // open session (sets the session cookie)

  const code = await getValidatedCaptcha(jar);
  if (!code) throw new Error("ไม่สามารถแก้ captcha ของ Huawei ได้ (ลองใหม่อีกครั้ง)");

  const rows = await queryHardware(jar, sn, code);
  if (rows.length === 0) return { info: null, pdf: null };

  const row = rows[0];
  const info = mapInfo(row, sn);

  let pdf: Buffer | null = null;
  if (row.pdfFlag === "Y") {
    pdf = await generatePdf(jar, row).catch((e) => {
      console.error("[huawei-warranty] PDF generation failed:", e);
      return null;
    });
  }
  return { info, pdf };
}
