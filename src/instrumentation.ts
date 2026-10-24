// ตัวตั้งเวลาในแอป — Next.js เรียก register() ครั้งเดียวตอน server บูต · ไม่ต้องพึ่ง crontab ข้างนอก
// มี 2 งานเบื้องหลัง:
// 1) sync REM อัตโนมัติตามค่าใน settings (ผู้ใช้เคาะ 3 ก.ย.)
//    ★ ตื่นทุก 1 นาที เช็คว่าถึงรอบไหม — REM ตาม sync.rem_every_min · กวาดงานขายทุก 1 ชม. (แยกรอบ 25 ก.ย.)
//      เปลี่ยนค่าใน settings มีผลรอบถัดไป
//    ★ ทำงานเฉพาะ runtime nodejs · กัน double-run ด้วย flag ระดับ process
// 2) รอบคำนวณ SLA (ดู src/lib/sla-sweep.ts) เปิดด้วย SLA_SWEEP_ENABLED=true
//    ซึ่ง deploy_prd.sh ใส่ให้ใน .env ของ prod — dev ไม่ได้ตั้งไว้จึงไม่รันเอง
//    เรียกทดสอบผ่าน POST /api/sla/sweep แทน

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // ---- SLA sweep (งาน v2) ----
  if (process.env.SLA_SWEEP_ENABLED === "true") {
    // ห้าม await ตัวงาน — register ต้องจบก่อน server รับ request ได้
    const { startSlaSweepSchedule } = await import("@/lib/sla-sweep");
    startSlaSweepSchedule();
  }

  // ---- OM REM sync (งานทีม O&M) ----
  // ปิดได้ด้วย env (เช่นเครื่อง dev ที่ไม่อยากให้ยิง REM)
  if (process.env.OM_SCHEDULER_DISABLED === "true") return;

  const { getOmDb } = await import("@/lib/om/line");
  const { getSetting } = await import("@/lib/om/settings");
  const { runScheduledJobs } = await import("@/lib/om/cron-jobs");

  // ★ 25 ก.ย. 69: นับรอบแยก 2 ตัว — เดิมมี lastRun ตัวเดียวตามรอบ REM (6 ชม.)
  //   ทำให้กวาดงานขายช้ากว่าที่เคาะไว้ 1 ก.ย. (ทุก 1 ชม.) · เปิด server = ถึงรอบทั้งคู่ทันทีเหมือนเดิม
  const SWEEP_EVERY_MS = 60 * 60_000;
  let running = false;
  let lastRem = 0;     // REM + เชื่อมกลับ + ของแถม + เตือนนัด — ตาม sync.rem_every_min
  let lastSweep = 0;   // กวาดงานขาย → O&M — ทุก 1 ชม.

  const tick = async () => {
    if (running) return;                       // รอบก่อนยังไม่จบ ข้าม
    try {
      const db = await getOmDb();               // throw ถ้า DB_NAME ไม่ใช่ v3 — กันยิงผิดฐาน
      void db;
      // ★ ธงเปิด/ปิดของแต่ละงาน runScheduledJobs เช็คเอง (รวมเตือนนัดของเฟส 6 ที่อาศัยรอบ REM)
      //   ตรงนี้ตัดสินแค่ "ถึงรอบไหน"
      const everyMin = Number(await getSetting("sync.rem_every_min")) || 60;
      const now = Date.now();
      const dueRem = now - lastRem >= everyMin * 60_000;
      const dueSweep = now - lastSweep >= SWEEP_EVERY_MS;
      if (!dueRem && !dueSweep) return;         // ยังไม่ถึงรอบไหนเลย
      running = true;
      if (dueRem) lastRem = now;
      if (dueSweep) lastSweep = now;
      await runScheduledJobs({ rem: dueRem, sweep: dueSweep });
    } catch {
      // เงียบ — งานเบื้องหลัง ไม่ให้ crash server · ดูผล/ error ได้ที่ om_sync_log
    } finally {
      running = false;
    }
  };

  // ตื่นทุก 1 นาที (เบามาก — แค่เช็คเวลา ไม่ได้ยิง REM ทุกครั้ง)
  setInterval(tick, 60_000);
}
