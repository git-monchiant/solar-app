import type sql from "mssql";
import { addBangkokCalendarDays, firstContactHardDeadline, firstContactTarget, gradeATaskForStage, OPERATIONAL_SLA_MINUTES, retryDeadlines, type ContactResult } from "@/lib/sla-rules";

type Db = sql.ConnectionPool;

async function addEvent(db: Db, input: {
  instanceId: number;
  leadId: number;
  type: string;
  eventKey?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: number | null;
  detail?: Record<string, unknown> | null;
  eventAt?: Date | null;
}) {
  await db.request()
    .input("instance_id", input.instanceId)
    .input("lead_id", input.leadId)
    .input("event_type", input.type)
    .input("event_key", input.eventKey || null)
    .input("from_status", input.fromStatus || null)
    .input("to_status", input.toStatus || null)
    .input("actor_user_id", input.actorUserId || null)
    .input("event_at", input.eventAt || new Date())
    .input("detail_json", input.detail ? JSON.stringify(input.detail) : null)
    .query(`
      IF @event_key IS NULL OR NOT EXISTS (SELECT 1 FROM lead_sla_events WHERE event_key = @event_key)
        INSERT lead_sla_events(
          sla_instance_id, lead_id, event_type, event_key, from_status, to_status, actor_user_id, event_at, detail_json
        ) VALUES (
          @instance_id, @lead_id, @event_type, @event_key, @from_status, @to_status, @actor_user_id, @event_at, @detail_json
        )
    `);
}

type OperationalPolicyCode =
  | "ASSIGN_OWNER"
  | "ELECTRICITY_ASSESSMENT"
  | "BOOK_SURVEY"
  | "SITE_SURVEY"
  | "PROPOSAL_ROI"
  | "DEPOSIT_CLOSE"
  | "SCHEDULE_INSTALLATION"
  | "INSTALLATION"
  | "AFTER_SALES";

type OperationalDefinition = {
  policyCode: OperationalPolicyCode;
  taskName: string;
  anchorAt: Date | null;
  completionAt: Date | null;
  completionActivityId?: number | null;
  targetMinutes: number;
  dueMinutes: number;
  warningMinutes: number;
  ownerRole: "sales" | "solar";
  ownerUserId: number | null;
};

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function stateAt(now: Date, warningAt: Date, dueAt: Date) {
  if (now > dueAt) return "breached";
  if (dueAt.getTime() - now.getTime() <= 30 * 60_000) return "critical";
  if (now >= warningAt) return "warning";
  return "active";
}

