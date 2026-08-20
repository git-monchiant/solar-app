import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, getDb, sql } from "@/lib/db";
import { syncOperationalSlas } from "@/lib/sla-service";

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
    // This operation is idempotent and also reopens/cancels tasks after rollback.
    await syncOperationalSlas(db, leadId, gate.userId);

    const result = await db.request().input("lead_id", sql.Int, leadId).query(`
      SELECT si.id, si.policy_code, si.policy_version, si.instance_key,
             si.task_name, si.owner_user_id,
             COALESCE(si.owner_role,
               CASE WHEN si.policy_code IN ('SITE_SURVEY','INSTALLATION') THEN 'solar' ELSE 'sales' END
             ) AS owner_role,
             si.started_at, si.target_at, si.due_at, si.warning_at,
             si.status, si.completed_at, si.breached_at, si.superseded_at,
             si.created_at, si.updated_at,
             u.full_name AS owner_name,
             p.name_th AS policy_name
      FROM lead_sla_instances si
      LEFT JOIN users u ON u.id = si.owner_user_id
      LEFT JOIN sla_policies p
        ON p.policy_code = si.policy_code AND p.version = si.policy_version
      WHERE si.lead_id = @lead_id
      ORDER BY si.started_at ASC, si.due_at ASC, si.id ASC
    `);

    return NextResponse.json({ items: fixDates(result.recordset) });
  } catch (error) {
    console.error("GET /api/leads/[id]/sla error:", error);
    return NextResponse.json({ error: "Failed to fetch Lead SLA timeline" }, { status: 500 });
  }
}
