import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { ensureFirstContactSla } from "@/lib/sla-service";

// POST /api/v1/inbound/website-lead
//
// Inbound webhook for lead capture from senasolarenergy.com website form
// (and any future 3rd-party form provider). Payload mirrors the sheet we
// pull from — anything we can map to a schema column lands there; the
// tracking/marketing/consent tail is stashed verbatim in
// leads.webform_meta (JSON blob) so nothing gets dropped.
//
// Auth: static API key in `Authorization: Bearer <key>` header, OR
// `?key=<key>` query param. Key lives in `SENA_IDEA_API_KEY` env var
// (shared with /api/v1/bi/leads read endpoint).
//
// Every submission → new lead row. No dedup at inbound: each webform hit
// is a distinct marketing touchpoint (different UTM/session/consent) and
// sales dedupes downstream via the leads UI. The same phone submitting
// twice from two campaigns is a signal, not a bug.
//
// Response:
//   { ok: true, lead_id: <n>, status: 'created' }
//
// Not deployed to prod yet — dev only until BI/marketing team validates.

export const runtime = "nodejs";

function unauthorized(msg: string) {
  return NextResponse.json({ error: msg }, { status: 401 });
}

// ─── Field maps ────────────────────────────────────────────────────────
// Sheet enum → our schema enum. Keep in sync with info-labels.ts.

const CUSTOMER_TYPE_MAP: Record<string, string> = {
  solar_home: "new",
  residence: "new",
  "ที่พักอาศัย": "new",
  business: "new",
  "ธุรกิจและอุตสาหกรรมโรงงาน": "new",
};

// เลือกระบบ → pre_wants_battery (matches BATTERY_INTEREST_LABEL keys)
const SYSTEM_TYPE_MAP: Record<string, string> = {
  solar_ongrid: "no",
  solar_battery: "yes",
  solar_recommend: "maybe",
};

// รูปแบบสำรองไฟ → wants_battery
const BACKUP_MAP: Record<string, string> = {
  "ต้องการ": "yes",
  "ไม่ต้องการ": "no",
  "ยังไม่แน่ใจ": "maybe",
  yes: "yes",
  no: "no",
  maybe: "maybe",
};

const RESIDENCE_MAP: Record<string, string> = {
  "บ้านเดี่ยว": "detached",
  "ทาวน์เฮาส์/ทาวน์โฮม": "townhome",
  "ทาวน์โฮม": "townhome",
  "ทาวน์เฮาส์": "townhouse",
  "บ้านแฝด": "semi_detached",
  "อาคารพาณิชย์": "shophouse",
  "โฮมออฟฟิศ": "home_office",
  detached: "detached",
  townhome: "townhome",
  townhouse: "townhouse",
  semi_detached: "semi_detached",
  shophouse: "shophouse",
  home_office: "home_office",
};

// ค่าไฟต่อเดือน string → MAX of range in baht (upper bound). Sheet uses
// inconsistent separators ("1,000 - 3,000" vs "3,000-5,000") — we don't
// need the regex to know which; just pull every number and take the max.
// "น้อยกว่า 3,000" → 3000 (max num in text)
// "1,000 - 3,000"  → 3000
// "5,000-10,000"   → 10000
// "มากกว่า 10,000" → 10000
function parseMonthlyBill(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const nums = String(raw)
    .replace(/,/g, "")
    .match(/\d+/g)
    ?.map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums || nums.length === 0) return null;
  return Math.max(...nums);
}

// เบอร์โทรศัพท์ "(090) 000-0000" → "0900000000". Preserve leading 0.
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 9) return null;
  return digits.slice(-10); // handle "+66" prefix by keeping last 10
}