async function reconcileOperationalInstance(db: Db, input: {
  leadId: number;
  ownerUserId: number | null;
  actorUserId?: number | null;
  cancelled: boolean;
  definition: OperationalDefinition;
}) {
  const { definition } = input;
  const instanceKey = `operational:${definition.policyCode.toLowerCase()}:${input.leadId}`;
  const existingResult = await db.request().input("instance_key", instanceKey).query(`
    SELECT TOP 1 id, status, started_at, completed_at
    FROM lead_sla_instances WHERE instance_key = @instance_key
  `);
  const existing = existingResult.recordset[0];

  if (!definition.anchorAt) {
    if (existing && !["cancelled", "superseded"].includes(existing.status)) {
      await db.request().input("id", existing.id).query(`
        UPDATE lead_sla_instances
        SET status = 'cancelled', completed_at = NULL, updated_at = GETDATE()
        WHERE id = @id
      `);
      await addEvent(db, {
        instanceId: existing.id,
        leadId: input.leadId,
        type: "cancelled",
        eventKey: `sla-cancelled:${existing.id}:anchor-removed`,
        fromStatus: existing.status,
        toStatus: "cancelled",
        actorUserId: input.actorUserId,
        detail: { reason: "anchor_removed", policyCode: definition.policyCode },
      });
    }
    return;
  }

  const targetAt = new Date(definition.anchorAt.getTime() + definition.targetMinutes * 60_000);
  const dueAt = new Date(definition.anchorAt.getTime() + definition.dueMinutes * 60_000);
  const warningAt = new Date(dueAt.getTime() - definition.warningMinutes * 60_000);
  const desiredStatus = input.cancelled
    ? "cancelled"
    : definition.completionAt
      ? "completed"
      : stateAt(new Date(), warningAt, dueAt);

  if (!existing) {
    const inserted = await db.request()
      .input("lead_id", input.leadId)
      .input("instance_key", instanceKey)
      .input("task_name", definition.taskName)
      .input("owner_user_id", input.ownerUserId)
      .input("owner_role", definition.ownerRole)
      .input("started_at", definition.anchorAt)
      .input("target_at", targetAt)
      .input("due_at", dueAt)
      .input("warning_at", warningAt)
      .input("status", desiredStatus)
      .input("completed_at", definition.completionAt)
      .input("completion_activity_id", definition.completionActivityId || null)
      .input("breached_at", definition.completionAt && definition.completionAt > dueAt ? definition.completionAt : desiredStatus === "breached" ? new Date() : null)
      .input("context_json", JSON.stringify({ operational: true, calendarDays: true, timezone: "Asia/Bangkok" }))
      .query(`
        INSERT lead_sla_instances(
          lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id, owner_role,
          started_at, target_at, due_at, warning_at, status, completed_at,
          completion_activity_id, breached_at, context_json
        )
        OUTPUT INSERTED.id, INSERTED.status
        VALUES(
          @lead_id, '${definition.policyCode}', 1, @instance_key, @task_name, @owner_user_id, @owner_role,
          @started_at, @target_at, @due_at, @warning_at, @status, @completed_at,
          @completion_activity_id, @breached_at, @context_json
        )
      `);
    const created = inserted.recordset[0];
    await addEvent(db, {
      instanceId: created.id,
      leadId: input.leadId,
      type: "created",
      eventKey: `sla-created:${instanceKey}`,
      toStatus: desiredStatus,
      actorUserId: input.actorUserId,
      eventAt: definition.anchorAt,
      detail: { policyCode: definition.policyCode, targetAt: targetAt.toISOString(), dueAt: dueAt.toISOString() },
    });
    if (desiredStatus === "completed") {
      await addEvent(db, {
        instanceId: created.id,
        leadId: input.leadId,
        type: "completed",
        eventKey: `sla-completed:${created.id}:milestone`,
        fromStatus: "active",
        toStatus: "completed",
        actorUserId: input.actorUserId,
        eventAt: definition.completionAt,
        detail: { policyCode: definition.policyCode, completionActivityId: definition.completionActivityId || null },
      });
    }
    return;
  }

  await db.request()
    .input("id", existing.id)
    .input("task_name", definition.taskName)
    .input("owner_user_id", input.ownerUserId)
    .input("owner_role", definition.ownerRole)
    .input("started_at", definition.anchorAt)
    .input("target_at", targetAt)
    .input("due_at", dueAt)
    .input("warning_at", warningAt)
    .input("status", desiredStatus)
    .input("completed_at", definition.completionAt)
    .input("completion_activity_id", definition.completionActivityId || null)
    .input("breached_at", definition.completionAt && definition.completionAt > dueAt ? definition.completionAt : desiredStatus === "breached" ? new Date() : null)
    .query(`
      UPDATE lead_sla_instances
      SET task_name = @task_name, owner_user_id = @owner_user_id, owner_role = @owner_role,
          started_at = @started_at, target_at = @target_at, due_at = @due_at, warning_at = @warning_at,
          status = @status, completed_at = @completed_at,
          completion_activity_id = @completion_activity_id,
          breached_at = CASE WHEN @breached_at IS NOT NULL THEN COALESCE(breached_at, @breached_at)
                             WHEN @status <> 'breached' THEN NULL ELSE breached_at END,
          updated_at = GETDATE()
      WHERE id = @id
    `);
  if (existing.status !== desiredStatus) {
    await addEvent(db, {
      instanceId: existing.id,
      leadId: input.leadId,
      type: desiredStatus === "completed" ? "completed" : desiredStatus === "cancelled" ? "cancelled" : existing.status === "completed" ? "reopened" : "state_changed",
      eventKey: `sla-transition:${existing.id}:${existing.status}:${desiredStatus}:${definition.completionAt?.getTime() || definition.anchorAt.getTime()}`,
      fromStatus: existing.status,
      toStatus: desiredStatus,
      actorUserId: input.actorUserId,
      eventAt: definition.completionAt || new Date(),
      detail: { policyCode: definition.policyCode, completionActivityId: definition.completionActivityId || null },
    });
  }
}

