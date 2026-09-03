import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { remConfigured } from "@/lib/om/rem";
import { finishSync, logSync, syncProject, syncPromotionsByUnit } from "@/lib/om/rem-sync";
import { syncBookingPromos, fetchBookingInfoRaw } from "@/lib/om/rem-booking";
import { reconcileRemLinks } from "@/lib/om/rem-reconcile";

// ดึงทะเบียน REM ลง staging
// ★ ดึงทั้งโครงการทีเดียวเสมอ — วัดแล้วดึง 1 หลังกับทั้งโครงการใช้เวลาพอกัน (~2.5 กับ ~3.0 วิ)
// ★ ทำเป็นชุดละไม่กี่โครงการ เพราะ 113 โครงการ × 2 เส้น ≈ 11 นาที เกิน timeout ของ HTTP

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;
const BATCH_MAX = 20;

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const db = await getOmDb();
  const r = await db.request().query(`
    SELECT (SELECT COUNT(*) FROM om_rem_units) units,
           (SELECT COUNT(*) FROM om_rem_transfers) transfers,
           (SELECT COUNT(*) FROM om_rem_owners) owners,
           (SELECT COUNT(DISTINCT project_id) FROM om_rem_units) projects,
           (SELECT CONVERT(varchar(33), MAX(synced_at), 126) FROM om_rem_units) last_synced,
           (SELECT COUNT(*) FROM om_projects WHERE project_type = 'H') h_projects;

    SELECT TOP 10 id, kind, scope, status, CONVERT(varchar(33), started_at, 126) started_at,
           CONVERT(varchar(33), finished_at, 126) finished_at, n_fetched, n_inserted, n_skipped, message
    FROM om_sync_log WHERE kind LIKE 'rem%' ORDER BY id DESC;`);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const st = rs[0][0] as Record<string, unknown>;
  return NextResponse.json({ stats: st, h_projects: st.h_projects, recent: rs[1], configured: remConfigured() });
}

