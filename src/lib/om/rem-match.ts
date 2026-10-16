import { sql } from "@/lib/db";
import { houseKey, phoneKey } from "@/lib/om/rem";

// จับ lead ของระบบขาย เข้ากับบ้านในทะเบียน REM
// วัดกับข้อมูลจริง 2 ก.ย.: lead ที่ขายจนจบ 278 ราย · เป็นบ้านในโครงการเสนา 136 · จับได้ 124 (91.2%)
//   ความแม่น: 2 วิธีอิสระชี้สัญญาใบเดียวกัน 81/87 (93%) · ที่ต่างคือคนมีบ้านหลายหลัง ไม่ใช่จับผิดหลัง
//
// ★ กติกาที่ผู้ใช้เคาะ 1 ก.ย.: บ้านเลขที่ใช้ได้เฉพาะ "ภายในโครงการเดียวกัน" เท่านั้น
//   (พิสูจน์แล้วว่าบ้าน 29/xx ของ VIVA ไปแมตช์ K9 กับ SK2 ครบทั้ง 29 หลัง = false positive 100%)
// ★ ไม่มั่นใจ = ไม่แตะข้อมูลจริง แต่ต้องไม่หายเงียบ — เข้าคิว om_match_queue ให้คนตัดสิน

export type Tier = "confident" | "likely" | "unknown";

export type Candidate = {
  contract_id: string | null; project_id: string; project_name: string | null;
  unit_id: string | null; house_number: string | null;
  transfer_date: string | null; owner_names: string;
  via: "project_house" | "citizen_id" | "phone";
  transferred: boolean;
};

export type MatchResult = {
  lead_id: number; tier: Tier; reason: string;
  best: Candidate | null; candidates: Candidate[];
};

export type LeadInput = {
  id: number; full_name: string | null; project_id: number | null;
  house_number: string | null; phone: string | null; id_card_number: string | null;
};