/**
 * Reconciles every operational Sales SLA from durable milestones already stored
 * by the lead workflow. It is idempotent and also reopens/cancels instances when
 * an administrator rolls a milestone back.
 */
export async function syncOperationalSlas(db: Db, leadId: number, actorUserId?: number | null) {
  const result = await db.request().input("lead_id", leadId).query(`
    SELECT l.id, l.status, l.assigned_user_id, l.created_at, l.owner_assigned_at, l.pre_booked_at,
           l.survey_assigned_user_id, l.install_assigned_user_id,
           l.survey_completed_by, l.install_completed_by,
           l.survey_date, l.install_date, l.install_completed_at, l.warranty_issued_at,
           contact.id AS contact_activity_id, contact.created_at AS contacted_at,
           assessment.id AS assessment_activity_id, assessment.created_at AS assessment_at,
           booked.id AS booked_activity_id, booked.created_at AS booked_at,
           survey_done.id AS survey_activity_id, survey_done.created_at AS survey_done_at,
           proposal.id AS proposal_activity_id, proposal.created_at AS proposal_at,
           deposit.id AS deposit_payment_id, deposit.confirmed_at AS deposit_at,
           install_booked.id AS install_booked_activity_id, install_booked.created_at AS install_booked_at,
           after_sales.id AS after_sales_activity_id, after_sales.created_at AS after_sales_at
    FROM leads l
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id
        AND a.activity_type IN ('call','visit','line','other','follow_up')
        AND (a.contact_result = 'connected'
          OR (a.contact_result IS NULL AND a.title NOT LIKE N'ติดต่อไม่ได้%' AND a.title NOT LIKE N'%ข้อมูลติดต่อไม่ถูกต้อง%'))
      ORDER BY a.created_at, a.id
    ) contact
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id AND (a.title LIKE N'%เสนอขาย%' OR a.activity_type = 'sales_assessment')
      ORDER BY a.created_at, a.id
    ) assessment
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id AND (
        a.activity_type = 'presurvey_doc_created'
        OR (a.activity_type = 'appointment_set' AND a.title LIKE N'%สำรวจ%')
      ) ORDER BY a.created_at, a.id
    ) booked
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id AND a.activity_type = 'status_change' AND a.new_status = 'quote'
      ORDER BY a.created_at, a.id
    ) survey_done
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id AND (
        (a.activity_type = 'status_change' AND a.new_status = 'order')
        OR (a.activity_type = 'quotation' AND a.title LIKE N'%ส่งใบเสนอราคา%')
      ) ORDER BY a.created_at, a.id
    ) proposal
    OUTER APPLY (
      SELECT TOP 1 p.id, p.confirmed_at FROM payments p
      WHERE p.lead_id = l.id AND p.slip_field LIKE 'order[_]%' AND p.confirmed_at IS NOT NULL
      ORDER BY p.confirmed_at, p.id
    ) deposit
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id AND (
        (a.activity_type = 'appointment_set' AND a.title LIKE N'%ติดตั้ง%')
        OR (a.activity_type = 'status_change' AND a.new_status = 'install')
      ) ORDER BY a.created_at, a.id
    ) install_booked
    OUTER APPLY (
      SELECT TOP 1 a.id, a.created_at FROM lead_activities a
      WHERE a.lead_id = l.id AND l.install_completed_at IS NOT NULL
        AND a.created_at >= l.install_completed_at
        AND a.activity_type IN ('call','visit','line','other','follow_up')
        AND (a.contact_result = 'connected' OR a.contact_result IS NULL)
      ORDER BY a.created_at, a.id
    ) after_sales
    WHERE l.id = @lead_id
  `);
  const lead = result.recordset[0];
  if (!lead) return;

  const createdAt = dateOrNull(lead.created_at)!;
  const contactedAt = dateOrNull(lead.contacted_at);
  const assessmentAt = dateOrNull(lead.assessment_at)
    || dateOrNull(lead.pre_booked_at)
    || dateOrNull(lead.booked_at)
    || dateOrNull(lead.survey_done_at);
  const bookedAt = dateOrNull(lead.booked_at)
    || dateOrNull(lead.pre_booked_at)
    || dateOrNull(lead.survey_done_at);
  const surveyDoneAt = dateOrNull(lead.survey_done_at);
  const proposalAt = dateOrNull(lead.proposal_at);
  const depositAt = dateOrNull(lead.deposit_at);
  const installBookedAt = dateOrNull(lead.install_booked_at);
  const installCompletedAt = dateOrNull(lead.install_completed_at);
  const afterSalesAt = dateOrNull(lead.after_sales_at) || dateOrNull(lead.warranty_issued_at);
  const leadStatus = String(lead.status);
  const cancelled = ["lost", "returned"].includes(leadStatus);
  const stageRank: Record<string, number> = {
    pre_survey: 0, "pre_survey-01": 0, "pre_survey-02": 0,
    survey: 1, quote: 2, order: 3, install: 4, warranty: 5, gridtie: 6, closed: 7,
  };
  const policyRank: Partial<Record<OperationalPolicyCode, number>> = {
    ELECTRICITY_ASSESSMENT: 0,
    BOOK_SURVEY: 0,
    SITE_SURVEY: 1,
    PROPOSAL_ROI: 2,
    DEPOSIT_CLOSE: 3,
    SCHEDULE_INSTALLATION: 4,
    INSTALLATION: 4,
  };

  const definitions: OperationalDefinition[] = [
    { policyCode: "ASSIGN_OWNER", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "ตรวจสอบข้อมูลและมอบหมายผู้รับผิดชอบ", anchorAt: createdAt, completionAt: dateOrNull(lead.owner_assigned_at), targetMinutes: OPERATIONAL_SLA_MINUTES.ASSIGN_OWNER.target, dueMinutes: OPERATIONAL_SLA_MINUTES.ASSIGN_OWNER.due, warningMinutes: OPERATIONAL_SLA_MINUTES.ASSIGN_OWNER.warning },
    { policyCode: "ELECTRICITY_ASSESSMENT", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "ประเมินการใช้ไฟฟ้าและให้คำปรึกษาเบื้องต้น", anchorAt: contactedAt, completionAt: assessmentAt, completionActivityId: lead.assessment_activity_id || lead.booked_activity_id, targetMinutes: OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT.target, dueMinutes: OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT.due, warningMinutes: OPERATIONAL_SLA_MINUTES.ELECTRICITY_ASSESSMENT.warning },
    { policyCode: "BOOK_SURVEY", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "ยืนยันวัน เวลา และนัดหมายสำรวจ", anchorAt: assessmentAt, completionAt: bookedAt, completionActivityId: lead.booked_activity_id, targetMinutes: OPERATIONAL_SLA_MINUTES.BOOK_SURVEY.target, dueMinutes: OPERATIONAL_SLA_MINUTES.BOOK_SURVEY.due, warningMinutes: OPERATIONAL_SLA_MINUTES.BOOK_SURVEY.warning },
    { policyCode: "SITE_SURVEY", ownerRole: "solar", ownerUserId: lead.survey_assigned_user_id || lead.survey_completed_by || null, taskName: "เข้าตรวจสำรวจหน้างาน", anchorAt: bookedAt, completionAt: surveyDoneAt, completionActivityId: lead.survey_activity_id, targetMinutes: OPERATIONAL_SLA_MINUTES.SITE_SURVEY.target, dueMinutes: OPERATIONAL_SLA_MINUTES.SITE_SURVEY.due, warningMinutes: OPERATIONAL_SLA_MINUTES.SITE_SURVEY.warning },
    { policyCode: "PROPOSAL_ROI", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "จัดส่ง Proposal พร้อม ROI และทางเลือกการเงิน", anchorAt: surveyDoneAt, completionAt: proposalAt, completionActivityId: lead.proposal_activity_id, targetMinutes: OPERATIONAL_SLA_MINUTES.PROPOSAL_ROI.target, dueMinutes: OPERATIONAL_SLA_MINUTES.PROPOSAL_ROI.due, warningMinutes: OPERATIONAL_SLA_MINUTES.PROPOSAL_ROI.warning },
    { policyCode: "DEPOSIT_CLOSE", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "ติดตามมัดจำและปิดการขาย", anchorAt: proposalAt, completionAt: depositAt, targetMinutes: OPERATIONAL_SLA_MINUTES.DEPOSIT_CLOSE.target, dueMinutes: OPERATIONAL_SLA_MINUTES.DEPOSIT_CLOSE.due, warningMinutes: OPERATIONAL_SLA_MINUTES.DEPOSIT_CLOSE.warning },
    { policyCode: "SCHEDULE_INSTALLATION", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "นัดวันติดตั้งและแจ้งเตรียมเอกสาร", anchorAt: depositAt, completionAt: installBookedAt, completionActivityId: lead.install_booked_activity_id, targetMinutes: OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION.target, dueMinutes: OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION.due, warningMinutes: OPERATIONAL_SLA_MINUTES.SCHEDULE_INSTALLATION.warning },
    { policyCode: "INSTALLATION", ownerRole: "solar", ownerUserId: lead.install_assigned_user_id || lead.install_completed_by || null, taskName: "ติดตั้ง ทดสอบระบบ และส่งมอบงาน", anchorAt: depositAt, completionAt: installCompletedAt, targetMinutes: OPERATIONAL_SLA_MINUTES.INSTALLATION.target, dueMinutes: OPERATIONAL_SLA_MINUTES.INSTALLATION.due, warningMinutes: OPERATIONAL_SLA_MINUTES.INSTALLATION.warning },
    { policyCode: "AFTER_SALES", ownerRole: "sales", ownerUserId: lead.assigned_user_id || null, taskName: "ติดตามหลังติดตั้งและสอบถามความพึงพอใจ", anchorAt: installCompletedAt, completionAt: afterSalesAt, completionActivityId: lead.after_sales_activity_id, targetMinutes: OPERATIONAL_SLA_MINUTES.AFTER_SALES.target, dueMinutes: OPERATIONAL_SLA_MINUTES.AFTER_SALES.due, warningMinutes: OPERATIONAL_SLA_MINUTES.AFTER_SALES.warning },
  ];

  for (const definition of definitions) {
    const stageHasPassed = policyRank[definition.policyCode] !== undefined
      && (stageRank[leadStatus] ?? 0) > policyRank[definition.policyCode]!
      && !definition.completionAt;
    await reconcileOperationalInstance(db, {
      leadId,
      ownerUserId: definition.ownerUserId,
      actorUserId,
      cancelled: cancelled || stageHasPassed,
      definition,
    });
  }
  await refreshOpenSlaStates(db, leadId);
}