// POST { project_id }            — ดึงโครงการเดียว
// POST { stale: true, limit: n } — ดึงชุดที่เก่าที่สุด n โครงการ (ไว้ให้ cron เรียกซ้ำจนครบ)
// POST { promo: true, limit: n, only_om?: bool, redo?: bool }
//   — ★ ดึงโปรโมชันรายหลัง (ยิงทั้งโครงการได้ไม่ครบ) · เรียกซ้ำได้จนกว่า remaining = 0
// POST { booking: true, limit: n, only_om?: bool }
//   — ★★ ดึงของแถม "ครบทุกรายการ" จาก REMAPIV2/BookingInfo (itf ยังตัดโซลาร์ทิ้ง)
//        มี guard เช็ค contract_id ตอบกลับตรงเป๊ะ · ไม่เก็บราคา
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  if (!remConfigured()) return NextResponse.json({ error: "ยังไม่ได้ตั้ง REM_API_KEY" }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const db = await getOmDb();

  // เชื่อมทะเบียน REM กลับเข้าข้อมูลจริง (กดเองจากหน้าเว็บได้ · ปกติ cron ทำเองหลัง sync)
  if (b.reconcile === true) {
    const logId = await logSync(db, "rem_reconcile", "manual", gate.userId ?? null);
    try {
      const r = await reconcileRemLinks(db);
      await finishSync(db, logId, { status: "ok", inserted: r.contractsLinked + r.owners.created,
        message: `เชื่อมสัญญา ${r.contractsLinked} · เติม unit ${r.unitsLinked} · สร้างเจ้าของ ${r.owners.created} · สิทธิ์ ${r.grantsCreated}` });
      return NextResponse.json({ ok: true, contractsLinked: r.contractsLinked, unitsLinked: r.unitsLinked,
        ownersCreated: r.owners.created, ownersReused: r.owners.reused, grantsCreated: r.grantsCreated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "reconcile ไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // ทดสอบยิงเจาะสัญญาเดียว — ดูโครงสร้างดิบว่า BookingInfo คืนอะไร (ไม่เขียนฐาน · ไม่โชว์ราคา)
  if (b.booking === true && typeof b.contract === "string" && b.contract.trim()) {
    const info = await fetchBookingInfoRaw(b.contract.trim());
    if (!info.ok) return NextResponse.json({ ok: true, contract: b.contract, matched: false, status: info.status, note: info.note });
    const promos = (info.data?.promotions ?? []) as { name?: string }[];
    return NextResponse.json({ ok: true, contract: b.contract, matched: true,
      keys: Object.keys(info.data ?? {}),                    // ★ ดูว่ามี field อะไรบ้าง
      echoed_contract_id: info.data?.contract_id,            // contract_id ที่ตอบกลับ
      n_promos: promos.length,
      n_solar: promos.filter((x) => /solar|โซลาร|โซล่า/i.test(String(x.name ?? ""))).length,
      names: promos.map((x) => x.name) });
  }

  if (b.booking === true) {
    const limit = Math.min(Number(b.limit) || 100, 2000);
    const logId = await logSync(db, "rem_booking", b.only_om ? "om" : "all", gate.userId ?? null);
    try {
      const r = await syncBookingPromos(db, limit, { onlyOm: b.only_om === true });
      await finishSync(db, logId, { status: "ok", fetched: r.done, inserted: r.rows, skipped: r.failed + r.mismatch,
        message: `ดึง ${r.done} สัญญา · ของแถม ${r.rows} แถว · มีโซลาร์ ${r.solar} · ตัดกันข้อมูลผิด ${r.mismatch} · เหลือ ${r.remaining}` });
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ดึง BookingInfo ไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (b.promo === true) {
    const limit = Math.min(Number(b.limit) || 100, 2000);
    const logId = await logSync(db, "rem_promo", b.only_om ? "om" : "all", gate.userId ?? null);
    try {
      const r = await syncPromotionsByUnit(db, limit, { onlyOm: b.only_om === true, redo: b.redo === true });
      await finishSync(db, logId, { status: "ok", fetched: r.done, inserted: r.rows, skipped: r.failed,
        message: `ดึง ${r.done} หลัง · โปรฯ ${r.rows} แถว · มีโซลาร์ ${r.solar} หลัง · เหลือ ${r.remaining}` });
      return NextResponse.json({ ok: true, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ดึงโปรโมชันไม่สำเร็จ";
      await finishSync(db, logId, { status: "error", message: msg });
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  let targets: string[] = [];
  if (typeof b.project_id === "string" && b.project_id.trim()) {
    targets = [b.project_id.trim()];
  } else {
    const limit = Math.min(Number(b.limit) || 5, BATCH_MAX);
    // ★ เอาเฉพาะโครงการบ้าน (H) — คอนโดยังไม่อยู่ในขอบเขต O&M
    const r = await db.request().input("n", sql.Int, limit).query(`
      SELECT TOP (@n) pj.project_id
      FROM om_projects pj
      LEFT JOIN (SELECT project_id, MAX(synced_at) at FROM om_rem_units GROUP BY project_id) u
             ON u.project_id = pj.project_id
      WHERE pj.project_type = 'H'
      ORDER BY CASE WHEN u.at IS NULL THEN 0 ELSE 1 END, u.at ASC, pj.project_id`);
    targets = r.recordset.map((x) => String(x.project_id));
  }

  const logId = await logSync(db, "rem_sync", targets.join(","), gate.userId ?? null);
  const done: unknown[] = [];
  let fetched = 0, skipped = 0;
  try {
    for (const pid of targets) {
      const res = await syncProject(db, pid);
      fetched += res.units + res.transfers;
      if (res.skipped) skipped++;
      done.push(res);
    }
    await finishSync(db, logId, { status: "ok", fetched, inserted: fetched, skipped,
      message: `${targets.length} โครงการ · ${fetched} แถว` });
    return NextResponse.json({ ok: true, projects: targets.length, results: done });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "sync ไม่สำเร็จ";
    await finishSync(db, logId, { status: "error", fetched, message: msg });
    return NextResponse.json({ error: msg, done }, { status: 500 });
  }
}
