// Centralised insert into lead_activities. Every API route that mutates a lead
// in a way the customer/team would care about (upload slip, confirm payment,
// schedule a survey, send a LINE message, etc.) calls logLeadActivity so the
// timeline on the lead detail page stays complete.
//
// Failures are swallowed and logged — activity logging is best-effort and must
// never break the underlying mutation.

import { sql } from "@/lib/db";
import { formatTHB } from "@/lib/utils/formatters";
import type { ConnectionPool, Transaction } from "mssql";

type DbExec = ConnectionPool | Transaction;

function newRequest(db: DbExec) {
  // Pool exposes .request(); Transaction needs `new sql.Request(tx)`.
  if (typeof (db as ConnectionPool).request === "function") return (db as ConnectionPool).request();
  return new sql.Request(db as Transaction);
}

export async function logLeadActivity(
  db: DbExec,
  opts: {
    leadId: number;
    activityType: string;
    title: string;
    note?: string | null;
    userId?: number | null;
  },
): Promise<void> {
  try {
    await newRequest(db)
      .input("lead_id", sql.Int, opts.leadId)
      .input("activity_type", sql.NVarChar(30), opts.activityType.slice(0, 30))
      .input("title", sql.NVarChar(200), opts.title.slice(0, 200))
      .input("note", sql.NVarChar(sql.MAX), opts.note ?? null)
      .input("created_by", sql.Int, opts.userId ?? 1)
      .query(`
        INSERT INTO lead_activities (lead_id, activity_type, title, note, created_by)
        VALUES (@lead_id, @activity_type, @title, @note, @created_by)
      `);
  } catch (e) {
    console.error("logLeadActivity failed:", e);
  }
}

// Map slip_field + step_no → human readable Thai label. Mirrors report/page.tsx
// (stepLabels) — keep in sync if labels change there.
export function paymentStepLabel(slipField: string, _stepNo?: number): string {
  if (slipField === "pre_slip_url") return "ค่าจอง Survey";
  if (slipField === "order_before_slip") return "ก่อนติดตั้ง";
  if (slipField === "order_after_slip") return "หลังติดตั้ง";
  const extra = /^install_extra_(\d+)$/.exec(slipField);
  if (extra) return `ค่าใช้จ่ายเพิ่มเติม ครั้งที่ ${parseInt(extra[1]) + 1}`;
  const m = /^order_installment_(\d+)$/.exec(slipField);
  if (m) return `งวดที่ ${parseInt(m[1]) + 1}`;
  return slipField || "-";
}

export function fmtBaht(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "-";
  return `฿${formatTHB(Number(n))}`;
}

export function fmtThaiDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    return dt.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(d);
  }
}