export async function ensureFirstContactSla(db: Db, leadId: number) {
  const leadResult = await db.request().input("lead_id", leadId).query(`
    SELECT id, source, assigned_user_id, created_at
    FROM leads WHERE id = @lead_id
  `);
  const lead = leadResult.recordset[0];
  if (!lead) return null;

  const startedAt = new Date(lead.created_at);
  const targetAt = firstContactTarget(startedAt, lead.source);
  const dueAt = firstContactHardDeadline(startedAt);
  const warningAt = new Date(dueAt.getTime() - 30 * 60_000);
  const instanceKey = `first-contact:${leadId}`;

  const inserted = await db.request()
    .input("lead_id", leadId)
    .input("instance_key", instanceKey)
    .input("owner_user_id", lead.assigned_user_id || null)
    .input("started_at", startedAt)
    .input("target_at", targetAt)
    .input("due_at", dueAt)
    .input("warning_at", warningAt)
    .input("context_json", JSON.stringify({ source: lead.source || null, timezone: "Asia/Bangkok" }))
    .query(`
      IF NOT EXISTS (SELECT 1 FROM lead_sla_instances WITH (UPDLOCK, HOLDLOCK) WHERE instance_key = @instance_key)
      BEGIN
        INSERT lead_sla_instances(
          lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id, owner_role,
          started_at, target_at, due_at, warning_at, context_json
        )
        OUTPUT INSERTED.id, INSERTED.status
        VALUES (
          @lead_id, 'FIRST_CONTACT', 1, @instance_key, N'ติดต่อ Lead ครั้งแรก', @owner_user_id, 'sales',
          @started_at, @target_at, @due_at, @warning_at, @context_json
        );
      END
      ELSE
        SELECT id, status FROM lead_sla_instances WHERE instance_key = @instance_key;
    `);
  const instance = inserted.recordset[0];
  if (instance) {
    await addEvent(db, {
      instanceId: instance.id,
      leadId,
      type: "created",
      eventKey: `sla-created:${instanceKey}`,
      toStatus: instance.status,
      detail: { targetAt: targetAt.toISOString(), dueAt: dueAt.toISOString() },
    });
  }
  return instance;
}