// Parse package code like "solar_ongrid_3kwp" / "solar_battery_5kwp_1-phase"
// into { kwp, has_battery, phase }. phase is int (1 or 3) — packages.phase
// is stored as int in the schema.
function parsePackageCode(code: string | null | undefined): {
  kwp: number | null;
  has_battery: boolean;
  phase: number | null;
} {
  if (!code) return { kwp: null, has_battery: false, phase: null };
  const has_battery = /battery/i.test(code);
  const kwpMatch = code.match(/(\d+(?:\.\d+)?)\s*kwp/i);
  const kwp = kwpMatch ? parseFloat(kwpMatch[1]) : null;
  const phaseMatch = code.match(/(\d)[-_]phase/i);
  const phase = phaseMatch ? parseInt(phaseMatch[1], 10) : null;
  return { kwp, has_battery, phase };
}

// ช่วงเวลาที่สะดวกให้ติดต่อ → normalized code (stored in webform_meta and
// prepended to note).
function parseContactTime(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/เช้า/.test(s)) return "morning";
  if (/บ่าย/.test(s)) return "afternoon";
  if (/เย็น|ค่ำ/.test(s)) return "evening";
  return null;
}

// ─── Package lookup ────────────────────────────────────────────────────
async function findPackageId(
  db: sql.ConnectionPool,
  code: string | null | undefined
): Promise<number | null> {
  if (!code) return null;
  const { kwp, has_battery, phase } = parsePackageCode(code);
  if (kwp == null) return null;
  const r = await db
    .request()
    .input("kwp", sql.Decimal(5, 1), kwp)
    .input("has_battery", sql.Bit, has_battery ? 1 : 0)
    .input("phase", sql.Int, phase)
    .query(`
      SELECT TOP 1 id FROM packages
      WHERE is_active = 1
        AND kwp = @kwp
        AND has_battery = @has_battery
        AND (@phase IS NULL OR phase = @phase)
        AND is_upgrade = 0
      ORDER BY start_date DESC
    `);
  return r.recordset[0]?.id ?? null;
}

