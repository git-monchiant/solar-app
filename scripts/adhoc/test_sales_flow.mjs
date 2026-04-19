// Step-by-step visible Sales flow — shows each sub-step with a banner + pause.
// Customer: นายคาวี แก้วพวง (id 21). Data randomized per run.
import puppeteer from "puppeteer";
import sql from "mssql";

const BASE = "http://localhost:3700";
const LEAD_ID = 21;

const SLOW_MO = 50;
const BANNER_PAUSE = 2800;  // pause after showing banner before acting
const AFTER_ACT = 2500;     // pause after each save so viewer sees update

const dbCfg = {
  server: "172.41.1.73", port: 1433, user: "monchiant", password: "monchiant",
  database: "solardb", options: { encrypt: false, trustServerCertificate: true },
};

// Randomize per run
const rand = () => Math.floor(Math.random() * 1000);
const DATA = {
  bill: 2500 + rand() * 5,
  phase: ["1_phase", "3_phase"][rand() % 2],
  wantsBattery: ["yes", "no", "maybe"][rand() % 3],
  peakUsage: ["morning", "afternoon", "both"][rand() % 3],
  residence: ["detached", "townhouse"][rand() % 2],
  acUnits: `12000:${1 + rand() % 3},18000:${rand() % 2}`,
  roofMaterial: ["concrete_tile", "clay_tile", "metal_sheet"][rand() % 3],
  floors: 1 + rand() % 3,
  roofAreaM2: 40 + rand() % 60,
  roofTilt: 15 + rand() % 20,
  shading: ["none", "light", "moderate"][rand() % 3],
  roofAge: ["new", "mid", "old"][rand() % 3],
  meterSize: ["15_45", "30_100"][rand() % 2],
  caNumber: `${100000000000 + rand() * 1000}`,
  dbDistance: 5 + rand() % 15,
  surveyDate: "2026-04-" + String(20 + rand() % 10).padStart(2, "0"),
  timeSlot: ["morning", "afternoon"][rand() % 2],
  note: `บันทึกรอบทดสอบ #${rand()} — ${new Date().toLocaleTimeString("th-TH")}`,
};
console.log("🎲 Randomized data:", DATA);

const pause = ms => new Promise(r => setTimeout(r, ms));

async function dbSnap(label) {
  const pool = await sql.connect(dbCfg);
  const r = await pool.request().input("id", sql.Int, LEAD_ID).query(`
    SELECT l.status, l.pre_monthly_bill, l.pre_wants_battery, l.survey_confirmed,
           l.survey_floors, l.survey_roof_material, l.survey_monthly_bill, l.survey_note,
           b.booking_number, b.total_price as booking_price,
           (SELECT COUNT(*) FROM lead_activities WHERE lead_id = @id) as acts
    FROM leads l LEFT JOIN bookings b ON b.lead_id = l.id WHERE l.id = @id
  `);
  await pool.close();
  console.log(`\n📦 ${label}:`, r.recordset[0]);
  return r.recordset[0];
}