export async function refreshOpenSlaStates(db: Db, leadId?: number) {
  const request = db.request().input("lead_id", leadId ?? null);
  const changed = await request.query(`
    UPDATE si
    SET status = next_state.value,
        breached_at = CASE WHEN next_state.value = 'breached' THEN COALESCE(si.breached_at, GETDATE()) ELSE si.breached_at END,
        updated_at = GETDATE()
    OUTPUT INSERTED.id, INSERTED.lead_id, DELETED.status AS old_status, INSERTED.status AS new_status
    FROM lead_sla_instances si
    CROSS APPLY (SELECT CASE
          WHEN GETDATE() > due_at THEN 'breached'
          WHEN DATEDIFF(MINUTE, GETDATE(), due_at) <= 30 THEN 'critical'
          WHEN warning_at IS NOT NULL AND GETDATE() >= warning_at THEN 'warning'
          ELSE 'active'
        END AS value) next_state
    WHERE si.status IN ('active','warning','critical','breached')
      AND (@lead_id IS NULL OR si.lead_id = @lead_id)
      AND si.status <> next_state.value;
  `);
  for (const row of changed.recordset) {
    await addEvent(db, {
      instanceId: row.id,
      leadId: row.lead_id,
      type: row.new_status === "breached" ? "breached" : "state_changed",
      eventKey: `sla-state:${row.id}:${row.new_status}`,
      fromStatus: row.old_status,
      toStatus: row.new_status,
    });
  }
}

