import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { getUserIdFromReq } from "@/lib/auth";

const titleMap: Record<string, string> = {
  call: "Called customer",
  visit: "Visited customer",
  note: "Added a note",
  follow_up: "Scheduled follow-up",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const result = await db
      .request()
      .input("lead_id", sql.Int, parseInt(id))
      .query(`
        SELECT la.*, u.full_name as created_by_name
        FROM lead_activities la
        LEFT JOIN users u ON la.created_by = u.id
        WHERE la.lead_id = @lead_id
        ORDER BY la.created_at DESC
      `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET activities error:", error);
    return NextResponse.json({ error: "Failed to fetch activities" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();
    const leadId = parseInt(id);
    const userId = getUserIdFromReq(req) ?? 1;

    const activityType = body.activity_type || "note";
    let title = titleMap[activityType] || "Activity";
    if (body.follow_up_date) {
      title = `Scheduled follow-up for ${new Date(body.follow_up_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`;
    }

    const request = db.request()
      .input("lead_id", sql.Int, leadId)
      .input("activity_type", sql.NVarChar(30), activityType)
      .input("title", sql.NVarChar(200), title)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .input("follow_up_date", sql.DateTime2, body.follow_up_date ? new Date(body.follow_up_date + "T12:00:00") : null);

    const hasContactDate = !!body.contact_date;
    if (hasContactDate) request.input("created_at", sql.DateTime2, new Date(body.contact_date + "T12:00:00"));

    request.input("created_by", sql.Int, userId);
    const result = await request.query(`
      INSERT INTO lead_activities (lead_id, activity_type, title, note, follow_up_date, created_by${hasContactDate ? ", created_at" : ""})
      OUTPUT INSERTED.*
      VALUES (@lead_id, @activity_type, @title, @note, @follow_up_date, @created_by${hasContactDate ? ", @created_at" : ""})
    `);

    // Update lead's next_follow_up whenever a follow-up date is provided
    if (body.follow_up_date) {
      await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("next_follow_up", sql.Date, new Date(body.follow_up_date + "T12:00:00"))
        .query(`UPDATE leads SET next_follow_up = @next_follow_up, updated_at = GETDATE() WHERE id = @lead_id`);
    }

    // Auto-assign owner: whoever adds a contact activity (call/visit/note/follow_up)
    // becomes the current owner — always overwrites the previous owner.
    if (["call", "visit", "note", "follow_up"].includes(activityType)) {
      await db.request()
        .input("lead_id", sql.Int, leadId)
        .input("user_id", sql.Int, userId)
        .query(`UPDATE leads SET assigned_user_id = @user_id, updated_at = GETDATE() WHERE id = @lead_id`);
    }

    return NextResponse.json(result.recordset[0], { status: 201 });
  } catch (error) {
    console.error("POST activity error:", error);
    return NextResponse.json({ error: "Failed to create activity" }, { status: 500 });
  }
}
