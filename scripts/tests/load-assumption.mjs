import assert from "node:assert/strict";
import {
  AC_LOAD_FACTOR,
  AC_TIER_KW,
  computeLoad,
  defaultEvChargerKw,
  hasEvCharger,
  LOAD_COVERAGE_WARN,
  loadBillCheck,
  loadBillCoverage,
  loadSummaryText,
  missingLoadAnswers,
  parseLoadProfile,
  serializeLoadProfile,
  setEvCharger,
} from "../../src/lib/load-assumption.ts";

const row = (result, key) => result.rows.find(r => r.key === key);

// ── parse / serialise ───────────────────────────────────────────────
{
  assert.deepEqual(parseLoadProfile(null), {});
  assert.deepEqual(parseLoadProfile("not json"), {});
  assert.deepEqual(parseLoadProfile({ bogus: { qty: 1 }, fridge: {} }), {}, "unknown devices and empty entries dropped");
  const p = parseLoadProfile({ water_pump: { qty: "2", day_h: 50, night_h: -1, junk: 9 } });
  assert.deepEqual(p, { water_pump: { qty: 2, day_h: 12 } }, "strings coerced, hours clamped to 12, negatives/junk dropped");
  assert.deepEqual(parseLoadProfile({ fridge: { unknown: true, qty: 3 } }), { fridge: { unknown: true } }, "unknown wins over numbers");
  assert.equal(serializeLoadProfile({}), null, "nothing answered → NULL, not '{}'");
  const json = serializeLoadProfile({ fridge: { qty: 1 } });
  assert.equal(json, '{"v":1,"fridge":{"qty":1}}');
  assert.equal(serializeLoadProfile(parseLoadProfile(json)), json, "round-trip is stable (the API re-serialises every PATCH)");
}

// ── defaults come from the cited sources (see load-assumption.ts) ────
{
  // BTU ÷ EGAT Label No.5 fixed-speed minimum SEER, 2024 labels (13.17 ≤ 27,296 BTU; 12.56 above)
  assert.deepEqual(AC_TIER_KW, { "9000": 0.683, "12000": 0.911, "18000": 1.367, "24000": 1.822, gt24000: 2.389 });
  // ISO 16358 load line on Bangkok temperatures: ≈0.72 by day, ≈0.54 at night
  assert.deepEqual(AC_LOAD_FACTOR, { day: 0.7, night: 0.55 });
  // EGAT: a 32 A wallbox needs 1-phase 30(100)A or 3-phase
  assert.equal(defaultEvChargerKw("15_45", "1_phase"), 3.6);
  assert.equal(defaultEvChargerKw("15_45", "3_phase"), 7.4);
  assert.equal(defaultEvChargerKw("30_100", "1_phase"), 7.4);
  assert.equal(defaultEvChargerKw(null, null), 7.4, "unknown meter: a home with a charger has usually been upgraded");
}

// ── nothing asked: every row blank, no totals ───────────────────────
{
  const r = computeLoad({});
  assert.equal(r.asked, false);
  assert.equal(r.rows.length, 9);
  assert.ok(r.rows.every(x => x.status === "blank" && x.dayKwh === null && x.nightKwh === null));
  assert.equal(r.dayKwh, null);
  assert.equal(r.nightShare, null);
  assert.equal(loadSummaryText(r), "");
}

