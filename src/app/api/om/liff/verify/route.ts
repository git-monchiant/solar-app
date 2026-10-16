import { NextRequest, NextResponse } from "next/server";
import { authenticateLiff, readJsonBody } from "@/lib/om/liff-auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import {
  OTP_MAX_ATTEMPTS, OTP_RESEND_SEC, OTP_TTL_MIN,
  genCode, genRef, hashCode, normalizePhone, sendOtpSms,
} from "@/lib/om/otp";

// ยืนยันตัวตนลูกค้า 3 ขั้นในเส้นเดียว (step = request | confirm | link)
// รวมอยู่ในหน้า MyHome — เข้ามาไม่เจอบ้านก็ยืนยันได้เลย (ผู้ใช้ตัดสิน 27 ส.ค.)
export async function POST(req: NextRequest) {
  const body = await readJsonBody(req);
  const auth = await authenticateLiff(req, body);
  if (auth.denied) return auth.denied;
  const lineUserId = auth.identity.lineUserId;
  const db = await getOmDb();
  const step = String(body?.step || "");

  // ── ① ขอรหัส ──────────────────────────────────────────────
  if (step === "request") {
    const phone = normalizePhone(String(body?.phone || ""));
    if (!phone) return NextResponse.json({ error: "กรอกเบอร์มือถือ 10 หลัก" }, { status: 400 });

    // กันกดรัว — ต้องเว้นระยะจากคำขอล่าสุด
    const last = await db.request().input("u", sql.NVarChar(64), lineUserId)
      .query(`SELECT TOP 1 DATEDIFF(second, created_at, SYSDATETIMEOFFSET()) age
              FROM om_otp_requests WHERE line_user_id = @u ORDER BY id DESC`);
    const age = last.recordset[0]?.age;
    if (age !== undefined && age < OTP_RESEND_SEC) {
      return NextResponse.json({ error: `ขอรหัสใหม่ได้ในอีก ${OTP_RESEND_SEC - age} วินาที` }, { status: 429 });
    }

    // เบอร์นี้อยู่ในทะเบียนไหม (ลูกค้าไม่ได้เลือกบ้านเอง — ระบบเป็นคนบอก)
    const houses = await db.request().input("p", sql.NVarChar(20), phone).query(
      `SELECT COUNT(DISTINCT hc.house_id) n
       FROM om_customer_phones cp
       JOIN om_house_customers hc ON hc.customer_id = cp.customer_id AND hc.is_current = 1
       JOIN om_houses h ON h.id = hc.house_id AND h.is_om = 1
       WHERE REPLACE(REPLACE(cp.phone, '-', ''), ' ', '') = @p`);
    if (!houses.recordset[0].n) {
      // ไม่เจอ = ไม่ผ่านอัตโนมัติ ส่งเข้าคิวแอดมิน
      await db.request()
        .input("u", sql.NVarChar(64), lineUserId).input("p", sql.NVarChar(20), phone)
        .query(`INSERT INTO om_identity_requests (line_user_id, phone, kind)
                VALUES (@u, @p, 'phone_not_found')`);
      return NextResponse.json({ found: false });
    }

    const ref = genRef(), code = genCode();
    const sent = await sendOtpSms(phone, code, ref);
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });

    await db.request()
      .input("ref", sql.NVarChar(10), ref)
      .input("u", sql.NVarChar(64), lineUserId)
      .input("p", sql.NVarChar(20), phone)
      .input("h", sql.NVarChar(64), hashCode(ref, code))
      .input("via", sql.NVarChar(20), sent.via)
      .query(`INSERT INTO om_otp_requests (ref, line_user_id, phone, code_hash, expires_at, sent_via)
              VALUES (@ref, @u, @p, @h, DATEADD(minute, ${OTP_TTL_MIN}, SYSDATETIMEOFFSET()), @via)`);

    return NextResponse.json({ found: true, ref, ttl_min: OTP_TTL_MIN, dev_code: sent.devCode });
  }

  // ── ② กรอกรหัส → คืนรายการบ้านให้ลูกค้ายืนยันทีละหลัง ──────
  if (step === "confirm") {
    const ref = String(body?.ref || ""), code = String(body?.code || "").trim();
    const r = await db.request()
      .input("ref", sql.NVarChar(10), ref).input("u", sql.NVarChar(64), lineUserId)
      .query(`SELECT TOP 1 id, phone, code_hash, attempts, verified_at,
                     CASE WHEN expires_at < SYSDATETIMEOFFSET() THEN 1 ELSE 0 END expired
              FROM om_otp_requests WHERE ref = @ref AND line_user_id = @u`);
    const otp = r.recordset[0];
    if (!otp) return NextResponse.json({ error: "ไม่พบคำขอนี้" }, { status: 404 });
    if (otp.expired) return NextResponse.json({ error: "รหัสหมดอายุแล้ว กรุณาขอใหม่" }, { status: 410 });
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "กรอกผิดครบจำนวนแล้ว กรุณาขอรหัสใหม่" }, { status: 429 });
    }
    if (hashCode(ref, code) !== otp.code_hash) {
      await db.request().input("id", sql.Int, otp.id)
        .query(`UPDATE om_otp_requests SET attempts = attempts + 1 WHERE id = @id`);
      const left = OTP_MAX_ATTEMPTS - (otp.attempts + 1);
      return NextResponse.json({ error: `รหัสไม่ถูกต้อง${left > 0 ? ` (เหลือ ${left} ครั้ง)` : ""}` }, { status: 400 });
    }

    await db.request().input("id", sql.Int, otp.id)
      .query(`UPDATE om_otp_requests SET verified_at = SYSDATETIMEOFFSET() WHERE id = @id`);

    const houses = await db.request().input("p", sql.NVarChar(20), otp.phone).query(
      `SELECT DISTINCT h.id, h.house_number, p.name_th AS project_name
       FROM om_customer_phones cp
       JOIN om_house_customers hc ON hc.customer_id = cp.customer_id AND hc.is_current = 1
       JOIN om_houses h ON h.id = hc.house_id AND h.is_om = 1
       LEFT JOIN om_projects p ON p.project_id = h.project_id
       WHERE REPLACE(REPLACE(cp.phone, '-', ''), ' ', '') = @p
       ORDER BY h.house_number`);
    return NextResponse.json({ ok: true, houses: houses.recordset });
  }

  // ── ③ ลูกค้ายืนยันรายหลัง → ผูกเฉพาะที่ตอบ "ใช่" ───────────
  if (step === "link") {
    const ref = String(body?.ref || "");
    const yes: number[] = Array.isArray(body?.house_ids) ? body.house_ids.map(Number) : [];
    const no: number[] = Array.isArray(body?.rejected_ids) ? body.rejected_ids.map(Number) : [];

    const r = await db.request()
      .input("ref", sql.NVarChar(10), ref).input("u", sql.NVarChar(64), lineUserId)
      .query(`SELECT TOP 1 phone, verified_at FROM om_otp_requests WHERE ref = @ref AND line_user_id = @u`);
    const otp = r.recordset[0];
    if (!otp?.verified_at) return NextResponse.json({ error: "ยังไม่ได้ยืนยันรหัส" }, { status: 403 });

    // ★ ผูกได้เฉพาะบ้านที่เบอร์นี้เป็นเจ้าของจริง — กันส่ง house_id มั่ว
    const allowed = await db.request().input("p", sql.NVarChar(20), otp.phone).query(
      `SELECT DISTINCT hc.house_id id
       FROM om_customer_phones cp
       JOIN om_house_customers hc ON hc.customer_id = cp.customer_id AND hc.is_current = 1
       JOIN om_houses h ON h.id = hc.house_id AND h.is_om = 1
       WHERE REPLACE(REPLACE(cp.phone, '-', ''), ' ', '') = @p`);
    const allow = new Set(allowed.recordset.map((x) => x.id as number));

    for (const hid of yes.filter((h) => allow.has(h))) {
      await db.request().input("u", sql.NVarChar(64), lineUserId).input("h", sql.Int, hid)
        .query(`IF NOT EXISTS (SELECT 1 FROM om_line_user_houses WHERE line_user_id = @u AND house_id = @h)
                  INSERT INTO om_line_user_houses (line_user_id, house_id, source) VALUES (@u, @h, 'otp')`);
    }
    // ตอบ "ไม่ใช่" = ไม่ผูก + ส่งให้แอดมินตรวจทะเบียน (อาจขายต่อ/เบอร์ข้อมูลเก่า)
    for (const hid of no.filter((h) => allow.has(h))) {
      await db.request().input("u", sql.NVarChar(64), lineUserId).input("h", sql.Int, hid)
        .input("p", sql.NVarChar(20), otp.phone)
        .query(`INSERT INTO om_identity_requests (line_user_id, phone, kind, house_id)
                VALUES (@u, @p, 'not_my_house', @h)`);
    }

    const linked = yes.filter((h) => allow.has(h)).length;
    if (linked > 0) {
      await db.request().input("u", sql.NVarChar(64), lineUserId)
        .input("p", sql.NVarChar(20), otp.phone)
        .query(`UPDATE om_line_users SET identity_status = 'verified', phone = @p WHERE line_user_id = @u;
                IF @@ROWCOUNT = 0
                  INSERT INTO om_line_users (line_user_id, phone, identity_status) VALUES (@u, @p, 'verified');`);
    }
    return NextResponse.json({ ok: true, linked, reported: no.length });
  }

  return NextResponse.json({ error: "step ไม่ถูกต้อง" }, { status: 400 });
}
