// ล้างบ้านที่ REM ยังไม่มีสัญญาโอน (ไม่มีลูกค้า/เบอร์/ระบบ/ประวัติล้าง/นัด) ให้เป็น "ห้องว่าง"
// → หน้าบ้านจะย้ายไปกลุ่มซ่อน "ยังไม่ขาย" เอง (house-scope bucketSql) และถ้า REM โอนทีหลัง rem_reconcile ดึงกลับเอง
// + ถอนสิทธิ์ตั้งต้น 4 ครั้ง (contract_base จาก import batch 6) พร้อมบันทึก om_entitlement_history ทุกแถว ย้อนกลับได้
// รัน: node scripts/tools/_tmp_vacate_unsold.mjs        (ตรวจอย่างเดียว)
//      node scripts/tools/_tmp_vacate_unsold.mjs --write (เขียนจริง ในทรานแซกชันเดียว)
import sql from "mssql"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const WRITE = process.argv.includes("--write");
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-08.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "om_houses/om_entitlement_grants/om_entitlement_history: ล้าง 7 บ้านที่ REM ยังไม่โอนเป็นห้องว่าง + ถอนสิทธิ์ตั้งต้น (คำสั่งผู้ใช้ 8 ก.ย.)" }) + "\n");

// 7 หลังที่ตรวจแล้ว 8 ก.ย. 69: unit_status ยัง occupied แต่ REM ไม่มีสัญญาโอน
const IDS = [13438, 13439, 13440, 14467, 14892, 14420, 13908];
const K = "REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2";
const TAG = "[8 ก.ย. 69 ล้างเป็นห้องว่าง — REM ยังไม่มีสัญญาโอน · ไม่มีลูกค้า/เบอร์/ระบบ/ประวัติล้าง · ถอนสิทธิ์ตั้งต้น 4 ครั้ง]";
const tx = new sql.Transaction(pool); await tx.begin();
const log = [];
try {
  for (const id of IDS) {
    // guard ซ้ำตอนเขียน: ยังว่างจริง + REM ยังไม่โอน
    const g = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT h.id, h.project_id, h.house_number, h.unit_status,
        (SELECT COUNT(*) FROM om_house_customers hc WHERE hc.house_id=h.id) n_cust,
        (SELECT COUNT(*) FROM om_rem_transfers t WHERE t.project_id=h.project_id AND t.house_number_key=${K}) n_transfer,
        (SELECT COUNT(*) FROM om_installations i JOIN om_redemptions r ON r.installation_id=i.id WHERE i.house_id=h.id) n_redeem,
        (SELECT COUNT(*) FROM om_bookings b WHERE b.house_id=h.id) n_book
      FROM om_houses h WHERE h.id=@id AND h.is_om=1 AND h.om_excluded_reason IS NULL AND ISNULL(h.phone,'')=''`)).recordset[0];
    if (!g || g.n_cust || g.n_transfer || g.n_redeem || g.n_book || g.unit_status !== "occupied") throw new Error(`guard fail house ${id}: ${JSON.stringify(g)}`);
    const grants = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT g.id, g.installation_id, g.qty, g.source FROM om_entitlement_grants g JOIN om_installations i ON i.id=g.installation_id WHERE i.house_id=@id`)).recordset;
    if (WRITE) {
      const u = await new sql.Request(tx).input("id", sql.Int, id).input("tag", sql.NVarChar(500), TAG).query(`
        UPDATE om_houses SET unit_status=N'ห้องว่าง', note=CASE WHEN ISNULL(note,N'')=N'' THEN @tag ELSE note+N' · '+@tag END, updated_at=SYSDATETIMEOFFSET()
        WHERE id=@id AND unit_status=N'occupied'`);
      if (u.rowsAffected[0] !== 1) throw new Error(`update rowcount ${u.rowsAffected[0]} house ${id}`);
      for (const gr of grants) {
        await new sql.Request(tx).input("h", sql.Int, id).input("i", sql.Int, gr.installation_id).input("r", sql.Int, gr.id).input("q", sql.Int, -gr.qty)
          .input("d", sql.NVarChar(400), `-${gr.qty} · ${gr.source} · ล้างเป็นห้องว่าง (REM ยังไม่โอน · สิทธิ์ตั้งต้นจาก import batch 6)`)
          .query(`INSERT INTO om_entitlement_history (house_id, installation_id, kind, [action], ref_id, qty, detail, reason, actor_user_id)
                  VALUES (@h, @i, N'grant', N'remove', @r, @q, @d, NULL, NULL)`);
        await new sql.Request(tx).input("r", sql.Int, gr.id).query(`DELETE FROM om_entitlement_grants WHERE id=@r`);
      }
    }
    log.push({ id, house: `${g.project_id} ${g.house_number}`, grants: grants.map((x) => `#${x.id} qty ${x.qty} ${x.source}`).join(", ") || "-" });
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.table(log);
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