// ── a full answer, worked by hand ───────────────────────────────────
{
  const input = {
    ac_split: JSON.stringify({ day: { "12000": 2 }, night: { "12000": 1, "18000": 1 } }),
    appliances: "ev",
    ev_charge_period: "night",
    load_profile: JSON.stringify({
      ac: { day_h: 6, night_h: 8 },
      fridge: { qty: 1 },
      water_heater: { qty: 2, day_min: 0, night_min: 30 },
      water_pump: { qty: 1, day_h: 1, night_h: 0 },
      washer: { loads_per_week: 4, period: "day" },
      electronics: { qty: 3, day_h: 4, night_h: 5 },
      lighting: { qty: 15, day_h: 0, night_h: 5 },
      ev: { charger_kw: 7.4, sessions_per_week: 3, hours_per_session: 4 },
    }),
  };
  const r = computeLoad(input);
  assert.equal(r.asked, true);
  assert.equal(r.computedRows, 9);
  // AC: day 2 × 0.911 × 0.7 = 1.28 kW × 6 h; night (0.911 + 1.367) × 0.55 = 1.25 kW × 8 h
  assert.equal(row(r, "ac_day").dayKwh, 7.7);
  assert.equal(row(r, "ac_day").nightApplies, false, "daytime-AC row has no night cells");
  assert.equal(row(r, "ac_night").nightKwh, 10);
  assert.equal(row(r, "ac_night").qty, "2");
  assert.equal(row(r, "ac_night").size, "12,000 BTU × 1, 18,000 BTU × 1 · รวมเฉลี่ย ≈1.25 kW",
    "kW is both units together — 'รวม' so nobody multiplies by จำนวน again");
  assert.equal(row(r, "fridge").dayKwh, 0.6);             // 0.05 kW × 12 h
  assert.equal(row(r, "fridge").nightHours, 12);
  assert.equal(row(r, "water_heater").nightKwh, 3.5);     // 2 × 3.5 kW × 0.5 h
  assert.equal(row(r, "water_heater").dayKwh, 0);
  assert.equal(row(r, "water_pump").dayKwh, 0.3);
  assert.equal(row(r, "washer").dayHours, 0.57);          // 4 loads × 1 h ÷ 7
  assert.equal(row(r, "washer").dayKwh, 0.3);             // 0.5 kW × 0.57 h
  assert.equal(row(r, "washer").nightKwh, 0);
  assert.equal(row(r, "electronics").nightKwh, 1.5);
  assert.equal(row(r, "lighting").nightKwh, 0.8);         // 15 × 10 W × 5 h = 0.75
  assert.equal(row(r, "ev").nightHours, 1.71);            // 3 × 4 h ÷ 7
  assert.equal(row(r, "ev").nightKwh, 12.7);              // 7.4 kW × 1.71 h
  assert.equal(row(r, "ev").dayKwh, 0);
  assert.equal(r.dayKwh, 10.1);
  assert.equal(r.nightKwh, 29.1);
  assert.equal(Math.round(r.nightShare * 100), 74);
  assert.equal(missingLoadAnswers(input).length, 0);
  assert.equal(loadSummaryText(r), "กลางวัน 10.1 kWh · กลางคืน 29.1 kWh/วัน (กลางคืน 74%)");
}

// ── printed figures multiply out (lead 974's answers, 28 Sep 2026) ──
{
  const r = computeLoad({
    ac_split: JSON.stringify({ day: { "9000": 2 }, night: { "9000": 2, "12000": 1 } }),
    appliances: "ev", ev_charge_period: "night",
    load_profile: { ac: { day_h: 7, night_h: 9 }, water_heater: { qty: 2, day_min: 10, night_min: 30 },
      washer: { loads_per_week: 2, period: "day" }, ev: { charger_kw: 3.6, sessions_per_week: 5, hours_per_session: 6 } },
  });
  // each printed row: kW × hours (as shown) → the kWh shown, to 1 decimal
  const acN = row(r, "ac_night");
  assert.match(acN.size, /รวมเฉลี่ย ≈1\.25 kW$/, "(2 × 0.683 + 0.911) × 0.55, shown to 2 decimals");
  assert.equal(acN.nightKwh, 11.3);                        // 1.25 × 9 = 11.25
  assert.equal(row(r, "water_heater").dayHours, 0.17);     // 10 min
  assert.equal(row(r, "water_heater").dayKwh, 1.2);        // 2 × 3.5 × 0.17 = 1.19
  assert.equal(row(r, "washer").dayHours, 0.29);           // 2 ÷ 7
  assert.equal(row(r, "washer").dayKwh, 0.1);              // 0.5 × 0.29 = 0.145
  assert.equal(row(r, "ev").nightHours, 4.29);             // 30 ÷ 7
  assert.equal(row(r, "ev").nightKwh, 15.4);               // 3.6 × 4.29 = 15.44
}

// ── none / unknown / partial ────────────────────────────────────────
{
  const input = {
    ac_split: JSON.stringify({ night: { "9000": 1 } }),
    load_profile: { fridge: { qty: 0 }, water_heater: { unknown: true }, water_pump: { qty: 1 } },
  };
  const r = computeLoad(input);
  assert.equal(row(r, "fridge").status, "answered");
  assert.equal(row(r, "fridge").dayKwh, 0, "ไม่มี is a real zero");
  assert.equal(row(r, "water_heater").status, "unknown");
  assert.equal(row(r, "water_heater").dayKwh, null, "ไม่ทราบ computes nothing (the report prints the word)");
  assert.equal(row(r, "water_pump").status, "partial");
  assert.equal(row(r, "water_pump").qty, "1");
  assert.equal(row(r, "water_pump").dayKwh, null);
  assert.equal(row(r, "ac_day").status, "answered", "split exists with no daytime unit → known zero");
  assert.equal(row(r, "ac_night").status, "partial", "machines known, hours not asked");
  assert.equal(row(r, "ac_night").size, "9,000 BTU × 1 · เฉลี่ย ≈0.38 kW", "one unit → no 'รวม'");
  assert.equal(row(r, "ev").status, "answered", "questions touched and no charger → EV row is 0");
  assert.equal(row(r, "ev").qty, "0");
  assert.deepEqual(
    missingLoadAnswers(input),
    ["ชั่วโมงเปิดแอร์", "ปั๊มน้ำ", "เครื่องซักผ้า", "ทีวี / เครื่องใช้ไฟฟ้าอิเล็กทรอนิกส์", "หลอดไฟส่องสว่าง"],
    "ไม่มี and ไม่ทราบ both count as asked; partial and missing do not",
  );
}

