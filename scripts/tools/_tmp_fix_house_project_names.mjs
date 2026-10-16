// ยึดชื่อโครงการตาม REM ทั้งระบบ (ผู้ใช้สั่ง 9 ก.ย. 69 "แก้เลยสิยึดตาม REM")
//
// ★ ตรวจแล้ว: om_projects.name_th ตรงกับชื่อจาก REM ครบทั้ง 81 โครงการที่ดึงทะเบียนได้
//   ปัญหาอยู่ที่ om_houses.project_name ล้วน ๆ — รหัสเดียวกันบันทึกชื่อคนละแบบ 58 รหัส 2,261 หลัง
//   (เช่น LIFIS มี 5 แบบ รวมพิมพ์ผิด "เสนาวิวล์" และชื่อโครงการอื่นหลุดมา "Sena Park Ville2")
//   ⇒ เขียนชื่อจากทะเบียนทับให้ทุกหลัง เฉพาะโครงการที่ยืนยันชื่อจาก REM ได้
//   โครงการที่ REM ยิงไม่ได้ (35) ไม่แตะ — ไม่มีต้นทางให้ยึด
// รัน: node scripts/tools/_tmp_fix_house_project_names.mjs [--write]
import sql from "mssql"; import fs from "fs";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE om_houses.project_name " : "ตรวจ (SELECT) ") + "ยึดชื่อโครงการตาม REM ทั้งระบบ" }) + "\n");

// เฉพาะโครงการที่ REM ยืนยันชื่อได้ และยังมีบ้านที่ชื่อไม่ตรง
const todo = (await pool.request().query(`
  SELECT p.project_id, p.name_th, r.rem_name,
         (SELECT COUNT(*) FROM om_houses h WHERE h.project_id = p.project_id
            AND ISNULL(h.project_name, N'') <> p.name_th) n_wrong
  FROM om_projects p
  CROSS APPLY (SELECT TOP 1 project_name rem_name FROM om_rem_units u
               WHERE u.project_id = p.project_id AND ISNULL(u.project_name, N'') <> N'') r
  WHERE ISNULL(p.name_th, N'') <> N''
  ORDER BY p.project_id`)).recordset;

const drift = todo.filter((t) => t.rem_name !== t.name_th);
if (drift.length) {
  console.log("★ ทะเบียนไม่ตรงกับ REM (จะใช้ชื่อจาก REM แทน):");
  for (const d of drift) console.log(`   ${d.project_id}  ทะเบียน: ${d.name_th}  →  REM: ${d.rem_name}`);
}
const work = todo.filter((t) => t.n_wrong > 0);
console.log(`\nโครงการที่ยืนยันชื่อจาก REM ได้: ${todo.length} · ต้องแก้บ้าน: ${work.length} โครงการ`);
console.log(`บ้านที่ชื่อไม่ตรง: ${work.reduce((s, t) => s + t.n_wrong, 0).toLocaleString()} หลัง`);

const tx = new sql.Transaction(pool); await tx.begin();
let renamed = 0, projs = 0;
try {
  for (const t of work) {
    const name = t.rem_name;   // ★ ยึด REM เป็นหลัก
    if (WRITE) {
      // ทะเบียนต้องตรง REM ด้วย ไม่งั้นครั้งหน้าจะเพี้ยนอีก
      if (name !== t.name_th)
        await new sql.Request(tx).input("p", sql.NVarChar(20), t.project_id).input("n", sql.NVarChar(200), name)
          .query(`UPDATE om_projects SET name_th = @n WHERE project_id = @p`);
      const r = await new sql.Request(tx).input("p", sql.NVarChar(20), t.project_id).input("n", sql.NVarChar(200), name)
        .query(`UPDATE om_houses SET project_name = @n, updated_at = SYSDATETIMEOFFSET()
                WHERE project_id = @p AND ISNULL(project_name, N'') <> @n`);
      renamed += r.rowsAffected[0];
    } else renamed += t.n_wrong;
    projs++;
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.log(`\n${WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง"}`);
  console.log(`  โครงการที่แก้ : ${projs}`);
  console.log(`  บ้านที่เปลี่ยนชื่อ: ${renamed.toLocaleString()}`);
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
