import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { runSweep } from "@/lib/om/sales-sweep";
import { finishSync, logSync } from "@/lib/om/rem-sync";

// กวาดงานขายที่ติดตั้งเสร็จ → บ้าน O&M · ตัดสิน 1 ก.ย. ให้รันทุก 1 ชั่วโมง
// ★ มั่นใจ = ทำเลย · ไม่มั่นใจ = เข้าคิว om_match_queue ไม่แตะข้อมูลจริง

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;

// GET — คิวที่รอคนตัดสิน + รอบ sweep ล่าสุด
export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const db = await getOmDb();
  const r = await db.request().input("st", sql.NVarChar(12), status).query(`
    SELECT q.id, q.lead_id, q.tier, q.status, q.reason, q.cand_contract, q.cand_project, q.cand_house,
           q.candidates, q.house_id, CONVERT(varchar(33), q.created_at, 126) created_at,
           l.full_name, l.phone, l.house_number lead_house, l.project_id sales_project_id,
           pr.name sales_project_name, pj.name_th cand_project_name,
           CONVERT(varchar(33), l.install_completed_at, 126) install_completed_at
    FROM om_match_queue q
    JOIN leads l ON l.id = q.lead_id
    LEFT JOIN projects pr ON pr.id = l.project_id
    LEFT JOIN om_projects pj ON pj.project_id = q.cand_project
    WHERE (@st = 'all' OR q.status = @st)
    ORDER BY CASE q.tier WHEN 'likely' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END, q.id DESC;

    SELECT tier, status, COUNT(*) n FROM om_match_queue GROUP BY tier, status;

    SELECT TOP 5 id, kind, scope, status, CONVERT(varchar(33), started_at, 126) started_at,
           CONVERT(varchar(33), finished_at, 126) finished_at, n_fetched, n_inserted, n_skipped, message
    FROM om_sync_log ORDER BY id DESC;`);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return NextResponse.json({ queue: rs[0], counts: rs[1], recent: rs[2] });
}

// POST { dry_run?: boolean } — รันรอบกวาด
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;

  const b = await req.json().catch(() => ({}));
  const dryRun = b.dry_run === true;
  const db = await getOmDb();
  const logId = dryRun ? 0 : await logSync(db, "sales_sweep", "all", gate.userId ?? null);
  try {
    const out = await runSweep(db, { dryRun });
    const made = out.results.filter((x) => x.action === "created" || x.action === "linked").length;
    const queued = out.results.filter((x) => x.action === "queued").length;
    if (!dryRun) await finishSync(db, logId, { status: "ok", fetched: out.scanned, inserted: made, skipped: queued,
      message: `กวาด ${out.scanned} · เข้าระบบ ${made} · เข้าคิว ${queued}` });
    return NextResponse.json({ ok: true, dry_run: dryRun, ...out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "กวาดไม่สำเร็จ";
    if (!dryRun) await finishSync(db, logId, { status: "error", message: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
