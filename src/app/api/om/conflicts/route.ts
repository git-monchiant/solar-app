import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ค่าที่ขัดกัน — ไฟล์ต้นทางให้ค่าหนึ่ง ระบบมีอีกค่าหนึ่ง
// ★ ระบบไม่เขียนทับเอง เก็บไว้ใน om_field_sources (confidence='probable') ให้คนตัดสิน
//   ตัดสินได้ 2 ทาง: keep = ยึดของเดิม (แค่ปิดงาน) · apply = เขียนค่าจากไฟล์ทับของเดิม
//   ทั้งสองทางบันทึก resolved_at/resolved_action ไว้ ย้อนดูได้ว่าใครตัดสินอะไร

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;
// เขียนทับได้เฉพาะช่องที่รู้จัก — กันการยิงชื่อคอลัมน์มั่วเข้ามา
const WRITABLE: Record<string, "date" | "decimal" | "text"> = {
  install_date: "date",
  transfer_date: "date",
  inverter_kw: "decimal",
  po_number: "text",
  warranty_doc_no: "text",
  inverter_brand: "text",
};

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const done = u.get("done") === "1";
  const page = Math.max(1, Number(u.get("page") ?? 1));
  const size = Math.min(200, Math.max(10, Number(u.get("size") ?? 50)));

  const db = await getOmDb();
  const r = await db.request()
    .input("off", sql.Int, (page - 1) * size).input("n", sql.Int, size)
    .query(`
      SELECT COUNT(*) total FROM om_field_sources
      WHERE confidence = 'probable' AND resolved_at IS ${done ? "NOT NULL" : "NULL"};

      SELECT f.id, f.house_id, f.installation_id, f.column_name, f.old_value, f.new_value,
             f.source_ref, f.match_method, f.resolved_action,
             CONVERT(char(10), f.created_at, 23) created_at,
             CONVERT(char(10), f.resolved_at, 23) resolved_at,
             h.house_number, h.project_id, ISNULL(pj.name_th, h.project_name) project_name,
             ib.source_file batch_file
      FROM om_field_sources f
      JOIN om_houses h ON h.id = f.house_id
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
      LEFT JOIN om_import_batches ib ON ib.id = f.batch_id
      WHERE f.confidence = 'probable' AND f.resolved_at IS ${done ? "NOT NULL" : "NULL"}
      ORDER BY h.project_id, h.house_number, f.id
      OFFSET @off ROWS FETCH NEXT @n ROWS ONLY;

      SELECT f.column_name, COUNT(*) n FROM om_field_sources f
      WHERE f.confidence = 'probable' AND f.resolved_at IS NULL GROUP BY f.column_name;`);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return NextResponse.json({
    total: (rs[0][0] as { total: number }).total,
    rows: rs[1],
    byColumn: rs[2],
    page, size,
  });
}

// POST { ids: number[], action: "keep" | "apply" }
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  const action = b.action === "apply" ? "apply" : b.action === "keep" ? "keep" : "";
  if (!ids.length) return NextResponse.json({ error: "ต้องเลือกอย่างน้อย 1 รายการ" }, { status: 400 });
  if (!action) return NextResponse.json({ error: "action ต้องเป็น keep หรือ apply" }, { status: 400 });
  if (ids.length > 1000) return NextResponse.json({ error: "ครั้งละไม่เกิน 1,000 รายการ" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  let applied = 0, kept = 0, skipped = 0;
  try {
    for (const id of ids) {
      const row = (await new sql.Request(tx).input("id", sql.Int, id).query(`
        SELECT id, house_id, installation_id, column_name, new_value, old_value
        FROM om_field_sources WHERE id = @id AND confidence = 'probable' AND resolved_at IS NULL`)).recordset[0];
      if (!row) { skipped++; continue; }

      if (action === "apply") {
        const kind = WRITABLE[row.column_name as string];
        // ค่าที่ไม่รู้จัก หรือไม่มีแถวติดตั้ง = เขียนไม่ได้ ปิดงานไม่ได้ ต้องข้ามไว้ให้เห็น
        if (!kind || !row.installation_id || row.new_value == null) { skipped++; continue; }
        const rq = new sql.Request(tx).input("i", sql.Int, row.installation_id);
        if (kind === "date") rq.input("v", sql.Date, String(row.new_value));
        else if (kind === "decimal") rq.input("v", sql.Decimal(10, 4), Number(row.new_value));
        else rq.input("v", sql.NVarChar(80), String(row.new_value));
        await rq.query(`UPDATE om_installations SET [${row.column_name}] = @v, updated_at = SYSDATETIMEOFFSET() WHERE id = @i`);
        // ที่มาของค่าใหม่ต้องมีร่องรอยด้วย ไม่ใช่เปลี่ยนเงียบ ๆ
        await new sql.Request(tx)
          .input("h", sql.Int, row.house_id).input("i", sql.Int, row.installation_id)
          .input("c", sql.VarChar(40), row.column_name).input("nv", sql.NVarChar(200), String(row.new_value))
          .input("ov", sql.NVarChar(200), row.old_value == null ? null : String(row.old_value))
          .input("u", sql.Int, gate.userId ?? null)
          .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value,
                    source_kind, source_ref, match_method, confidence, actor_user_id)
                  VALUES (@h, @i, 'om_installations', @c, @nv, @ov, 'manual',
                    N'แอดมินเลือกใช้ค่าจากไฟล์ต้นทาง', N'ตัดสินค่าขัดกันจากหน้าตั้งค่า', 'confirmed', @u)`);
        applied++;
      } else kept++;

      await new sql.Request(tx).input("id", sql.Int, id)
        .input("a", sql.VarChar(12), action).input("u", sql.Int, gate.userId ?? null)
        .query(`UPDATE om_field_sources SET resolved_at = SYSDATETIMEOFFSET(), resolved_action = @a, resolved_by = @u
                WHERE id = @id AND resolved_at IS NULL`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, applied, kept, skipped });
}
