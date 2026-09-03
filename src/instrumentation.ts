// ตัวตั้งเวลาในแอป — รัน sync REM อัตโนมัติตามค่าใน settings (ผู้ใช้เคาะ 3 ก.ย.)
// Next.js เรียก register() ครั้งเดียวตอน server บูต · ไม่ต้องพึ่ง crontab ข้างนอก
// ★ ตื่นทุก 1 นาที เช็คว่าถึงรอบไหม (รอบจาก sync.rem_every_min) — เปลี่ยนค่าใน settings มีผลรอบถัดไป
// ★ ทำงานเฉพาะ runtime nodejs · กัน double-run ด้วย flag ระดับ process

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // ปิดได้ด้วย env (เช่นเครื่อง dev ที่ไม่อยากให้ยิง REM)
  if (process.env.OM_SCHEDULER_DISABLED === "true") return;

  const { getOmDb } = await import("@/lib/om/line");
  const { getSetting } = await import("@/lib/om/settings");
  const { runScheduledJobs } = await import("@/lib/om/cron-jobs");

  let running = false;
  let lastRun = 0;

  const tick = async () => {
    if (running) return;                       // รอบก่อนยังไม่จบ ข้าม
    try {
      const db = await getOmDb();               // throw ถ้า DB_NAME ไม่ใช่ v3 — กันยิงผิดฐาน
      void db;
      const auto = await getSetting<boolean>("sync.rem_auto");
      const everyMin = Number(await getSetting("sync.rem_every_min")) || 60;
      if (auto === false) return;
      if (Date.now() - lastRun < everyMin * 60_000) return;   // ยังไม่ถึงรอบ
      running = true;
      lastRun = Date.now();
      await runScheduledJobs();
    } catch {
      // เงียบ — งานเบื้องหลัง ไม่ให้ crash server · ดูผล/ error ได้ที่ om_sync_log
    } finally {
      running = false;
    }
  };

  // ตื่นทุก 1 นาที (เบามาก — แค่เช็คเวลา ไม่ได้ยิง REM ทุกครั้ง)
  setInterval(tick, 60_000);
}