const TITLES = /^(คุณ|นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|ดร\.|นายแพทย์|แพทย์หญิง|พญ\.|นพ\.|บริษัท|บจก\.|หจก\.)\s*/;
const normName = (s: string | null | undefined) => String(s ?? "").replace(TITLES, "").replace(/\s/g, "");
const surname = (s: string | null | undefined) => {
  const parts = String(s ?? "").replace(TITLES, "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const SELECT_CANDS = `
  SELECT t.contract_id, t.project_id, t.project_name, t.unit_id, t.house_number,
         CONVERT(varchar(33), t.transfer_date, 126) transfer_date,
         STUFF((SELECT N', ' + LTRIM(RTRIM(ISNULL(o2.first_name,N'') + N' ' + ISNULL(o2.last_name,N'')))
                FROM om_rem_owners o2 WHERE o2.contract_id = t.contract_id
                ORDER BY o2.is_main DESC, o2.id FOR XML PATH(N''), TYPE).value(N'.', N'nvarchar(max)'), 1, 2, N'') owner_names,
         CAST(1 AS bit) transferred`;

export async function matchLead(db: sql.ConnectionPool, lead: LeadInput): Promise<MatchResult> {
  const hk = houseKey(lead.house_number);
  const pk = phoneKey(lead.phone);
  const cid = /^\d{13}$/.test(String(lead.id_card_number ?? "").replace(/[-\s]/g, ""))
    ? String(lead.id_card_number).replace(/[-\s]/g, "") : "";

  const r = await db.request()
    .input("sales_pid", sql.Int, lead.project_id)
    .input("hk", sql.NVarChar(100), hk || null)
    .input("cid", sql.NVarChar(20), cid || null)
    .input("pk", sql.NVarChar(20), pk || null)
    .query(`
      -- A · โครงการที่จับคู่ไว้แล้ว + บ้านเลขที่ (ต้องอยู่ในโครงการเดียวกันเท่านั้น)
      ${SELECT_CANDS}, N'project_house' via
      FROM om_project_map m
      JOIN om_rem_transfers t ON t.project_id = m.rem_project_id AND t.house_number_key = @hk
      WHERE m.sales_project_id = @sales_pid AND m.match_type <> 'outside' AND @hk IS NOT NULL;

      -- A2 · บ้านที่ขายแล้วแต่ยังไม่โอน (ไม่มีสัญญา) — มีแต่ในทะเบียน unit
      SELECT NULL contract_id, u.project_id, u.project_name, u.unit_id, u.house_number,
             NULL transfer_date, N'' owner_names, CAST(0 AS bit) transferred, N'project_house' via
      FROM om_project_map m
      JOIN om_rem_units u ON u.project_id = m.rem_project_id AND u.house_number_key = @hk
      WHERE m.sales_project_id = @sales_pid AND m.match_type <> 'outside' AND @hk IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM om_rem_transfers t WHERE t.unit_id = u.unit_id);

      -- B · เลขบัตร → สัญญา
      ${SELECT_CANDS}, N'citizen_id' via
      FROM om_rem_owners o JOIN om_rem_transfers t ON t.contract_id = o.contract_id
      WHERE @cid IS NOT NULL AND o.citizen_id = @cid;

      -- C · เบอร์ → สัญญา
      ${SELECT_CANDS}, N'phone' via
      FROM om_rem_owners o JOIN om_rem_transfers t ON t.contract_id = o.contract_id
      WHERE @pk IS NOT NULL AND o.phone_key = @pk;`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const A = [...(rs[0] ?? []), ...(rs[1] ?? [])] as unknown as Candidate[];
  const ident = [...(rs[2] ?? []), ...(rs[3] ?? [])] as unknown as Candidate[];
  const all = [...A, ...ident];
  const hasIdentityKey = Boolean(cid || pk);

  if (!all.length) {
    return { lead_id: lead.id, tier: "unknown", best: null, candidates: [],
      reason: hk ? "หาบ้านเลขที่นี้ในทะเบียน REM ไม่เจอ" : "ไม่มีบ้านเลขที่ และหาจากเลขบัตร/เบอร์ไม่เจอ" };
  }

  // มีทั้งสองทาง → ตรวจว่าชี้สัญญาใบเดียวกันไหม
  if (A.length && ident.length) {
    const same = A.find((a) => a.contract_id && ident.some((b) => b.contract_id === a.contract_id));
    if (same) return { lead_id: lead.id, tier: "confident", best: same, candidates: all,
      reason: `โครงการ+บ้านเลขที่ และ${ident[0].via === "citizen_id" ? "เลขบัตร" : "เบอร์"} ชี้สัญญาใบเดียวกัน` };
    // ชี้คนละใบ — ส่วนใหญ่คือคนมีบ้านหลายหลัง แต่ตัดสินเองไม่ได้
    return { lead_id: lead.id, tier: "unknown", best: A[0], candidates: all,
      reason: `โครงการ+บ้านเลขที่ชี้ ${A[0].house_number} แต่${ident[0].via === "citizen_id" ? "เลขบัตร" : "เบอร์"}ชี้ ${ident[0].project_id} ${ident[0].house_number} — น่าจะมีบ้านหลายหลัง` };
  }

  // เจอจากโครงการ+บ้านเลขที่อย่างเดียว → ใช้ชื่อเจ้าของช่วยยืนยัน
  if (A.length) {
    if (A.length > 1) return { lead_id: lead.id, tier: "unknown", best: A[0], candidates: all,
      reason: `บ้านเลขที่ ${lead.house_number} ตรงกับ ${A.length} สัญญาในโครงการเดียวกัน` };
    const a = A[0];
    const ln = normName(lead.full_name), sn = surname(lead.full_name);
    const owners = String(a.owner_names ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const nameHit = owners.some((o) => normName(o) === ln || (ln.length >= 4 && (normName(o).includes(ln) || ln.includes(normName(o)))));
    const famHit = Boolean(sn) && owners.some((o) => surname(o) === sn);
    if (nameHit) return { lead_id: lead.id, tier: "confident", best: a, candidates: all, reason: "โครงการ+บ้านเลขที่ตรง และชื่อตรงกับเจ้าของ" };
    if (!a.transferred) return { lead_id: lead.id, tier: "likely", best: a, candidates: all, reason: "เจอ unit ในทะเบียน แต่ยังไม่โอน — ยังไม่มีสัญญาให้ยืนยัน" };
    if (famHit) return { lead_id: lead.id, tier: "likely", best: a, candidates: all, reason: `นามสกุลตรงกับเจ้าของ (${a.owner_names}) แต่ชื่อไม่ตรง` };
    if (hasIdentityKey) return { lead_id: lead.id, tier: "unknown", best: a, candidates: all,
      reason: `บ้านตรงแต่เจ้าของคนละคน (REM ว่า ${a.owner_names}) และเลขบัตร/เบอร์ก็ไม่ตรงกับสัญญาไหนเลย` };
    return { lead_id: lead.id, tier: "likely", best: a, candidates: all, reason: `โครงการ+บ้านเลขที่ตรง แต่ไม่มีเลขบัตร/เบอร์ให้ยืนยัน (REM ว่าเจ้าของคือ ${a.owner_names})` };
  }

  // เจอจากตัวคนอย่างเดียว — ไม่มีบ้านเลขที่/โครงการให้ยัน
  const uniq = [...new Map(ident.map((c) => [c.contract_id, c])).values()];
  if (uniq.length === 1) {
    const c = uniq[0];
    const viaTxt = c.via === "citizen_id" ? "เลขบัตร" : "เบอร์";
    return { lead_id: lead.id, tier: c.via === "citizen_id" ? "likely" : "unknown", best: c, candidates: all,
      reason: c.via === "citizen_id"
        ? `${viaTxt}ตรงกับเจ้าของสัญญาเดียว (${c.project_id} ${c.house_number}) แต่ฝั่งขายไม่ได้ระบุโครงการ/บ้านเลขที่ให้ยัน`
        : `${viaTxt}ตรงกับสัญญาเดียว (${c.project_id} ${c.house_number}) — เบอร์อย่างเดียวอ่อนเกินกว่าจะเชื่อ` };
  }
  return { lead_id: lead.id, tier: "unknown", best: uniq[0] ?? null, candidates: all,
    reason: `เจอ ${uniq.length} สัญญาที่ผูกกับคนนี้ — เลือกเองไม่ได้ว่าติดตั้งที่หลังไหน` };
}
