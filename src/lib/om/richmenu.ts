import "server-only";
import { sql } from "@/lib/db";
import { getOmDb, OM_LINE } from "@/lib/om/line";

// ═══ Rich Menu ของโมดูล O&M ═══
// ★ LINE ไม่มี endpoint "update rich menu" และรูปอัปโหลดได้ครั้งเดียวต่อเมนู
//   ⇒ ทุกการแก้ = สร้างเมนูใหม่ + อัปโหลดรูป + สลับผู้ใช้มาที่ตัวใหม่ (blue-green)
//     เมนูเก่าเก็บไว้ (โควตา 1,000 ตัว/OA) กด rollback = สลับกลับ ไม่ต้องสร้างใหม่
// ★ ไม่ตั้ง default rich menu ของ OA — เมนูนี้ผูกรายคนเฉพาะลูกค้าที่ยืนยันตัวตนแล้ว
//   (คนอื่นเห็นตามที่ OA ตั้งไว้เดิม เราไม่ไปแตะของทีมขาย)

const API = "https://api.line.me/v2/bot";
const DATA_API = "https://api-data.line.me/v2/bot";

export const RICHMENU_SIZE = { width: 2500, height: 1686 } as const;
export const MAX_AREAS = 20;          // ข้อจำกัด LINE
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const LINK_BATCH = 500;        // bulk link ได้สูงสุด 500 คน/ครั้ง

export type RichMenuAction =
  | { type: "uri"; label?: string; uri: string }
  | { type: "message"; label?: string; text: string }
  | { type: "postback"; label?: string; data: string };

export interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: RichMenuAction;
}

export interface RichMenuLayout {
  size: { width: number; height: number };
  areas: RichMenuArea[];
}

/** ผังมาตรฐาน 6 ช่อง (3 คอลัมน์ × 2 แถว) — คำนวณ bounds จากกริด ไม่ต้องกรอกพิกัดเอง */
export function gridLayout(cells: RichMenuAction[], cols = 3, rows = 2): RichMenuLayout {
  const w = Math.floor(RICHMENU_SIZE.width / cols);
  const h = Math.floor(RICHMENU_SIZE.height / rows);
  return {
    size: { ...RICHMENU_SIZE },
    areas: cells.slice(0, cols * rows).map((action, i) => ({
      bounds: { x: (i % cols) * w, y: Math.floor(i / cols) * h, width: w, height: h },
      action,
    })),
  };
}

export function validateLayout(layout: RichMenuLayout): string | null {
  if (!layout?.areas?.length) return "ต้องมีอย่างน้อย 1 ช่อง";
  if (layout.areas.length > MAX_AREAS) return `ช่องกดเกิน ${MAX_AREAS} ช่อง`;
  for (const a of layout.areas) {
    if (!a.action) return "มีช่องที่ยังไม่ได้กำหนดการทำงาน";
    if (a.action.type === "uri" && !a.action.uri) return "ช่องเปิดลิงก์ยังไม่ได้ใส่ URL";
    if (a.action.type === "message" && !a.action.text) return "ช่องส่งข้อความยังไม่ได้ใส่ข้อความ";
  }
  return null;
}

async function lineFetch(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${OM_LINE.token}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`LINE ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
}

/** สร้างเมนูบน LINE + อัปโหลดรูป → คืน richMenuId */
export async function createOnLine(opts: {
  name: string;
  chatBarText: string;
  layout: RichMenuLayout;
  image: Buffer;
  imageMime: string;
}): Promise<string> {
  const created = await lineFetch(`${API}/richmenu`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      size: opts.layout.size,
      selected: false,
      name: opts.name.slice(0, 300),
      chatBarText: opts.chatBarText.slice(0, 14),
      areas: opts.layout.areas,
    }),
  });
  const { richMenuId } = (await created.json()) as { richMenuId: string };

  // รูปอัปโหลดได้ครั้งเดียวต่อเมนู — ถ้าพลาดต้องทิ้งเมนูนี้แล้วสร้างใหม่
  try {
    await lineFetch(`${DATA_API}/richmenu/${richMenuId}/content`, {
      method: "POST",
      headers: { "Content-Type": opts.imageMime },
      body: new Uint8Array(opts.image),
    });
  } catch (e) {
    await deleteOnLine(richMenuId).catch(() => {});
    throw e;
  }
  return richMenuId;
}

export async function deleteOnLine(richMenuId: string) {
  await lineFetch(`${API}/richmenu/${richMenuId}`, { method: "DELETE" });
}

/** ผูกเมนูให้ผู้ใช้เป็นชุด — LINE รับได้ 500 คนต่อครั้ง */
export async function bulkLink(richMenuId: string, userIds: string[]) {
  for (let i = 0; i < userIds.length; i += LINK_BATCH) {
    await lineFetch(`${API}/richmenu/bulk/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ richMenuId, userIds: userIds.slice(i, i + LINK_BATCH) }),
    });
  }
}

