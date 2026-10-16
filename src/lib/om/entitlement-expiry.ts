import { sql } from "@/lib/db";

// ตัดสิทธิ์ที่หมดอายุ (แผน docs/plan/20260924-02 เฟส 4 · งานเก็บตก)
//
// ★ สิทธิ์ที่มี valid_to (ตอนนี้มีแค่สัญญา 12 เดือนที่ลูกค้าซื้อ — grantPurchasedRights) พอเลยวันหมดอายุ
//   ส่วนที่ยังไม่ได้ใช้ต้องหายไปจริง · เขียนแถว source = 'expire' qty ติดลบ ผูก expire_of = grant ตัวนั้น
//   ⇒ ยอดสิทธิ์ทุกที่ (วิว + คิวรีที่ SUM เอง) ถูกตามโดยไม่ต้องแก้สูตร ดูเหตุผลใน migration 20260924-2300
// ★ ส่วนที่ไม่ได้ใช้ = qty − จำนวนครั้งที่ใช้ "ภายในช่วงอายุ" ของ grant (ประเภทงานเดียวกัน installation เดียวกัน)
//   การใช้ในช่วงนั้นคิดเข้า grant ที่หมดอายุก่อน (ลูกค้าซื้อสัญญามาเพื่อใช้ช่วงนั้น) — บ้านที่ซื้อสัญญา
//   ส่วนใหญ่สิทธิ์ฟรีหมดแล้ว (อยู่แท็บสิทธิ์หมด) จึงไม่มีสิทธิ์อื่นให้แย่งกัน
// ★ ตัดไม่เกินยอดคงเหลือปัจจุบัน — การหมดอายุต้องไม่ทำให้ยอดติดลบ (ติดลบมีความหมายว่า "ทำงานเกินสิทธิ์")
// ★ รันซ้ำได้ไม่ตัดซ้ำ: grant ที่มีแถว expire_of แล้วถือว่าตรวจแล้ว (unique index กันสองคำขอชนกัน)
//   ใช้ครบก่อนหมดอายุก็เขียนแถว qty 0 ไว้เป็นเครื่องหมาย

type Db = sql.ConnectionPool;

export async function expireOmGrants(db: Db): Promise<{ checked: number; forfeited: number }> {
  const due = (await db.request().query(`
    SELECT g.id, g.installation_id, g.qty, i.house_id,
           ISNULL(g.service_type_id, (SELECT TOP 1 id FROM om_service_type WHERE code = N'cleaning')) type_id,
           CONVERT(char(10), g.valid_from, 23) valid_from, CONVERT(char(10), g.valid_to, 23) valid_to, g.reason
      FROM om_entitlement_grants g
      JOIN om_installations i ON i.id = g.installation_id
     WHERE g.qty > 0 AND g.valid_to IS NOT NULL AND g.valid_to < CAST(GETDATE() AS DATE)
       AND g.source <> N'expire'
       AND NOT EXISTS (SELECT 1 FROM om_entitlement_grants x WHERE x.expire_of = g.id)`)).recordset as Array<{
    id: number; installation_id: number; qty: number; house_id: number; type_id: number;
    valid_from: string | null; valid_to: string; reason: string | null;
  }>;

  let forfeited = 0;
  for (const g of due) {
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      const rq = () => new sql.Request(tx)
        .input("inst", sql.Int, g.installation_id).input("t", sql.Int, g.type_id)
        .input("vf", sql.Date, g.valid_from ?? "1900-01-01").input("vt", sql.Date, g.valid_to);
      const used = Number((await rq().query(`
        SELECT COUNT(*) n FROM om_redemptions r
         WHERE r.installation_id = @inst AND r.status = N'used'
           AND ISNULL(r.service_type_id, (SELECT TOP 1 id FROM om_service_type WHERE code = N'cleaning')) = @t
           AND r.service_date BETWEEN @vf AND @vt`)).recordset[0].n);
      const balance = Number((await rq().query(`
        SELECT ISNULL(SUM(balance), 0) b FROM om_entitlement_balance
         WHERE installation_id = @inst AND service_type_id = @t`)).recordset[0].b);
      const cut = Math.max(0, Math.min(g.qty - used, balance));
      const reason = cut > 0
        ? `สิทธิ์หมดอายุ ${g.valid_to} · ไม่ได้ใช้ ${cut} ครั้ง${g.reason ? ` · ${g.reason}` : ""}`
        : `ตรวจหมดอายุ ${g.valid_to} · ใช้ครบแล้ว${g.reason ? ` · ${g.reason}` : ""}`;
      const ins = await new sql.Request(tx)
        .input("inst", sql.Int, g.installation_id).input("q", sql.Int, -cut).input("t", sql.Int, g.type_id)
        .input("r", sql.NVarChar(300), reason.slice(0, 300)).input("of", sql.Int, g.id)
        .query(`INSERT INTO om_entitlement_grants (installation_id, qty, source, reason, service_type_id, expire_of)
                OUTPUT INSERTED.id VALUES (@inst, @q, N'expire', @r, @t, @of)`);
      if (cut > 0) {
        await new sql.Request(tx)
          .input("h", sql.Int, g.house_id).input("i", sql.Int, g.installation_id)
          .input("ref", sql.Int, ins.recordset[0].id).input("q", sql.Int, -cut)
          .input("d", sql.NVarChar(400), `สิทธิ์หมดอายุ −${cut} (หมด ${g.valid_to})`)
          .input("rs", sql.NVarChar(300), reason.slice(0, 300))
          // action ต้องเป็น add/edit/remove (CK_om_ent_hist_action) — หมดอายุคือ "เพิ่มแถวติดลบ" ลง ledger จึงเป็น add
          //   ส่วนคำว่าหมดอายุอยู่ใน detail · actor = NULL = ระบบ
          .query(`INSERT INTO om_entitlement_history (house_id, installation_id, kind, [action], ref_id, qty, detail, reason, actor_user_id)
                  VALUES (@h, @i, N'grant', N'add', @ref, @q, @d, @rs, NULL)`);
      }
      await tx.commit();
      forfeited += cut;
    } catch (e) {
      try { await tx.rollback(); } catch {}
      // unique index ชน = อีกคำขอตัด grant นี้ไปแล้ว — ไม่ใช่ข้อผิดพลาด
      if (!/UX_om_grants_expire_of|duplicate key/i.test(String(e))) console.error(`expireOmGrants(${g.id})`, e);
    }
  }
  return { checked: due.length, forfeited };
}

// ตัดวันละครั้งตอนมีคนเปิดหน้า O&M (หน้ารายการ / บ้าน / ภาพรวม / LIFF) — แนวเดียวกับ flipJourneyDatesIfDue ฝั่งขาย
// ไม่ผูกกับตัวตั้งเวลาใน instrumentation เพราะตัวนั้นปิดได้ด้วย setting sync / env ของเครื่อง dev
// แต่การตัดสิทธิ์หมดอายุเป็นเรื่องความถูกต้องของตัวเลข ห้ามเงียบไปพร้อมกับ sync
// (ตัวจำวันอยู่ในหน่วยความจำ: restart กลางวัน = ตรวจซ้ำหนึ่งครั้ง ไม่เสียหายเพราะรันซ้ำได้)
let lastDay = "";
export async function expireOmGrantsIfDue(db: Db): Promise<void> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  if (lastDay === today) return;
  lastDay = today;
  try { await expireOmGrants(db); }
  catch (e) { lastDay = ""; console.error("expireOmGrantsIfDue", e); }
}
