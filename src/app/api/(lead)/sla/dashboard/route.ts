import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates, sql } from "@/lib/db";
import { requireAnyActiveRole } from "@/lib/auth";
import { refreshOpenSlaStates } from "@/lib/sla-service";

type SlaOpenStatus = "active" | "warning" | "critical" | "breached";

export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, ["admin", "sales", "sales_sup", "solar", "solar_sup"]);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    await refreshOpenSlaStates(db);
    const isAdmin = gate.roles.includes("admin");
    const isSalesSup = gate.roles.includes("sales_sup");
    const isSolarSup = gate.roles.includes("solar_sup");
    const isSales = gate.roles.includes("sales");
    const isSolar = gate.roles.includes("solar");
    // Managers need end-to-end visibility across the Sales → Solar handoff.
    // Mutation permissions remain enforced separately by the action endpoints.
    const canSeeAll = isAdmin || isSalesSup || isSolarSup;
    const result = await db.request()
      .input("user_id", sql.Int, gate.userId)
      .input("can_see_all", sql.Bit, canSeeAll ? 1 : 0)
      .input("is_sales", sql.Bit, isSales ? 1 : 0)
      .input("is_solar", sql.Bit, isSolar ? 1 : 0)
      .query(`
        SELECT si.id, si.lead_id, si.policy_code, si.task_name, si.status,
               si.started_at, si.target_at, si.due_at, si.owner_user_id,
               COALESCE(si.owner_role, CASE WHEN si.policy_code IN ('SITE_SURVEY','INSTALLATION') THEN 'solar' ELSE 'sales' END) owner_role,
               l.full_name, l.phone, l.customer_grade, l.source,
               u.full_name AS owner_name
        FROM lead_sla_instances si
        JOIN leads l ON l.id = si.lead_id
        LEFT JOIN users u ON u.id = si.owner_user_id
        WHERE si.status IN ('active','warning','critical','breached')
          AND si.superseded_at IS NULL
          AND (
            @can_see_all = 1
            OR (
              COALESCE(si.owner_role, CASE WHEN si.policy_code IN ('SITE_SURVEY','INSTALLATION') THEN 'solar' ELSE 'sales' END) = 'sales'
              AND @is_sales = 1
              AND (si.owner_user_id = @user_id OR si.owner_user_id IS NULL)
            )
            OR (
              COALESCE(si.owner_role, CASE WHEN si.policy_code IN ('SITE_SURVEY','INSTALLATION') THEN 'solar' ELSE 'sales' END) = 'solar'
              AND @is_solar = 1
              AND (si.owner_user_id = @user_id OR si.owner_user_id IS NULL)
            )
          )
        ORDER BY CASE si.status WHEN 'breached' THEN 0 WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
                 si.due_at ASC
      `);
    const items = fixDates(result.recordset);
    const counts = items.reduce((acc: Record<string, number>, row: Record<string, unknown>) => {
      const key = String(row.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { active: 0, warning: 0, critical: 0, breached: 0 });
    const leadIdsByStatus: Record<SlaOpenStatus, Set<number>> = {
      active: new Set<number>(),
      warning: new Set<number>(),
      critical: new Set<number>(),
      breached: new Set<number>(),
    };
    for (const row of items as Array<{ lead_id: number; status: SlaOpenStatus }>) {
      leadIdsByStatus[row.status].add(row.lead_id);
    }
    const leadCounts: Record<SlaOpenStatus, number> & { near_due: number } = {
      active: leadIdsByStatus.active.size,
      warning: leadIdsByStatus.warning.size,
      critical: leadIdsByStatus.critical.size,
      breached: leadIdsByStatus.breached.size,
      near_due: new Set([...leadIdsByStatus.warning, ...leadIdsByStatus.critical]).size,
    };
    return NextResponse.json({
      counts,
      leadCounts,
      items,
      scope: { isAdmin, isSalesSup, isSolarSup, isSales, isSolar, canSeeAll, userId: gate.userId },
    });
  } catch (error) {
    console.error("GET /api/sla/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch SLA dashboard" }, { status: 500 });
  }
}
