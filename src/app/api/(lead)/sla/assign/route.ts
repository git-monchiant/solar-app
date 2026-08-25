import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAnyActiveRole } from "@/lib/auth";
import { syncOperationalSlas } from "@/lib/sla-service";
import { logLeadActivity } from "@/lib/lead-activity-log";

const SOLAR_POLICIES = new Set(["SITE_SURVEY", "INSTALLATION"]);

function parseRoles(raw: string | null): string[] {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((role): role is string => typeof role === "string") : [];
  } catch {
    return [];
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, ["admin", "solar", "solar_sup"]);
  if (gate.error) return gate.error;

  try {
    const body = await req.json();
    const instanceId = Number(body.instance_id);
    const requestedUserId = body.user_id === null ? null : Number(body.user_id);
    if (!Number.isInteger(instanceId) || instanceId <= 0 || (requestedUserId !== null && (!Number.isInteger(requestedUserId) || requestedUserId <= 0))) {
      return NextResponse.json({ error: "instance_id หรือ user_id ไม่ถูกต้อง" }, { status: 400 });
    }

    const db = await getDb();
    const found = await db.request().input("id", sql.BigInt, instanceId).query(`
      SELECT si.id, si.lead_id, si.policy_code, si.status, si.owner_user_id,
             l.survey_assigned_user_id, l.install_assigned_user_id
      FROM lead_sla_instances si
      JOIN leads l ON l.id = si.lead_id
      WHERE si.id = @id
        AND si.superseded_at IS NULL
        AND si.status <> 'superseded'
    `);
    const item = found.recordset[0];
    if (!item) return NextResponse.json({ error: "ไม่พบงาน SLA" }, { status: 404 });
    if (!SOLAR_POLICIES.has(item.policy_code)) {
      return NextResponse.json({ error: "มอบหมายผ่านหน้านี้ได้เฉพาะงาน Survey และ Installation" }, { status: 409 });
    }
    if (!["active", "warning", "critical", "breached"].includes(item.status)) {
      return NextResponse.json({ error: "งาน SLA นี้ปิดแล้ว" }, { status: 409 });
    }

    const canManage = gate.roles.includes("admin") || gate.roles.includes("solar_sup");
    const currentUserId = item.policy_code === "SITE_SURVEY"
      ? item.survey_assigned_user_id
      : item.install_assigned_user_id;
    if (!canManage) {
      if (requestedUserId !== gate.userId) {
        return NextResponse.json({ error: "Solar รับงานให้ตนเองได้เท่านั้น" }, { status: 403 });
      }
      if (currentUserId && Number(currentUserId) !== gate.userId) {
        return NextResponse.json({ error: "งานนี้มีผู้รับผิดชอบแล้ว" }, { status: 409 });
      }
    }

    let assigneeName: string | null = null;
    if (requestedUserId !== null) {
      const userResult = await db.request().input("user_id", sql.Int, requestedUserId).query(`
        SELECT id, full_name, roles FROM users WHERE id = @user_id AND is_active = 1
      `);
      const user = userResult.recordset[0];
      if (!user || !parseRoles(user.roles).some(role => role === "solar" || role === "solar_sup" || role === "admin")) {
        return NextResponse.json({ error: "ผู้รับผิดชอบต้องเป็นผู้ใช้ทีม Solar ที่ยังใช้งานอยู่" }, { status: 400 });
      }
      assigneeName = user.full_name;
    }

    const userField = item.policy_code === "SITE_SURVEY" ? "survey_assigned_user_id" : "install_assigned_user_id";
    const timeField = item.policy_code === "SITE_SURVEY" ? "survey_assigned_at" : "install_assigned_at";
    const update = db.request()
      .input("lead_id", sql.Int, item.lead_id)
      .input("user_id", sql.Int, requestedUserId);
    const changed = await update.query(`
      UPDATE leads
      SET ${userField} = @user_id,
          ${timeField} = CASE WHEN @user_id IS NULL THEN NULL ELSE GETDATE() END,
          updated_at = GETDATE()
      WHERE id = @lead_id${canManage ? "" : ` AND (${userField} IS NULL OR ${userField} = @user_id)`}
    `);
    if (changed.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "งานนี้มีผู้รับผิดชอบแล้ว กรุณารีเฟรชรายการ" }, { status: 409 });
    }

    await syncOperationalSlas(db, item.lead_id, gate.userId);
    const next = await db.request().input("id", sql.BigInt, instanceId).query(`
      SELECT owner_user_id, owner_role FROM lead_sla_instances WHERE id = @id
    `);
    await db.request()
      .input("instance_id", sql.BigInt, instanceId)
      .input("lead_id", sql.Int, item.lead_id)
      .input("event_key", sql.NVarChar(200), `sla-assignment:${instanceId}:${Date.now()}`)
      .input("actor_user_id", sql.Int, gate.userId)
      .input("detail_json", sql.NVarChar(sql.MAX), JSON.stringify({
        policyCode: item.policy_code,
        previousUserId: currentUserId || null,
        assignedUserId: requestedUserId,
      }))
      .query(`
        INSERT lead_sla_events(sla_instance_id, lead_id, event_type, event_key, actor_user_id, detail_json)
        VALUES(@instance_id, @lead_id, 'assigned', @event_key, @actor_user_id, @detail_json)
      `);
    await logLeadActivity(db, {
      leadId: item.lead_id,
      activityType: "sla_assignment",
      title: requestedUserId
        ? `มอบหมาย ${item.policy_code === "SITE_SURVEY" ? "งานสำรวจ" : "งานติดตั้ง"} ให้ ${assigneeName}`
        : `ยกเลิกผู้รับผิดชอบ ${item.policy_code === "SITE_SURVEY" ? "งานสำรวจ" : "งานติดตั้ง"}`,
      userId: gate.userId,
    });

    return NextResponse.json({
      ok: true,
      owner_user_id: next.recordset[0]?.owner_user_id ?? null,
      owner_role: next.recordset[0]?.owner_role ?? "solar",
      owner_name: assigneeName,
    });
  } catch (error) {
    console.error("PATCH /api/sla/assign error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "มอบหมายงานไม่สำเร็จ" }, { status: 500 });
  }
}