async function patchLead(page, body) {
  return page.evaluate(async ([id, b]) => {
    const r = await fetch(`/api/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
    });
    return r.ok;
  }, [LEAD_ID, body]);
}

async function banner(page, text) {
  console.log(`\n▶ ${text}`);
  await page.evaluate(t => {
    let el = document.getElementById("__banner");
    if (!el) {
      el = document.createElement("div");
      el.id = "__banner";
      Object.assign(el.style, {
        position: "fixed", top: "10px", left: "50%", transform: "translateX(-50%)",
        background: "#0f172a", color: "white", padding: "10px 16px", borderRadius: "12px",
        fontSize: "13px", fontWeight: "700", zIndex: "9999", fontFamily: "system-ui",
        boxShadow: "0 6px 20px rgba(0,0,0,0.35)", maxWidth: "92%", textAlign: "center",
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}

const browser = await puppeteer.launch({
  headless: false, slowMo: SLOW_MO, defaultViewport: null,
  args: ["--no-sandbox", "--window-size=460,920", "--window-position=60,30"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

try {
  const before = await dbSnap("BEFORE");

  // ─── Pipeline + search ───
  await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle0" });
  await banner(page, "เปิด Pipeline"); await pause(BANNER_PAUSE);

  await banner(page, "ค้นหา 'คาวี'"); await pause(1500);
  const searchInput = await page.$("input");
  if (searchInput) { await searchInput.click(); await page.keyboard.type("คาวี", { delay: 200 }); }
  await pause(BANNER_PAUSE);

  await banner(page, "คลิกการ์ดลูกค้า"); await pause(1500);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[role="button"]')];
    const t = cards.find(c => (c.textContent || "").includes("คาวี"));
    if (t) t.click();
  });
  await pause(3500);

  // ─── Step 01 Register sub-steps ───
  await banner(page, "STEP 01 · Register — Sub 1/5 ข้อมูล pre-survey"); await pause(BANNER_PAUSE);
  await patchLead(page, {
    pre_monthly_bill: DATA.bill, pre_electrical_phase: DATA.phase,
    pre_wants_battery: DATA.wantsBattery, pre_peak_usage: DATA.peakUsage,
    pre_residence_type: DATA.residence, pre_ac_units: DATA.acUnits,
  });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, "Sub 2/5 เลือกแพ็คเกจ #4 (Huawei 3kW + Battery)"); await pause(BANNER_PAUSE);
  await patchLead(page, { interested_package_id: 4 });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, `Sub 3/5 นัดสำรวจ ${DATA.surveyDate} (${DATA.timeSlot})`); await pause(BANNER_PAUSE);
  await patchLead(page, { survey_date: DATA.surveyDate, survey_time_slot: DATA.timeSlot });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, "Sub 4/5 ชำระมัดจำ 1,000 ฿"); await pause(BANNER_PAUSE);
  const bk = await page.evaluate(async (id) => {
    const r = await fetch("/api/bookings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: id, package_id: 4, total_price: 1000 }),
    });
    return r.ok ? r.json() : null;
  }, LEAD_ID);
  if (bk) {
    await page.evaluate(async (id) => {
      await fetch(`/api/bookings/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_confirmed: true, confirmed: true }),
      });
    }, bk.id);
    console.log(`  ✓ booking ${bk.booking_number}`);
  }
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, "Sub 5/5 ยืนยัน — status → survey"); await pause(BANNER_PAUSE);
  await patchLead(page, { status: "survey" });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT + 1000);

  // ─── Step 02 Survey sub-steps ───
  await banner(page, "STEP 02 · Survey — Sub 1/5 ยืนยันนัด"); await pause(BANNER_PAUSE);
  await patchLead(page, { survey_confirmed: true });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, "Sub 2/5 บ้าน/หลังคา"); await pause(BANNER_PAUSE);
  await patchLead(page, {
    survey_residence_type: DATA.residence, survey_floors: DATA.floors,
    survey_roof_material: DATA.roofMaterial, survey_roof_orientation: "ใต้",
    survey_roof_area_m2: DATA.roofAreaM2, survey_roof_tilt: DATA.roofTilt,
    survey_shading: DATA.shading, survey_roof_age: DATA.roofAge,
  });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, "Sub 3/5 ระบบไฟฟ้า"); await pause(BANNER_PAUSE);
  await patchLead(page, {
    survey_electrical_phase: DATA.phase, survey_monthly_bill: DATA.bill,
    survey_peak_usage: DATA.peakUsage, survey_grid_type: "on_grid",
    survey_utility: "MEA", survey_meter_size: DATA.meterSize,
    survey_ca_number: DATA.caNumber, survey_db_distance_m: DATA.dbDistance,
    survey_wants_battery: DATA.wantsBattery,
  });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT);

  await banner(page, "Sub 4/5 ยืนยันแพ็คเกจ"); await pause(BANNER_PAUSE);
  // no-op (already set at register)

  await banner(page, "Sub 5/5 บันทึก + จบ Survey"); await pause(BANNER_PAUSE);
  await patchLead(page, { survey_note: DATA.note, status: "quote" });
  await page.reload({ waitUntil: "networkidle0" }); await pause(AFTER_ACT + 1500);

  await banner(page, "✅ เสร็จ — Sales flow ถึง Survey done"); await pause(4000);

  const after = await dbSnap("AFTER");
  console.log("\n=== DIFF ===");
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      console.log(`  ${k}: ${JSON.stringify(before[k])} → ${JSON.stringify(after[k])}`);
    }
  }
} catch (e) {
  console.error("FATAL:", e.message);
} finally {
  await pause(2000);
  await browser.close();
}