// ─── Handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth — shared SENA_IDEA_API_KEY (same key as /api/v1/bi/leads).
  const expected = process.env.SENA_IDEA_API_KEY;
  if (!expected) {
    return NextResponse.json({ error: "SENA_IDEA_API_KEY not configured" }, { status: 500 });
  }
  const header = req.headers.get("authorization") || "";
  const [scheme, headerToken] = header.split(" ");
  const queryToken = req.nextUrl.searchParams.get("key");
  const token = (scheme === "Bearer" ? headerToken : "") || queryToken || "";
  if (!token) return unauthorized("Missing token");
  if (token !== expected) return unauthorized("Invalid token");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept both snake_case English and raw Thai sheet keys. English wins.
  const g = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = body[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return null;
  };

  const fullName = g("full_name", "name", "ชื่อ - นามสกุล");
  const phone = normalizePhone(g("phone", "เบอร์โทรศัพท์"));
  const email = g("email", "อีเมล");
  const lineId = g("line_id", "lineId", "Line ID");
  const province = g("province", "installation_address", "จังหวัด / พื้นที่ติดตั้ง");
  const noteBody = g("note", "message", "ข้อความเพิ่มเติม (ถ้ามี)");

  const customerTypeRaw = g("customer_type", "เลือกประเภทการใช้งาน");
  const customerType = customerTypeRaw ? CUSTOMER_TYPE_MAP[customerTypeRaw] ?? "new" : "new";

  const systemTypeRaw = g("system_type", "เลือกระบบที่เหมาะกับคุณ");
  // Fold the sheet's "เลือกระบบ" into wants_battery if the explicit
  // "backup power" question wasn't answered — solar_battery implies yes,
  // solar_ongrid implies no, solar_recommend implies maybe.
  const systemImpliedBattery = systemTypeRaw ? SYSTEM_TYPE_MAP[systemTypeRaw] ?? null : null;

  const packageCode =
    g("package_code", "เลือกแพคเกจที่เหมาะกับคุณ", "เลือกแพคเกจ ที่เหมาะกับคุณ") ?? null;

  const monthlyBillRaw = g("monthly_bill", "ค่าไฟต่อเดือน");
  const monthlyBill = parseMonthlyBill(monthlyBillRaw);

  const residenceRaw = g("residence_type", "ประเภทที่อยู่อาศัย");
  const residenceType = residenceRaw ? RESIDENCE_MAP[residenceRaw] ?? null : null;

  const backupRaw = g("wants_battery", "backup_power", "ต้องการสำรองไฟหรือไม่");
  const wantsBattery = (backupRaw ? BACKUP_MAP[backupRaw] ?? null : null) ?? systemImpliedBattery;

  const contactTimeRaw = g("contact_time", "ช่วงเวลาที่สะดวกให้ติดต่อ");
  const contactTimeCode = parseContactTime(contactTimeRaw);

  const hasEv = g("has_ev", "มีรถ EV หรือไม่");

  // Source — the caller may tag the lead with its own channel code (a partner
  // site, a specific campaign, etc.). Defaults to web_sena when the field is
  // absent OR blank, so existing callers that never send it keep working
  // exactly as before. Capped at the column's 50-char limit to avoid a SQL
  // overflow; no whitelist needed because the UI's normalizeSourceKey already
  // folds any unrecognised value to the grey "อื่นๆ" chip instead of erroring.
  const sourceRaw = g("source", "Source", "ที่มา");
  const source = sourceRaw ? sourceRaw.slice(0, 50) : "web_sena";

  // External referrer id — a partner system's referrer/agent code. Purely
  // optional: a caller (e.g. the current website) that doesn't send it gets
  // NULL and behaves exactly as before, so no web-side code change is forced.
  // Capped at the column's 50-char limit to avoid a SQL overflow.
  const referExternalIdRaw = g("refer_external_id", "refer_id", "referral_id", "Refer Id");
  const referExternalId = referExternalIdRaw ? referExternalIdRaw.slice(0, 50) : null;

  // Basic validation
  if (!fullName) return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "valid phone is required" }, { status: 400 });

  // Compose note: prepend contact-time hint + EV hint so sales sees them
  // even without opening webform_meta.
  const noteParts: string[] = [];
  if (contactTimeRaw) noteParts.push(`สะดวกติดต่อ: ${contactTimeRaw}`);
  if (hasEv && hasEv !== "ไม่มี") noteParts.push(`EV: ${hasEv}`);
  if (noteBody) noteParts.push(noteBody);
  const note = noteParts.length > 0 ? noteParts.join(" | ") : null;

  // webform_meta — everything the schema can't hold. Include the raw
  // payload so we can reconstruct/re-parse later if the mapping changes.
  const webformMeta = {
    received_at: new Date().toISOString(),
    external: {
      entry_id: g("entry_id", "Entry Id"),
      created_by_user_id: g("created_by", "Created By (User Id)"),
      entry_date: g("entry_date", "Entry Date"),
      date_updated: g("date_updated", "Date Updated"),
    },
    tracking: {
      source_url: g("source_url", "Source Url"),
      previous_page: g("previous_page", "Previous Page"),
      utm_source: g("utm_source", "UTM Source"),
      utm_medium: g("utm_medium", "UTM Medium"),
      utm_content: g("utm_content", "UTM Content"),
      utm_term: g("utm_term", "UTM Term"),
      utm_campaign: g("utm_campaign", "UTM Campaign"),
      gclid: g("gclid"),
    },
    facebook: {
      fbp: g("fbp"),
      fbc: g("fbc"),
      fbclid: g("fbclid"),
      campaign_id: g("campaign_id"),
      adset_id: g("adset_id"),
      ad_id: g("ad_id"),
    },
    capi: {
      client_ip_address: g("client_ip_address"),
      client_user_agent: g("client_user_agent"),
      event_source_url: g("event_source_url"),
      event_name: g("event_name"),
      event_time: g("event_time"),
      event_id: g("event_id"),
    },
    session: {
      user_agent: g("user_agent", "User Agent"),
      user_ip: g("user_ip", "User IP"),
    },
    consent: {
      consent: g("consent", "Consent (Consent)"),
      text: g("consent_text", "Consent (Text)"),
      description: g("consent_description", "Consent (Description)"),
    },
    parsed: {
      package_code_raw: packageCode,
      contact_time_code: contactTimeCode,
    },
    raw: body,
  };

  // `source` resolved above (caller-supplied, else web_sena). UTM/gclid/fbclid
  // still live in webform_meta so we don't fan them out into source.
  try {
    const db = await getDb();

    // Package lookup — parse "solar_ongrid_5kwp" style code into
    // kwp/has_battery/phase and pick the matching active package.
    const interestedPackageId = await findPackageId(db, packageCode);

    // 3. Insert leads. The webform's "เลือกระบบ" (solar_ongrid/battery/
    //    recommend) is captured via lead_data.wants_battery below, not via
    //    leads.pre_wants_battery — that column tracks the presurvey step's
    //    upgrade decision and isn't relevant at capture time.
    const ins = await db
      .request()
      .input("full_name", sql.NVarChar(200), fullName)
      .input("phone", sql.NVarChar(20), phone)
      .input("email", sql.NVarChar(200), email)
      .input("line_id", sql.NVarChar(100), lineId)
      .input("installation_address", sql.NVarChar(500), province)
      .input("customer_type", sql.NVarChar(20), customerType)
      .input("interested_package_id", sql.Int, interestedPackageId)
      .input("source", sql.NVarChar(50), source)
      .input("refer_external_id", sql.NVarChar(50), referExternalId)
      .input("note", sql.NVarChar(sql.MAX), note)
      .input("webform_meta", sql.NVarChar(sql.MAX), JSON.stringify(webformMeta))
      .query(`
        INSERT INTO leads (
          full_name, phone, email, line_id, installation_address,
          customer_type, interested_package_id, source, refer_external_id, note,
          webform_meta, status
        )
        OUTPUT INSERTED.id
        VALUES (
          @full_name, @phone, @email, @line_id, @installation_address,
          @customer_type, @interested_package_id, @source, @refer_external_id, @note,
          @webform_meta, 'pre_survey'
        )
      `);
    const leadId = ins.recordset[0].id as number;

    // 4. lead_data — questionnaire §2 fields
    await db
      .request()
      .input("lead_id", sql.Int, leadId)
      .input("residence_type", sql.NVarChar(50), residenceType)
      .input("monthly_bill", sql.Decimal(10, 2), monthlyBill)
      .input("wants_battery", sql.NVarChar(50), wantsBattery)
      .query(`
        INSERT INTO lead_data (lead_id, residence_type, monthly_bill, wants_battery)
        VALUES (@lead_id, @residence_type, @monthly_bill, @wants_battery)
      `);

    // 5. Activity — mark lead created via inbound webhook.
    await db
      .request()
      .input("lead_id", sql.Int, leadId)
      .input("source", sql.NVarChar(50), source)
      .input("note", sql.NVarChar(sql.MAX), note)
      .query(
        `INSERT INTO lead_activities (lead_id, activity_type, title, note)
         VALUES (@lead_id, 'lead_created', 'Lead created (' + @source + ')', @note)`
      );

    await ensureFirstContactSla(db, leadId);

    // Response — enough for the caller to (a) confirm the lead landed,
    // (b) get our internal id for correlation, (c) reflect what we
    // parsed from their payload so they can verify our interpretation.
    return NextResponse.json({
      ok: true,
      status: "created",
      lead_id: leadId,
      received_at: webformMeta.received_at,
      parsed: {
        full_name: fullName,
        phone,
        email,
        line_id: lineId,
        installation_address: province,
        customer_type: customerType,
        interested_package_id: interestedPackageId,
        source,
        refer_external_id: referExternalId,
        residence_type: residenceType,
        monthly_bill_max: monthlyBill,
        wants_battery: wantsBattery,
        contact_time: contactTimeCode,
        has_ev: hasEv,
        external_entry_id: webformMeta.external.entry_id,
      },
    });
  } catch (e) {
    console.error("POST /api/v1/inbound/website-lead error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
