import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// POST /api/leads/[id]/return-to-prospect
// Body: { reason?: string }
//
// Sales couldn't reach this lead — send it back to the Lead Seeker team to
// follow up on site. Clears interest fields on the linked prospect so it
// shows up as "ยังไม่เยี่ยม" again, but keeps prospects.lead_id so a later
// "ซิงก์ข้อมูลลีด" re-uses the same lead row instead of creating a duplicate.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason : null;

    const db = await getDb();
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      const prospect = await tx.request()
        .input("lead_id", sql.Int, leadId)
        .query(`SELECT TOP 1 id FROM prospects WHERE lead_id = @lead_id`);
      const prospectId = prospect.recordset[0]?.id ?? null;

      if (prospectId) {
        await tx.request()
          .input("id", sql.Int, prospectId)
          .query(`
            UPDATE prospects SET
              interest = NULL,
              interest_type = NULL,
              visited_at = NULL,
              note = NULL,
              interest_reasons = NULL,
              interest_reason_note = NULL,
              returned_at = GETDATE(),
              updated_at = GETDATE()
            WHERE id = @id
          `);
      }

      // Mark lead as returned so it drops out of active sales pipelines.
      // Pipeline UI groups both 'lost' and 'returned' under the
      // "ยกเลิกและส่งกลับ" tab, but keeping them as distinct statuses lets
      // us show different badges (and lets the seeker card know this lead
      // was handed back, not permanently killed).
      await tx.request()
        .input("id", sql.Int, leadId)
        .query(`UPDATE leads SET status = 'returned' WHERE id = @id`);

      await tx.request()
        .input("lead_id", sql.Int, leadId)
        .input("note", sql.NVarChar(sql.MAX), reason)
        .query(`
          INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by)
          VALUES (@lead_id, 'returned_to_prospect', N'ส่งกลับทีม Lead Seeker', @note, 1)
        `);

      await tx.commit();
      return NextResponse.json({ ok: true, prospect_id: prospectId });
    } catch (e) {
      await tx.rollback();
      throw e;
    }
  } catch (error) {
    console.error("POST /api/leads/[id]/return-to-prospect error:", error);
    return NextResponse.json({ error: "Failed to return lead to prospect" }, { status: 500 });
  }
}