/** ผูกเมนูให้ผู้ใช้คนเดียว — ใช้ตอน verify OTP สำเร็จ */
export async function linkUser(richMenuId: string, userId: string) {
  await lineFetch(`${API}/user/${userId}/richmenu/${richMenuId}`, { method: "POST" });
}

/** เมนูที่ใช้งานอยู่ของ audience นั้น (ไว้ผูกให้ลูกค้าที่เพิ่งยืนยันตัวตน) */
export async function activeRichMenuId(audience = "verified"): Promise<string | null> {
  const db = await getOmDb();
  const r = await db.request()
    .input("aud", sql.NVarChar(20), audience)
    .query(`SELECT TOP 1 rich_menu_id FROM om_richmenu_versions
            WHERE audience = @aud AND status = 'active' ORDER BY version_no DESC`);
  return r.recordset[0]?.rich_menu_id ?? null;
}

/** รายชื่อ LINE user ที่ควรได้เมนูนี้ = ลูกค้าที่ยืนยันตัวตนแล้วและยังเป็นเพื่อนอยู่ */
export async function verifiedUserIds(): Promise<string[]> {
  const db = await getOmDb();
  const r = await db.request().query(
    `SELECT DISTINCT u.line_user_id FROM om_line_users u
     WHERE u.is_follow = 1 AND u.identity_status = 'verified'`);
  return r.recordset.map((x) => x.line_user_id as string);
}

export interface DeployResult {
  ok: boolean;
  simulated: boolean;      // true = OM_LINE ปิดอยู่ ยังไม่ยิง LINE จริง
  richMenuId: string | null;
  linked: number;
  message: string;
}

/**
 * เผยแพร่เวอร์ชันหนึ่งแบบ blue-green
 *  - เวอร์ชันยังไม่มี rich_menu_id → สร้างบน LINE + อัปโหลดรูปก่อน
 *  - มีแล้ว (กรณี rollback) → ใช้ตัวเดิม ไม่สร้างซ้ำ
 *  - ผูกผู้ใช้ที่ยืนยันตัวตนทั้งหมดมาที่เมนูนี้ แล้วปรับสถานะในฐาน
 * ถ้า OM_LINE_ENABLED = false จะทำงานโหมดจำลอง (อัปเดตฐานอย่างเดียว) เพื่อพัฒนา/ทดสอบได้ก่อนต่อ channel จริง
 */
export async function deployVersion(versionId: number, userId: number | null): Promise<DeployResult> {
  const db = await getOmDb();
  const v = (await db.request().input("id", sql.Int, versionId)
    .query(`SELECT * FROM om_richmenu_versions WHERE id = @id`)).recordset[0];
  if (!v) throw new Error("ไม่พบเวอร์ชันนี้");

  const layout = JSON.parse(v.layout) as RichMenuLayout;
  const invalid = validateLayout(layout);
  if (invalid) throw new Error(invalid);

  await db.request().input("id", sql.Int, versionId)
    .query(`UPDATE om_richmenu_versions SET status = 'publishing' WHERE id = @id`);

  const simulated = !OM_LINE.enabled || !OM_LINE.token;
  let richMenuId: string | null = v.rich_menu_id;
  let linked = 0;

  try {
    if (!simulated) {
      if (!richMenuId) {
        if (!v.image_blob) throw new Error("ยังไม่ได้อัปโหลดรูปพื้นเมนู");
        richMenuId = await createOnLine({
          name: v.name, chatBarText: v.chat_bar_text, layout,
          image: v.image_blob as Buffer, imageMime: v.image_mime || "image/png",
        });
      }
      const users = await verifiedUserIds();
      await bulkLink(richMenuId, users);
      linked = users.length;
    } else {
      richMenuId = richMenuId || `simulated-${versionId}`;
      linked = (await verifiedUserIds()).length;
    }

    // สลับ: ตัวเก่าเป็นประวัติ ตัวนี้ active (ทำเป็นก้อนเดียว)
    await db.request()
      .input("id", sql.Int, versionId)
      .input("aud", sql.NVarChar(20), v.audience)
      .input("rid", sql.NVarChar(60), richMenuId)
      .input("by", sql.Int, userId)
      .query(`UPDATE om_richmenu_versions SET status = 'history'
                WHERE audience = @aud AND status IN ('active','publishing') AND id <> @id;
              UPDATE om_richmenu_versions
                SET status = 'active', rich_menu_id = @rid, deployed_by = @by, deployed_at = SYSDATETIMEOFFSET()
                WHERE id = @id;`);

    return {
      ok: true, simulated, richMenuId, linked,
      message: simulated
        ? `บันทึกเป็นเวอร์ชันใช้งานแล้ว (โหมดจำลอง — ยังไม่ได้ต่อ LINE channel) · ผู้ใช้ที่จะได้เมนูนี้ ${linked} คน`
        : `เผยแพร่แล้ว · ผูกเมนูให้ลูกค้าที่ยืนยันตัวตน ${linked} คน (มีผลทันที)`,
    };
  } catch (e) {
    await db.request().input("id", sql.Int, versionId)
      .query(`UPDATE om_richmenu_versions SET status = 'failed' WHERE id = @id`);
    throw e;
  }
}
