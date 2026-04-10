import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

const statusLabels: Record<string, string> = {
  registered: "Registered", visited: "Walk-In", booked: "Booked",
  survey: "Survey", quoted: "Quotation", purchased: "Purchased",
  installed: "Installed", lost: "Lost",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const result = await db
      .request()
      .input("id", sql.Int, parseInt(id))
      .query(`
        SELECT l.*, p.name as project_name, pk.name as package_name, pk.price as package_price,
               u.full_name as assigned_name,
               b.id as booking_id, b.booking_number, b.total_price as booking_price, b.status as booking_status, b.slip_url, b.payment_confirmed, b.confirmed
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        LEFT JOIN bookings b ON b.lead_id = l.id
        WHERE l.id = @id
      `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    return NextResponse.json(result.recordset[0]);
  } catch (error) {
    console.error("GET /api/leads/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch lead" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    const leadId = parseInt(id);

    // Get current status before update
    let oldStatus: string | null = null;
    if (body.status !== undefined) {
      const current = await db.request().input("id", sql.Int, leadId)
        .query(`SELECT status FROM leads WHERE id = @id`);
      if (current.recordset.length > 0) {
        oldStatus = current.recordset[0].status;
      }
    }

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, leadId);

    if (body.status !== undefined) {
      sets.push("status = @status");
      request.input("status", sql.NVarChar(30), body.status);
    }
    if (body.note !== undefined) {
      sets.push("note = @note");
      request.input("note", sql.NVarChar(sql.MAX), body.note);
    }
    if (body.interested_package_id !== undefined) {
      sets.push("interested_package_id = @interested_package_id");
      request.input("interested_package_id", sql.Int, body.interested_package_id);
    }
    if (body.phone !== undefined) {
      sets.push("phone = @phone");
      request.input("phone", sql.NVarChar(20), body.phone);
    }
    if (body.lost_reason !== undefined) {
      sets.push("lost_reason = @lost_reason");
      request.input("lost_reason", sql.NVarChar(sql.MAX), body.lost_reason);
    }
    if (body.revisit_date !== undefined) {
      sets.push("revisit_date = @revisit_date");
      request.input("revisit_date", sql.Date, body.revisit_date ? new Date(body.revisit_date) : null);
    }
    if (body.source !== undefined) {
      sets.push("source = @source");
      request.input("source", sql.NVarChar(30), body.source);
    }
    if (body.payment_type !== undefined) {
      sets.push("payment_type = @payment_type");
      request.input("payment_type", sql.NVarChar(30), body.payment_type);
    }
    if (body.finance_status !== undefined) {
      sets.push("finance_status = @finance_status");
      request.input("finance_status", sql.NVarChar(30), body.finance_status);
    }
    if (body.requirement !== undefined) {
      sets.push("requirement = @requirement");
      request.input("requirement", sql.NVarChar(sql.MAX), body.requirement);
    }
    if (body.assigned_staff !== undefined) {
      sets.push("assigned_staff = @assigned_staff");
      request.input("assigned_staff", sql.NVarChar(100), body.assigned_staff);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push("updated_at = GETDATE()");

    const result = await request.query(`
      UPDATE leads SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id
    `);

    // Auto-log status change as activity
    if (body.status !== undefined && oldStatus && oldStatus !== body.status) {
      const oldLabel = statusLabels[oldStatus] || oldStatus;
      const newLabel = statusLabels[body.status] || body.status;
      await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("activity_type", sql.NVarChar(30), "status_change")
        .input("title", sql.NVarChar(200), `Status: ${oldLabel} → ${newLabel}`)
        .input("old_status", sql.NVarChar(30), oldStatus)
        .input("new_status", sql.NVarChar(30), body.status)
        .query(`
          INSERT INTO lead_activities (lead_id, activity_type, title, old_status, new_status)
          VALUES (@lead_id, @activity_type, @title, @old_status, @new_status)
        `);
    }

    return NextResponse.json(result.recordset[0]);
  } catch (error) {
    console.error("PATCH /api/leads/[id] error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
