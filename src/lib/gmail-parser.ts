// Parser for Sena Solar website lead-registration emails (forwarded by web
// form). Two formats are observed:
//   A) compact: "ชื่อ - นามสกุล", "อีเมล", "เบอร์โทรศัพท์", ...
//   B) full assessment: "ชื่อ" / "นามสกุล" separately, "อีเมล์", many calc fields.

const LABELS = [
  { key: "full_name_combined", re: /ชื่อ\s*[-–]\s*นามสกุล/ },
  { key: "first_name",         re: /(?:^|\s)ชื่อ(?!\s*[-–])/ },
  { key: "last_name",          re: /นามสกุล/ },
  { key: "email",              re: /อีเมล[์]?/ },
  { key: "phone",              re: /เบอร์โทรศัพท์/ },
  { key: "province",           re: /ที่อยู่ตามจังหวัด|จังหวัด\s*\/?\s*เขต/ },
  { key: "address",            re: /(?<!ตาม)ที่อยู่(?!ตาม)/ },
  { key: "residence",          re: /ประเภทที่อยู่อาศัย|ประเภทบ้าน/ },
  { key: "monthly_bill",       re: /(?:บิล)?ค่าไฟต่อเดือน[^&]*?(?=&|\s)/ },
  { key: "roof_shape",         re: /รูปแบบหลังคา|ทรงหลังคา/ },
  { key: "roof_material",      re: /ประเภทหลังคา/ },
];

export type ParsedLead = {
  full_name: string;
  phone: string;
  email: string | null;
  province: string | null;
  residence: string | null;
  monthly_bill: number | null;
  roof_shape: string | null;
};

export function parseRegistrationEmail(rawBody: string): ParsedLead {
  const after = rawBody.replace(/^[\s\S]*?(?:กรอกข้อมูลเพื่อรับข้อเสนอพิเศษ|รายละเอียดดังนี้)\s*/, "").trim();
  const isFormatA = /ชื่อ\s*[-–]\s*นามสกุล/.test(after);
  const labels = isFormatA
    ? LABELS.filter((l) => !["first_name", "last_name"].includes(l.key))
    : LABELS.filter((l) => l.key !== "full_name_combined");

  const matches = labels.map((l) => {
    const m = after.match(l.re);
    return { key: l.key, idx: m ? m.index! : -1, end: m ? m.index! + m[0].length : -1 };
  }).filter((m) => m.idx >= 0).sort((a, b) => a.idx - b.idx);

  const fields: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const next = matches[i + 1];
    const raw = after.slice(cur.end, next ? next.idx : after.length).trim();
    if (!fields[cur.key]) fields[cur.key] = raw;
  }
  if (!fields.full_name_combined && fields.first_name) {
    fields.full_name_combined = `${fields.first_name || ""} ${fields.last_name || ""}`.trim();
  }

  const phoneMatch = after.match(/\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
  const emailMatch = after.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);

  const provinceRaw = (fields.province || "").trim();
  const provincePicked = provinceRaw.match(/จังหวัด\s*:\s*([^\s]+)/);
  const province = (provincePicked ? provincePicked[1] : provinceRaw).trim();

  const phoneDigits = (phoneMatch?.[0] || fields.phone || "").replace(/[^0-9]/g, "");
  const phone = phoneDigits.startsWith("0") ? phoneDigits.slice(0, 10) : phoneDigits.slice(0, 10);

  const billNumbers = (fields.monthly_bill || "").match(/[\d,]+/g)?.map((n) => parseInt(n.replace(/,/g, ""))).filter((n) => !isNaN(n)) ?? [];
  const monthlyBill = billNumbers.length ? Math.round(billNumbers.reduce((a, b) => a + b, 0) / billNumbers.length) : null;

  return {
    full_name: (fields.full_name_combined || "").trim(),
    phone,
    email: (emailMatch?.[0] || fields.email || "").trim().replace(/^[^\w]+/, "") || null,
    province: province || null,
    residence: (fields.residence || "").trim() || null,
    monthly_bill: monthlyBill,
    roof_shape: (fields.roof_shape || "").trim() || null,
  };
}

export function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

type Part = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: Part[] | null;
};

export function extractEmailBody(payload: Part | undefined | null): string {
  if (!payload) return "";
  const stack: Part[] = [payload];
  let html = "";
  while (stack.length) {
    const p = stack.pop()!;
    if (p.mimeType === "text/plain" && p.body?.data) return decodeBase64Url(p.body.data);
    if (p.mimeType === "text/html" && p.body?.data && !html) html = decodeBase64Url(p.body.data);
    if (p.parts) stack.push(...p.parts);
  }
  return html
    ? html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}