async function completeInstance(db: Db, input: {
  instanceId: number;
  leadId: number;
  oldStatus: string;
  activityId: number;
  actorUserId: number;
  eventSuffix: string;
}) {
  await db.request()
    .input("id", input.instanceId)
    .input("activity_id", input.activityId)
    .query(`
      UPDATE lead_sla_instances
      SET status = 'completed', completed_at = GETDATE(), completion_activity_id = @activity_id,
          breached_at = CASE WHEN GETDATE() > due_at THEN COALESCE(breached_at, GETDATE()) ELSE breached_at END,
          updated_at = GETDATE()
      WHERE id = @id AND status IN ('active','warning','critical','breached')
    `);
  await addEvent(db, {
    instanceId: input.instanceId,
    leadId: input.leadId,
    type: "completed",
    eventKey: `sla-completed:${input.instanceId}:${input.eventSuffix}`,
    fromStatus: input.oldStatus,
    toStatus: "completed",
    actorUserId: input.actorUserId,
    detail: { activityId: input.activityId },
  });
}

async function createRetrySchedule(db: Db, input: {
  leadId: number;
  ownerUserId: number | null;
  firstFailedAt: Date;
  activityId: number;
  actorUserId: number;
}) {
  const deadlines = retryDeadlines(input.firstFailedAt);
  for (let index = 0; index < deadlines.length; index++) {
    const day = [3, 5, 7, 30][index];
    const dueAt = deadlines[index];
    const warningAt = addBangkokCalendarDays(dueAt, -1);
    const key = `contact-retry:${input.leadId}:d${day}:${input.activityId}`;
    const result = await db.request()
      .input("lead_id", input.leadId)
      .input("instance_key", key)
      .input("task_name", `ติดตามลูกค้าครั้งที่ ${index + 1} (Day ${day})`)
      .input("owner_user_id", input.ownerUserId)
      .input("started_at", input.firstFailedAt)
      .input("due_at", dueAt)
      .input("warning_at", warningAt)
      .input("context_json", JSON.stringify({ sequence: index + 1, offsetDays: day, anchorActivityId: input.activityId }))
      .query(`
        IF NOT EXISTS (SELECT 1 FROM lead_sla_instances WITH (UPDLOCK, HOLDLOCK) WHERE instance_key = @instance_key)
        BEGIN
          INSERT lead_sla_instances(
            lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id, owner_role,
            started_at, target_at, due_at, warning_at, context_json
          )
          OUTPUT INSERTED.id
          VALUES (
            @lead_id, 'CONTACT_RETRY', 1, @instance_key, @task_name, @owner_user_id, 'sales',
            @started_at, @due_at, @due_at, @warning_at, @context_json
          );
        END
      `);
    const row = result.recordset[0];
    if (row) {
      await addEvent(db, {
        instanceId: row.id,
        leadId: input.leadId,
        type: "created",
        eventKey: `sla-created:${key}`,
        toStatus: "active",
        actorUserId: input.actorUserId,
        detail: { sequence: index + 1, offsetDays: day },
      });
    }
  }
  await db.request().input("lead_id", input.leadId).input("next_follow_up", deadlines[0]).query(`
    UPDATE leads SET next_follow_up = CAST(@next_follow_up AS DATE), updated_at = GETDATE() WHERE id = @lead_id
  `);
}

