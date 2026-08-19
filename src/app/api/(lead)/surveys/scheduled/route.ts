import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Returns all upcoming/active survey appointments so the calendar
// can show occupied slots and prevent double-scheduling.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    // ?include=followup → เพิ่มนัดติดตามของ sales (leads.next_follow_up) เข้าไปด้วย
    // แยกด้วย param เพื่อไม่ให้ปนเข้าปฏิทินทีมสำรวจ/ติดตั้ง (โหมด "ทั้งหมด")
    const includeFollowup = req.nextUrl.searchParams.get("include") === "followup";
    const followupUnion = includeFollowup ? `
      UNION ALL
      SELECT l.id, l.full_name, l.house_number, l.next_follow_up as event_date, NULL as time_slot,
             'followup' as event_type, l.status, l.zone, 'followup' as team,
             la.last_contact_date, la.last_title, la.last_note, la.last_type,
             (SELECT COUNT(*) FROM lead_activities ac
              WHERE ac.lead_id = l.id
                AND ac.activity_type IN ('call', 'visit', 'line', 'other', 'follow_up', 'loan_followup')) AS contact_count
      FROM leads l
      OUTER APPLY (
        -- log การติดตามที่ "ลงนัดนี้ไว้" (บันทึกที่ตั้งนัดครั้งถัดไป = วันนัดบนปฏิทิน)
        SELECT TOP 1
          COALESCE(a3.followup_date, CAST(a3.created_at AS DATE)) AS last_contact_date,
          a3.title AS last_title, a3.note AS last_note, a3.activity_type AS last_type
        FROM lead_activities a3
        WHERE a3.lead_id = l.id
          AND CAST(a3.follow_up_date AS DATE) = l.next_follow_up
        ORDER BY a3.created_at DESC
      ) la
      WHERE next_follow_up IS NOT NULL
        AND status NOT IN ('warranty', 'gridtie', 'closed', 'lost', 'returned')
        -- นัดถูก "ปลด" ด้วยการบันทึกติดตามที่ไม่ใส่วันนัดต่อ เท่านั้น
        -- → เงื่อนไขแสดง: log ติดตามครั้งล่าสุดของลูกค้า ต้องมีวันนัด และตรงกับ
        --   next_follow_up ปัจจุบัน (ลงนัดใหม่ = ขยับวันเอง · ไม่ลงนัด = ปลด ·
        --   นัดจาก import ที่ไม่มี log รองรับ = ไม่แสดง)
        AND (
          SELECT TOP 1 CAST(a2.follow_up_date AS DATE)
          FROM lead_activities a2
          WHERE a2.lead_id = l.id
            AND a2.activity_type IN ('call', 'visit', 'line', 'other', 'follow_up', 'loan_followup')
          ORDER BY a2.created_at DESC
        ) = l.next_follow_up
      UNION ALL
      -- ประวัติย้อนหลัง 1 เดือน: นัดในอดีตที่ "ตามจบแล้ว" (มีการติดต่อตั้งแต่วันนัด)
      -- เพื่อให้เลื่อนดูเดือนก่อนแล้วเห็นว่าเคยนัด/ตามอะไรไป — นัดค้างในอดีตมาจาก
      -- branch บนอยู่แล้ว จึงไม่ซ้ำกัน
      SELECT l.id, l.full_name, l.house_number, fu.fu_date as event_date, NULL as time_slot,
             'followup' as event_type, l.status, l.zone, 'followup' as team,
             la.last_contact_date, la.last_title, la.last_note, la.last_type,
             (SELECT COUNT(*) FROM lead_activities ac
              WHERE ac.lead_id = l.id
                AND ac.activity_type IN ('call', 'visit', 'line', 'other', 'follow_up', 'loan_followup')) AS contact_count
      FROM (
        -- "นัดล่าสุด" ของแต่ละลูกค้าจุดเดียวเท่านั้น: ถ้านัดล่าสุดเป็นอนาคต
        -- (ยังรอตาม) เป็นหน้าที่ branch บน — ที่นี่เอาเฉพาะคนที่นัดล่าสุด
        -- อยู่ในอดีตช่วง 1 เดือนที่ผ่านมา
        SELECT lead_id, MAX(CAST(follow_up_date AS DATE)) AS fu_date
        FROM lead_activities
        WHERE follow_up_date IS NOT NULL
        GROUP BY lead_id
        HAVING MAX(CAST(follow_up_date AS DATE)) < CAST(GETDATE() AS DATE)
           AND MAX(CAST(follow_up_date AS DATE)) >= DATEADD(month, -1, CAST(GETDATE() AS DATE))
      ) fu
      JOIN leads l ON l.id = fu.lead_id
      OUTER APPLY (
        SELECT TOP 1
          COALESCE(a3.followup_date, CAST(a3.created_at AS DATE)) AS last_contact_date,
          a3.title AS last_title, a3.note AS last_note, a3.activity_type AS last_type
        FROM lead_activities a3
        WHERE a3.lead_id = l.id AND CAST(a3.follow_up_date AS DATE) = fu.fu_date
        ORDER BY a3.created_at DESC
      ) la
      WHERE l.journey_step = 100
        AND EXISTS (
          SELECT 1 FROM lead_activities a2
          WHERE a2.lead_id = l.id
            AND a2.activity_type IN ('call', 'visit', 'line', 'other', 'follow_up', 'loan_followup')
            AND COALESCE(a2.followup_date, CAST(a2.created_at AS DATE)) >= fu.fu_date
        )` : "";
    // Block slots for any lead that has a survey_date/install_date set — even
    // if the lead has advanced past that stage (the surveyor/installer already
    // has that appointment on the calendar). Exclude terminal cancels so freed
    // slots come back to the pool.
    const result = await db.request().query(`
      ;WITH block_days AS (
        -- Expand each calendar_block into one row per day in [block_date, end_date].
        -- end_date NULL = single-day block. The recursive CTE walks day-by-day
        -- so multi-day "ลาพักร้อน" blocks show up on every covered day.
        SELECT id, title, time_slot, team, block_date AS d, COALESCE(end_date, block_date) AS last_d
        FROM calendar_blocks
        UNION ALL
        SELECT id, title, time_slot, team, DATEADD(day, 1, d), last_d
        FROM block_days
        WHERE d < last_d
      ),
      install_days AS (
        -- Same day-by-day expansion for multi-day installs. install_date_end
        -- NULL = single-day install. So a 23–24 มิ.ย. install shows on both days.
        SELECT id, full_name, house_number, status, zone,
               install_date AS d, COALESCE(install_date_end, install_date) AS last_d
        FROM leads
        WHERE install_date IS NOT NULL
          AND install_completed_at IS NULL
          AND status NOT IN ('warranty', 'gridtie', 'closed', 'lost', 'returned')
        UNION ALL
        SELECT id, full_name, house_number, status, zone, DATEADD(day, 1, d), last_d
        FROM install_days
        WHERE d < last_d
      )
      -- Each row carries a team field so the picker can scope availability:
      --   survey events → survey (Survey team calendar)
      --   install events → install (Solar team calendar)
      --   block events → calendar_blocks.team (NULL = applies to both teams)
      SELECT id, full_name, house_number, survey_date as event_date, survey_time_slot as time_slot, 'survey' as event_type, status, zone, 'survey' as team,
             NULL as last_contact_date, NULL as last_title, NULL as last_note, NULL as last_type, NULL as contact_count
      FROM leads
      WHERE survey_date IS NOT NULL
        AND survey_actual_date IS NULL
        AND status NOT IN ('quote', 'order', 'install', 'warranty', 'gridtie', 'closed', 'lost', 'returned')
      UNION ALL
      SELECT id, full_name, house_number, d as event_date, NULL as time_slot, 'install' as event_type, status, zone, 'install' as team,
             NULL as last_contact_date, NULL as last_title, NULL as last_note, NULL as last_type, NULL as contact_count
      FROM install_days
      UNION ALL
      SELECT (-id) as id, title as full_name, NULL as house_number,
             d as event_date, time_slot, 'block' as event_type,
             'block' as status, NULL as zone, team,
             NULL as last_contact_date, NULL as last_title, NULL as last_note, NULL as last_type, NULL as contact_count
      FROM block_days
      ${followupUnion}
      OPTION (MAXRECURSION 366)
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/surveys/scheduled error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
