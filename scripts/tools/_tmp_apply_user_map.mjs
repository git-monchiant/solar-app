// เติมข้อมูลตามผลการ map ที่ผู้ใช้ทำเอง (ไฟล์ "ผลการ Mapping ข้อมูลวันติดตั้ง.xlsx")
//
// ★ 9 ก.ย. 69 ผู้ใช้สั่ง "อิงจากที่ผม map ให้ก็ได้ ไปหา PO มาเติมบ้านที่ขาด"
//   เทียบแล้วผู้ใช้ map ได้ 1,546 บ้าน ผมได้ 1,331 — ผมพลาด 210 หลังที่มีในระบบจริง
//   สาเหตุ: (1) ตัวกรอง "ไม่ใช่แนวราบ" ไปจับคำว่า "สำนักงาน" ในชื่อบริษัทลูกค้า
//           "บริษัท เสนา เอชเอชพี 15 จำกัด (สำนักงานใหญ่)" ตัดทิ้ง 131 แถว
//       (2) ชื่อโครงการในชีตเป็นชื่อเรียกที่ไม่มีในทะเบียน (เอสวิลล์ คลองหลวง · Sena Park Grand …) 168 แถว
//       (3) บางแถวลูกค้าเป็นบริษัทอื่น ไม่มีคำว่า "เสนา" เลย 8 แถว
//   ⇒ รอบนี้ไม่ใช้ตัวกรองของผมแล้ว ใช้คู่ (รหัสโครงการ + บ้านเลขที่) จากไฟล์ผู้ใช้ตรง ๆ
//
// เติมเฉพาะช่องว่าง · ค่าที่ชนกันเก็บเป็น probable ให้ตัดสินในหน้าตั้งค่า · ลงที่มารายฟิลด์ทุกค่า
// รัน: node scripts/tools/_tmp_apply_user_map.mjs [--write]
import sql from "mssql"; import fs from "fs";
const PLAN = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/write_plan_user.json";
const FILE = "ผลการ Mapping ข้อมูลวันติดตั้ง.xlsx (ผู้ใช้ map เอง) + สรุป บ้านเสนาติดตั้ง solar ส่งพี่เปิ้ล 20260908.xlsx";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "เติมวันติดตั้ง/kW/PO ตามผลการ map ของผู้ใช้" }) + "\n");