export async function processContactActivity(db: Db, input: {
  leadId: number;
  activityId: number;
  actorUserId: number;
  result: ContactResult;
  occurredAt?: Date;
}) {
  await ensureFirstContactSla(db, input.leadId);
  await refreshOpenSlaStates(db, input.leadId);

  const active = await db.request().input("lead_id", input.leadId).query(`
    SELECT TOP 1 id, policy_code, status, owner_user_id, started_at
    FROM lead_sla_instances
    WHERE lead_id = @lead_id AND status IN ('active','warning','critical','breached')
      AND policy_code IN ('FIRST_CONTACT','CONTACT_RETRY')
    ORDER BY CASE WHEN policy_code = 'FIRST_CONTACT' THEN 0 ELSE 1 END, due_at ASC
  `);
  const task = active.recordset[0];
  if (task) {
    await completeInstance(db, {
      instanceId: task.id,
      leadId: input.leadId,
      oldStatus: task.status,
      activityId: input.activityId,
      actorUserId: input.actorUserId,
      eventSuffix: String(input.activityId),
    });
  }

  if (input.result === "connected" || input.result === "invalid_contact") {
    await db.request().input("lead_id", input.leadId).input("reason", input.result).query(`
      UPDATE lead_sla_instances
      SET status = 'cancelled', updated_at = GETDATE(),
          context_json = JSON_MODIFY(COALESCE(context_json, '{}'), '$.cancelReason', @reason)
      WHERE lead_id = @lead_id AND policy_code = 'CONTACT_RETRY'
        AND status IN ('active','warning','critical','breached');
      UPDATE leads SET next_follow_up = NULL, updated_at = GETDATE() WHERE id = @lead_id;
    `);
    if (input.result === "connected") {
      const gradeTask = await db.request().input("lead_id", input.leadId).query(`
        SELECT TOP 1 id, status FROM lead_sla_instances
        WHERE lead_id = @lead_id AND policy_code = 'GRADE_A_NEXT_ACTION'
          AND status IN ('active','warning','critical','breached')
        ORDER BY due_at ASC
      `);
      if (gradeTask.recordset[0]) {
        await completeInstance(db, {
          instanceId: gradeTask.recordset[0].id,
          leadId: input.leadId,
          oldStatus: gradeTask.recordset[0].status,
          activityId: input.activityId,
          actorUserId: input.actorUserId,
          eventSuffix: `grade-a:${input.activityId}`,
        });
      }
    }
    return;
  }

  if (input.result !== "unreachable") return;
  if (task?.policy_code === "FIRST_CONTACT") {
    await createRetrySchedule(db, {
      leadId: input.leadId,
      ownerUserId: task.owner_user_id || input.actorUserId,
      firstFailedAt: input.occurredAt || new Date(),
      activityId: input.activityId,
      actorUserId: input.actorUserId,
    });
  } else {
    const next = await db.request().input("lead_id", input.leadId).query(`
      SELECT TOP 1 due_at FROM lead_sla_instances
      WHERE lead_id = @lead_id AND policy_code = 'CONTACT_RETRY'
        AND status IN ('active','warning','critical','breached')
      ORDER BY due_at ASC
    `);
    await db.request().input("lead_id", input.leadId).input("next_follow_up", next.recordset[0]?.due_at || null).query(`
      UPDATE leads SET next_follow_up = CAST(@next_follow_up AS DATE), updated_at = GETDATE() WHERE id = @lead_id
    `);
  }
}

