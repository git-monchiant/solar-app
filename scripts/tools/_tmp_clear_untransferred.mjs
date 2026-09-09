// ล้างข้อมูลบ้านที่ REM ยืนยันสด ๆ ว่า "ยังไม่โอน" และยังไม่มีลูกค้าผูก (ผู้ใช้สั่ง 9 ก.ย. 69)
//   ล้าง: วันติดตั้ง · วันโอน · อินเวอร์เตอร์ (ยี่ห้อ/SN/kW) · เลข PO (ทั้งช่องหลักและตารางลูก)
//         เลขใบรับประกัน · แบตเตอรี่ · สิทธิ์ล้างแผงคงเหลือ
//   ★ warranty_start เป็นคอลัมน์คำนวณ (install_date / transfer_date / rem_transfer_date) เขียนตรง ๆ ไม่ได้
//     ล้างวันติดตั้งกับวันโอนแล้วมันจะเหลือแค่ค่าจากทะเบียน REM เอง
//   คงไว้: ตัวระเบียนบ้าน · ข้อมูลที่มาจากทะเบียน REM (rem_*) · ของแถมตอนขาย (promo_*)
//   ตั้ง unit_status = 'ห้องว่าง' ⇒ บ้านไปอยู่กลุ่มซ่อน "ยังไม่ขาย" เอง และถ้า REM โอนทีหลัง
//   ตัว rem_reconcile จะดึงกลับลิสต์หลักให้เอง
//   ★ กันไว้ไม่ล้าง: บ้านที่มีประวัติล้างแผงจริง (ขัดกับคำว่ายังไม่โอน — ต้องให้คนดูก่อน)
// รัน: node scripts/tools/_tmp_clear_untransferred.mjs [--write]
import sql from "mssql"; import fs from "fs";
const SRC = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/transfer_live.json";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const all = JSON.parse(fs.readFileSync(SRC, "utf8"));
const target = all.filter((x) => x.status === "ยังไม่โอน" && !x.n_wash);
const held = all.filter((x) => x.status === "ยังไม่โอน" && x.n_wash);
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "ล้างข้อมูลบ้านที่ REM ยืนยันว่ายังไม่โอน (คำสั่งผู้ใช้ 9 ก.ย.)" }) + "\n");