// ── EV: charge period without a charger is ignored (plan D6) ────────
{
  const leftover = computeLoad({ ev_charge_period: "night" });
  assert.equal(row(leftover, "ev").status, "blank", "nothing asked → blank, not a phantom charger");
  assert.deepEqual(missingLoadAnswers({ ev_charge_period: "night" }).includes("การชาร์จรถ EV"), false);
  const noPeriod = { appliances: "ev", load_profile: { ev: { sessions_per_week: 2, hours_per_session: 3 } } };
  assert.equal(row(computeLoad(noPeriod), "ev").status, "partial", "kWh can't be placed without a period");
  assert.ok(missingLoadAnswers(noPeriod).includes("ช่วงชาร์จ EV"));
  const defaultKw = computeLoad({ appliances: "ev", ev_charge_period: "day", load_profile: { ev: { sessions_per_week: 7, hours_per_session: 1 } } });
  assert.equal(row(defaultKw, "ev").dayKwh, 7.4, "charger defaults to 7.4 kW");
  const smallMeter = computeLoad({ appliances: "ev", ev_charge_period: "night", meter_size: "15_45", electrical_phase: "1_phase", load_profile: { ev: { sessions_per_week: 7, hours_per_session: 1 } } });
  assert.equal(row(smallMeter, "ev").nightKwh, 3.6, "1-phase 15(45)A meter → 3.6 kW default");
  assert.equal(row(smallMeter, "ev").size, "3.6 kW");
  const chosen = computeLoad({ appliances: "ev", ev_charge_period: "night", meter_size: "15_45", load_profile: { ev: { charger_kw: 7.4, sessions_per_week: 7, hours_per_session: 1 } } });
  assert.equal(row(chosen, "ev").nightKwh, 7.4, "an explicit answer beats the meter default");
  assert.equal(hasEvCharger("water_heater, ev"), true);
  assert.equal(hasEvCharger(null), false);
  // the info tab's มี/ไม่มี row flips only 'ev' inside the CSV
  assert.equal(setEvCharger(null, true), "ev");
  assert.equal(setEvCharger("water_heater", true), "water_heater,ev");
  assert.equal(setEvCharger("ev", true), "ev", "no duplicate");
  assert.equal(setEvCharger("water_heater, ev", false), "water_heater", "other codes kept");
  assert.equal(setEvCharger("ev", false), null, "empty → null, as the form stores ไม่มี");
}

// ── bill coverage ───────────────────────────────────────────────────
{
  const r = computeLoad({ load_profile: { water_pump: { qty: 1, day_h: 12, night_h: 12 } } }); // 7.2 kWh/day
  assert.equal(r.dayKwh, 3.6);
  // 7.2 kWh × 30 = 216 kWh vs 1,080 ฿ ÷ 5 ฿ = 216 kWh
  assert.equal(loadBillCoverage(r, 1080, null), 1);
  assert.equal(loadBillCoverage(r, 1080, 4), 0.8, "quotation's own ฿/kWh wins over the default");
  assert.equal(loadBillCoverage(r, null, 5), null);
  assert.equal(loadBillCoverage(computeLoad({}), 1080, 5), null);
}

// ── bill check: warn above 1.5× the bill, name the biggest row ─────
{
  assert.equal(LOAD_COVERAGE_WARN, 1.5);
  // lead 1132 (prod, 9 Oct 2026): EV 7.4 kW × 6 h every night against a 4,000 ฿ bill
  const ev = computeLoad({
    appliances: "ev", ev_charge_period: "night",
    load_profile: { fridge: { unknown: true }, water_heater: { unknown: true }, water_pump: { unknown: true },
      washer: { unknown: true }, electronics: { unknown: true }, lighting: { unknown: true },
      ev: { sessions_per_week: 7, hours_per_session: 6 } },
  });
  const c = loadBillCheck(ev, 4000, null);
  assert.equal(c.complete, false, "AC never asked → not complete");
  assert.equal(c.warn, true, "44.4 kWh × 30 = 1,332 vs 800 kWh billed");
  assert.deepEqual(c.top, { label: "ที่ชาร์จรถ EV", kwh: 44.4 });
  const ok = loadBillCheck(computeLoad({ load_profile: { water_pump: { qty: 1, day_h: 12, night_h: 12 } } }), 1080, null);
  assert.equal(ok.coverage, 1);
  assert.equal(ok.warn, false);
  assert.equal(loadBillCheck(ev, null, null), null, "no bill → nothing to compare");
}

console.log("load-assumption: all tests passed");
