import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, getDb, sql } from "@/lib/db";
import { slaLiveBreachedAtSql, slaLiveStatusSql } from "@/lib/lead-sla-sql";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  try {
    const { id } = await params;
    const leadId = Number.parseInt(id, 10);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
    }

    const db = await getDb();
    const lead = await db.request().input("lead_id", sql.Int, leadId)
      .query("SELECT TOP 1 id FROM leads WHERE id = @lead_id");
    if (lead.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Keep the timeline consistent with the latest durable workflow milestones.
    // อ่านอย่างเดียว ไม่ sync — ดูเหตุผลใน /api/leads/[id] GET

    const result = await db.request().input("lead_id", sql.Int, leadId).query(`
      SELECT si.id, si.policy_code, si.policy_version, si.instance_key,
             si.task_name, si.owner_user_id,
             COALESCE(si.owner_role,
               CASE WHEN si.policy_code IN ('SITE_SURVEY','INSTALLATION') THEN 'solar' ELSE 'sales' END
             ) AS owner_role,
             si.started_at, si.target_at, si.due_at, si.warning_at,
             ${slaLiveStatusSql("si")} AS status, si.completed_at, ${slaLiveBreachedAtSql("si")} AS breached_at, si.superseded_at,
             si.created_at, si.updated_at,
             u.full_name AS owner_name,
             p.name_th AS policy_name
      FROM lead_sla_instances si
      LEFT JOIN users u ON u.id = si.owner_user_id
      LEFT JOIN sla_policies p
        ON p.policy_code = si.policy_code AND p.version = si.policy_version
      WHERE si.lead_id = @lead_id
        AND si.superseded_at IS NULL
        AND si.status <> 'superseded'
      ORDER BY si.started_at ASC, si.due_at ASC, si.id ASC
    `);

    // แคตตาล็อกนโยบายที่ยังใช้อยู่ — แท็บ SLA Tracking ต้องโชว์ครบทุกขั้นตอน
    // แม้ขั้นที่ lead รายนี้ยังไม่เริ่ม จึงต้องรู้ "SLA ให้กี่วัน" จากนโยบายโดยตรง
    // ไม่ใช่จาก instance ที่ยังไม่มี
    const policies = await db.request().query(`
      SELECT policy_code, version, name_th, target_minutes, warning_minutes, deadline_rule, config_json
      FROM sla_policies WHERE is_active = 1
    `);

    return NextResponse.json({
      items: fixDates(result.recordset),
      policies: policies.recordset,
    });
  } catch (error) {
    console.error("GET /api/leads/[id]/sla error:", error);
    return NextResponse.json({ error: "Failed to fetch Lead SLA timeline" }, { status: 500 });
  }
}