const TAG = "[9 ก.ย. 69 ล้างข้อมูล — ถาม REM สดแล้วยังไม่มีสัญญาโอน · ไม่มีลูกค้าผูก · คืนเป็นห้องว่าง]";
const tx = new sql.Transaction(pool); await tx.begin();
const n = { houses: 0, inst: 0, pos: 0, grants: 0, grantQty: 0 };
try {
  for (const t of target) {
    // guard ซ้ำตอนเขียน: ยังไม่มีลูกค้า ยังไม่มีประวัติล้าง ยังไม่มีสัญญาโอนในทะเบียน
    const g = (await new sql.Request(tx).input("id", sql.Int, t.id).query(`
      SELECT h.id,
        (SELECT COUNT(*) FROM om_house_customers hc WHERE hc.house_id=h.id) n_cust,
        (SELECT COUNT(*) FROM om_installations i JOIN om_redemptions r ON r.installation_id=i.id WHERE i.house_id=h.id) n_wash,
        (SELECT COUNT(*) FROM om_bookings b WHERE b.house_id=h.id) n_book
      FROM om_houses h WHERE h.id=@id AND h.is_om=1 AND h.om_excluded_reason IS NULL`)).recordset[0];
    if (!g || g.n_cust || g.n_wash || g.n_book) throw new Error(`guard fail house ${t.id}: ${JSON.stringify(g)}`);
    if (!WRITE) { n.houses++; continue; }

    await new sql.Request(tx).input("id", sql.Int, t.id).input("tag", sql.NVarChar(500), TAG).query(`
      UPDATE om_houses SET unit_status = N'ห้องว่าง',
        note = CASE WHEN ISNULL(note, N'') = N'' THEN @tag ELSE note + N' · ' + @tag END,
        updated_at = SYSDATETIMEOFFSET()
      WHERE id = @id`);

    // ลบใบ PO ทุกใบของบ้านหลังนี้
    const po = await new sql.Request(tx).input("id", sql.Int, t.id)
      .query(`DELETE FROM om_installation_pos WHERE house_id = @id`);
    n.pos += po.rowsAffected[0];

    // ถอนสิทธิ์คงเหลือ พร้อมลงประวัติทุกแถว (ย้อนกลับได้)
    const grants = (await new sql.Request(tx).input("id", sql.Int, t.id).query(`
      SELECT g.id, g.installation_id, g.qty, g.source FROM om_entitlement_grants g
      JOIN om_installations i ON i.id = g.installation_id WHERE i.house_id = @id`)).recordset;
    for (const gr of grants) {
      await new sql.Request(tx).input("h", sql.Int, t.id).input("i", sql.Int, gr.installation_id)
        .input("r", sql.Int, gr.id).input("q", sql.Int, -gr.qty)
        .input("d", sql.NVarChar(400), `-${gr.qty} · ${gr.source} · ล้างข้อมูล: REM ยืนยันว่ายังไม่โอน`)
        .query(`INSERT INTO om_entitlement_history (house_id, installation_id, kind, [action], ref_id, qty, detail, reason, actor_user_id)
                VALUES (@h, @i, N'grant', N'remove', @r, @q, @d, NULL, NULL)`);
      await new sql.Request(tx).input("r", sql.Int, gr.id).query(`DELETE FROM om_entitlement_grants WHERE id = @r`);
      n.grants++; n.grantQty += gr.qty;
    }

    // ล้างช่องข้อมูลของระบบติดตั้ง — เก็บ rem_* และ promo_* ไว้ (มาจากทะเบียน ไม่ใช่ของที่กรอกเข้ามา)
    const inst = await new sql.Request(tx).input("id", sql.Int, t.id).query(`
      UPDATE om_installations SET install_date = NULL, transfer_date = NULL,
        inverter_kw = NULL, inverter_brand = NULL, inverter_sn = NULL,
        po_number = NULL, warranty_doc_no = NULL,
        battery_brand = NULL, battery_kwh = NULL, updated_at = SYSDATETIMEOFFSET()
      WHERE house_id = @id`);
    n.inst += inst.rowsAffected[0];

    // บันทึกที่มาว่าค่าถูกล้างเมื่อไหร่ ด้วยเหตุผลอะไร
    const ids = (await new sql.Request(tx).input("id", sql.Int, t.id)
      .query(`SELECT id FROM om_installations WHERE house_id = @id`)).recordset;
    for (const i of ids)
      await new sql.Request(tx).input("h", sql.Int, t.id).input("i", sql.Int, i.id)
        .input("r", sql.NVarChar(200), `REM /api/saleorder/transfer unit ${t.unitId ?? "-"} ตอบว่าไม่มีสัญญาโอน`)
        .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value, source_kind, source_ref, match_method, confidence)
                VALUES (@h, @i, 'om_installations', 'cleared', NULL, N'ล้างวันติดตั้ง/kW/PO/ประกัน/สิทธิ์', 'rem', @r, N'ถาม REM สดรายหลัง (9 ก.ย. 69)', 'confirmed')`);
    n.houses++;
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
  console.log(`  บ้านที่ล้าง       : ${n.houses}`);
  console.log(`  แถวระบบติดตั้ง    : ${n.inst}`);
  console.log(`  ใบ PO ที่ลบ       : ${n.pos}`);
  console.log(`  สิทธิ์ที่ถอน      : ${n.grants} รายการ (${n.grantQty} ครั้ง)`);
  console.log(`  ★ กันไว้ไม่ล้าง   : ${held.length} หลัง — ${held.map((h) => `${h.project_id} ${h.house_number} (ล้างแล้ว ${h.n_wash} ครั้ง)`).join(" · ")}`);
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