export async function processGradeChange(db: Db, input: {
  leadId: number;
  oldGrade: string | null;
  newGrade: string | null;
  actorUserId: number;
  reason?: string | null;
}) {
  if (input.oldGrade === input.newGrade) return;
  await db.request()
    .input("lead_id", input.leadId)
    .input("old_grade", input.oldGrade)
    .input("new_grade", input.newGrade)
    .input("reason", input.reason || null)
    .input("changed_by", input.actorUserId)
    .query(`
      INSERT lead_grade_history(lead_id, old_grade, new_grade, reason, changed_by)
      VALUES (@lead_id, @old_grade, @new_grade, @reason, @changed_by)
    `);

  await db.request().input("lead_id", input.leadId).query(`
    UPDATE lead_sla_instances SET status = 'superseded', superseded_at = GETDATE(), updated_at = GETDATE()
    WHERE lead_id = @lead_id AND policy_code = 'GRADE_A_NEXT_ACTION'
      AND status IN ('active','warning','critical','breached')
  `);
  if (input.newGrade !== "A") return;

  const leadResult = await db.request().input("lead_id", input.leadId).query(`
    SELECT status, assigned_user_id FROM leads WHERE id = @lead_id
  `);
  const lead = leadResult.recordset[0];
  if (!lead) return;
  const now = new Date();
  const due = new Date(now.getTime() + 24 * 60 * 60_000);
  const key = `grade-a:${input.leadId}:${Date.now()}`;
  await db.request()
    .input("lead_id", input.leadId)
    .input("instance_key", key)
    .input("task_name", gradeATaskForStage(lead.status))
    .input("owner_user_id", lead.assigned_user_id || input.actorUserId)
    .input("started_at", now)
    .input("due_at", due)
    .input("warning_at", new Date(due.getTime() - 4 * 60 * 60_000))
    .input("context_json", JSON.stringify({ grade: "A", stage: lead.status, upgradeReason: input.reason || null }))
    .query(`
      INSERT lead_sla_instances(
        lead_id, policy_code, policy_version, instance_key, task_name, owner_user_id, owner_role,
        started_at, target_at, due_at, warning_at, context_json
      ) VALUES (
        @lead_id, 'GRADE_A_NEXT_ACTION', 1, @instance_key, @task_name, @owner_user_id, 'sales',
        @started_at, @due_at, @due_at, @warning_at, @context_json
      )
    `);
}