const tx = new sql.Transaction(pool); await tx.begin();
const n = { batch: 0, houses: 0, date: 0, kw: 0, po: 0, poRows: 0, conflict: 0 };
try {
  let batchId = null;
  if (WRITE) {
    const b = await new sql.Request(tx).input("f", sql.NVarChar(200), FILE)
      .input("no", sql.NVarChar(300), "ยึดผลการ map ของผู้ใช้ (รหัสโครงการ + บ้านเลขที่) แล้วดึง PO/kW จากชีตบัญชีมาเติม")
      .input("rc", sql.Int, plan.length)
      .query(`INSERT INTO om_import_batches (source_file, note, row_count) OUTPUT INSERTED.id VALUES (@f, @no, @rc)`);
    batchId = b.recordset[0].id; n.batch = batchId;
  }
  const fs_ = async (v) => {
    if (!WRITE) return;
    await new sql.Request(tx).input("h", sql.Int, v.house_id).input("i", sql.Int, v.inst_id)
      .input("c", sql.VarChar(40), v.col)
      .input("nv", sql.NVarChar(200), v.newv == null ? null : String(v.newv))
      .input("ov", sql.NVarChar(200), v.oldv == null ? null : String(v.oldv))
      .input("b", sql.Int, batchId).input("r", sql.NVarChar(200), v.ref)
      .input("cf", sql.VarChar(12), v.conf)
      .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value,
                source_kind, batch_id, source_ref, match_method, confidence)
              VALUES (@h, @i, 'om_installations', @c, @nv, @ov, 'import', @b, @r,
                N'ผู้ใช้ map เอง (รหัสโครงการ + บ้านเลขที่)', @cf)`);
  };

  for (const p of plan) {
    let touched = false;
    const ref = `${p.ref} · ${p.pid} ${p.hn}`;

    if (p.install_date) {
      const r = WRITE ? await new sql.Request(tx).input("i", sql.Int, p.inst_id).input("d", sql.Date, p.install_date)
        .query(`UPDATE om_installations SET install_date=@d, updated_at=SYSDATETIMEOFFSET()
                WHERE id=@i AND install_date IS NULL`) : { rowsAffected: [1] };
      if (r.rowsAffected[0] === 1) { n.date++; touched = true; await fs_({ ...p, col: "install_date", newv: p.install_date, oldv: null, ref, conf: "confirmed" }); }
    }
    if (p.date_conflict) {
      n.conflict++;
      await fs_({ ...p, col: "install_date", newv: p.date_conflict, oldv: p.date_current,
        ref: `${ref} · ★ ไม่เขียนทับ ค่าเดิมต่างกัน`, conf: "probable" });
    }
    if (p.inverter_kw != null) {
      const r = WRITE ? await new sql.Request(tx).input("i", sql.Int, p.inst_id).input("k", sql.Decimal(10, 4), p.inverter_kw)
        .query(`UPDATE om_installations SET inverter_kw=@k, updated_at=SYSDATETIMEOFFSET()
                WHERE id=@i AND inverter_kw IS NULL`) : { rowsAffected: [1] };
      if (r.rowsAffected[0] === 1) { n.kw++; touched = true; await fs_({ ...p, col: "inverter_kw", newv: p.inverter_kw, oldv: null, ref, conf: "confirmed" }); }
    }

    // ★ ใบ PO เก็บได้หลายใบ (ตารางลูก) · ช่องหลักเก็บใบแรกไว้ให้หน้าจอเดิมใช้
    for (const po of p.pos ?? []) {
      if (!WRITE) { n.poRows++; continue; }
      const r = await new sql.Request(tx)
        .input("h", sql.Int, p.house_id).input("i", sql.Int, p.inst_id)
        .input("po", sql.NVarChar(80), po.po).input("d", sql.Date, po.date || null)
        .input("ref", sql.NVarChar(200), ref).input("b", sql.Int, batchId)
        .query(`IF NOT EXISTS (SELECT 1 FROM om_installation_pos
                                WHERE installation_id=@i AND po_number=@po
                                  AND ISNULL(po_date,'1900-01-01')=ISNULL(@d,'1900-01-01'))
                  INSERT INTO om_installation_pos (house_id, installation_id, po_number, po_date, kind, source_ref, batch_id)
                  VALUES (@h, @i, @po, @d, 'install', @ref, @b)`);
      if (r.rowsAffected[0] === 1) n.poRows++;
    }
    const first = (p.pos ?? [])[0];
    if (first) {
      const r = WRITE ? await new sql.Request(tx).input("i", sql.Int, p.inst_id).input("po", sql.NVarChar(50), first.po)
        .query(`UPDATE om_installations SET po_number=@po, updated_at=SYSDATETIMEOFFSET()
                WHERE id=@i AND po_number IS NULL`) : { rowsAffected: [1] };
      if (r.rowsAffected[0] === 1) { n.po++; touched = true; await fs_({ ...p, col: "po_number", newv: first.po, oldv: null, ref, conf: "confirmed" }); }
    }
    if (touched) n.houses++;
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
  console.log(`  batch id        : ${n.batch || "-"}`);
  console.log(`  บ้านที่แตะ      : ${n.houses}`);
  console.log(`  เติมวันติดตั้ง  : ${n.date}`);
  console.log(`  เติม kW         : ${n.kw}`);
  console.log(`  เติมช่อง PO หลัก: ${n.po}`);
  console.log(`  ใบ PO ที่บันทึก : ${n.poRows}`);
  console.log(`  บันทึกค่าชนกัน  : ${n.conflict}`);
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
