import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { logLeadActivity } from "@/lib/lead-activity-log";

// /api/leads/[id]/devices
//
// GET  → { inverters, batteries, panels } — all three device types in one
//        roundtrip so the Warranty step can hydrate its form without 3 fetches.
// PUT  → replace all of one type. Body: { type, items }. The "replace" pattern
//        matches the WarrantyStep UI which always saves the full set on each
//        submit; spares us a per-row diff. Empty items array clears the type.
//
// Returns are after-write reads so the client gets canonical ids + timestamps
// to render without a follow-up GET.

type DeviceType = "inverters" | "batteries" | "panels";
const TYPES: DeviceType[] = ["inverters", "batteries", "panels"];
type MatchStatus = "matched" | "partial" | "unmatched" | "unreadable";
interface EvidencePhoto {
  url: string;
  brand: string | null;
  spec: number | null;
  detected_serials: string[];
  matched_serials: string[];
  boxes: Array<number[] | null>;
  match_status: MatchStatus;
  uploaded_at: string;
  uploaded_by: number;
}
type EvidencePhotos = Record<DeviceType, EvidencePhoto[]>;

function legacyEvidence(url: string): EvidencePhoto {
  return { url, brand: null, spec: null, detected_serials: [], matched_serials: [], boxes: [], match_status: "unreadable", uploaded_at: "", uploaded_by: 0 };
}

function parseEvidencePhotos(raw: unknown): EvidencePhotos {
  const empty: EvidencePhotos = { inverters: [], batteries: [], panels: [] };
  if (typeof raw !== "string" || !raw.trim()) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<DeviceType, unknown>>;
    for (const type of TYPES) {
      if (Array.isArray(parsed[type])) {
        empty[type] = parsed[type].flatMap((item): EvidencePhoto[] => {
          if (typeof item === "string" && item.length > 0) return [legacyEvidence(item)];
          if (!item || typeof item !== "object") return [];
          const value = item as Partial<EvidencePhoto>;
          if (typeof value.url !== "string" || !value.url) return [];
          return [{
            url: value.url,
            brand: typeof value.brand === "string" ? value.brand : null,
            spec: typeof value.spec === "number" ? value.spec : null,
            detected_serials: Array.isArray(value.detected_serials) ? value.detected_serials.filter((s): s is string => typeof s === "string") : [],
            matched_serials: Array.isArray(value.matched_serials) ? value.matched_serials.filter((s): s is string => typeof s === "string") : [],
            boxes: Array.isArray(value.boxes) ? value.boxes.map(box => Array.isArray(box) && box.length === 4 && box.every(n => typeof n === "number") ? box : null) : [],
            match_status: ["matched", "partial", "unmatched", "unreadable"].includes(String(value.match_status)) ? value.match_status as MatchStatus : "unreadable",
            uploaded_at: typeof value.uploaded_at === "string" ? value.uploaded_at : "",
            uploaded_by: typeof value.uploaded_by === "number" ? value.uploaded_by : 0,
          }];
        });
      }
    }
  } catch {
    // The first version stored a flat CSV. Preserve those files under the
    // Inverter group rather than dropping evidence during the format upgrade.
    empty.inverters = raw.split(",").map(url => url.trim()).filter(Boolean).map(legacyEvidence);
  }
  return empty;
}

const TABLE: Record<DeviceType, string> = {
  inverters: "lead_inverters",
  batteries: "lead_batteries",
  panels:    "lead_panels",
};

interface InverterRow { brand?: string | null; kw?: number | null; serial_no?: string | null; photo_url?: string | null; photo_box?: string | null; cert_url?: string | null; }
interface BatteryRow  { brand?: string | null; kwh?: number | null; serial_no?: string | null; photo_url?: string | null; photo_box?: string | null; }
interface PanelRow    { brand?: string | null; serial_no?: string | null; photo_url?: string | null; photo_box?: string | null; }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const db = await getDb();
    const [inv, batt, pan] = await Promise.all([
      db.request().input("id", sql.Int, leadId).query(`
        SELECT id, brand, kw, serial_no, photo_url, photo_box, cert_url, position, created_at, updated_at
        FROM lead_inverters WHERE lead_id = @id ORDER BY position, id
      `),
      db.request().input("id", sql.Int, leadId).query(`
        SELECT id, brand, kwh, serial_no, photo_url, photo_box, position, created_at, updated_at
        FROM lead_batteries WHERE lead_id = @id ORDER BY position, id
      `),
      db.request().input("id", sql.Int, leadId).query(`
        SELECT id, brand, serial_no, photo_url, photo_box, position, created_at, updated_at
        FROM lead_panels WHERE lead_id = @id ORDER BY position, id
      `),
    ]);
    // Evidence is optional until migration 014 has been applied. Never let a
    // missing evidence column hide the canonical Serial/device rows.
    let evidencePhotos: EvidencePhotos = { inverters: [], batteries: [], panels: [] };
    try {
      const evidence = await db.request().input("id", sql.Int, leadId).query(`
        SELECT warranty_evidence_photos FROM leads WHERE id = @id
      `);
      if (evidence.recordset.length === 0) {
        return NextResponse.json({ error: "lead not found" }, { status: 404 });
      }
      evidencePhotos = parseEvidencePhotos(evidence.recordset[0].warranty_evidence_photos);
    } catch (e) {
      const dbError = e as { number?: number };
      if (dbError.number !== 207) throw e; // SQL Server: invalid column name
    }
    return NextResponse.json({
      inverters: fixDates(inv.recordset),
      batteries: fixDates(batt.recordset),
      panels:    fixDates(pan.recordset),
      evidencePhotos,
    });
  } catch (e) {
    console.error("GET /api/leads/[id]/devices error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// Append-only evidence upload for leads that have moved past Warranty.
// This deliberately updates only leads.warranty_evidence_photos: device rows,
// serial numbers, and all fields consumed by the warranty PDF stay untouched.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json() as { type?: unknown; photo_url?: unknown; brand?: unknown; spec?: unknown; serials?: unknown; boxes?: unknown };
    const type = body.type as DeviceType;
    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of ${TYPES.join("|")}` }, { status: 400 });
    }
    const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() : "";
    const isManagedUpload = /^\/(?:api\/files|uploads)\/[A-Za-z0-9._-]+$/.test(photoUrl);
    if (!photoUrl || photoUrl.length > 500 || !isManagedUpload) {
      return NextResponse.json({ error: "photo_url must be a valid uploaded image URL" }, { status: 400 });
    }

    const db = await getDb();
    const lead = await db.request().input("id", sql.Int, leadId).query(`
      SELECT status, warranty_evidence_photos FROM leads WHERE id = @id
    `);
    if (lead.recordset.length === 0) {
      return NextResponse.json({ error: "lead not found" }, { status: 404 });
    }
    if (!["gridtie", "closed"].includes(String(lead.recordset[0].status))) {
      return NextResponse.json({ error: "warranty step must be completed before adding evidence photos" }, { status: 409 });
    }

    const evidencePhotos = parseEvidencePhotos(lead.recordset[0].warranty_evidence_photos);
    const current = evidencePhotos[type];
    const serials = Array.isArray(body.serials)
      ? body.serials.filter((s): s is string => typeof s === "string").map(s => s.trim()).filter(Boolean)
      : [];
    const incomingKeys = new Set<string>();
    const duplicateInRequest = serials.filter(serial => {
      const key = serial.toLowerCase();
      if (incomingKeys.has(key)) return true;
      incomingKeys.add(key);
      return false;
    });
    const existingRows = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT serial_no FROM ${TABLE[type]} WHERE lead_id = @id AND serial_no IS NOT NULL`);
    const existingByKey = new Map<string, string>(existingRows.recordset.map(row => [String(row.serial_no).trim().toLowerCase(), String(row.serial_no).trim()]));
    const evidenceSerialKeys = new Set(
      current
        .filter(item => item.url !== photoUrl)
        .flatMap(item => item.detected_serials)
        .map(serial => serial.trim().toLowerCase())
        .filter(Boolean),
    );
    const duplicateSerials = Array.from(new Set([
      ...duplicateInRequest,
      ...serials.filter(serial => existingByKey.has(serial.toLowerCase()) || evidenceSerialKeys.has(serial.toLowerCase())),
    ]));
    if (duplicateSerials.length > 0) {
      return NextResponse.json(
        { error: "พบ Serial ซ้ำ ไม่สามารถบันทึกได้", duplicateSerials },
        { status: 409 },
      );
    }
    const matchedSerials = serials.map(s => existingByKey.get(s.toLowerCase())).filter((s): s is string => !!s);
    const rawBoxes: unknown[] = Array.isArray(body.boxes) ? body.boxes : [];
    const boxes = rawBoxes.length > 0
      ? serials.map((_, i) => {
          const box = rawBoxes[i];
          return Array.isArray(box) && box.length === 4 && box.every(n => typeof n === "number") ? box as number[] : null;
        })
      : serials.map(() => null);
    const matchStatus: MatchStatus = serials.length === 0
      ? "unreadable"
      : matchedSerials.length === serials.length
      ? "matched"
      : matchedSerials.length > 0
      ? "partial"
      : "unmatched";
    const record: EvidencePhoto = {
      url: photoUrl,
      brand: typeof body.brand === "string" && body.brand.trim() ? body.brand.trim().slice(0, 100) : null,
      spec: body.spec !== null && body.spec !== undefined && Number.isFinite(Number(body.spec)) ? Number(body.spec) : null,
      detected_serials: serials,
      matched_serials: matchedSerials,
      boxes,
      match_status: matchStatus,
      uploaded_at: new Date().toISOString(),
      uploaded_by: gate.userId,
    };
    const alreadySaved = current.some(item => item.url === photoUrl);
    evidencePhotos[type] = alreadySaved ? current : [...current, record];
    const totalPhotos = TYPES.reduce((sum, key) => sum + evidencePhotos[key].length, 0);
    if (totalPhotos > 100) {
      return NextResponse.json({ error: "maximum evidence photo count reached" }, { status: 400 });
    }

    await db.request()
      .input("id", sql.Int, leadId)
      .input("photos", sql.NVarChar(sql.MAX), JSON.stringify(evidencePhotos))
      .query(`UPDATE leads SET warranty_evidence_photos = @photos, updated_at = SYSUTCDATETIME() WHERE id = @id`);

    if (!alreadySaved) {
      await logLeadActivity(db, {
        leadId,
        activityType: "warranty_evidence",
        title: "แนบรูปหลักฐานหลังออกใบรับประกัน",
        note: `เพิ่มรูปหลักฐาน ${type} 1 รูป · สถานะ ${matchStatus} · อ่าน Serial ${serials.length} รายการ · ตรง ${matchedSerials.length} รายการ`,
        userId: gate.userId,
      });
    }
    return NextResponse.json({ evidencePhotos });
  } catch (e) {
    console.error("PATCH /api/leads/[id]/devices error:", e);
    return NextResponse.json({ error: "Failed to save warranty evidence photo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });
    const body = await req.json() as { type?: unknown; photo_url?: unknown };
    const type = body.type as DeviceType;
    const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() : "";
    if (!TYPES.includes(type) || !photoUrl) {
      return NextResponse.json({ error: "type and photo_url are required" }, { status: 400 });
    }

    const db = await getDb();
    const lead = await db.request().input("id", sql.Int, leadId).query(`
      SELECT status, warranty_evidence_photos FROM leads WHERE id = @id
    `);
    if (lead.recordset.length === 0) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    if (!["gridtie", "closed"].includes(String(lead.recordset[0].status))) {
      return NextResponse.json({ error: "warranty step must be completed before deleting evidence photos" }, { status: 409 });
    }

    const evidencePhotos = parseEvidencePhotos(lead.recordset[0].warranty_evidence_photos);
    const before = evidencePhotos[type].length;
    evidencePhotos[type] = evidencePhotos[type].filter(item => item.url !== photoUrl);
    if (evidencePhotos[type].length === before) {
      return NextResponse.json({ error: "evidence photo not found" }, { status: 404 });
    }
    await db.request()
      .input("id", sql.Int, leadId)
      .input("photos", sql.NVarChar(sql.MAX), JSON.stringify(evidencePhotos))
      .query(`UPDATE leads SET warranty_evidence_photos = @photos, updated_at = SYSUTCDATETIME() WHERE id = @id`);
    await logLeadActivity(db, {
      leadId,
      activityType: "warranty_evidence",
      title: "ลบรูปหลักฐานหลังออกใบรับประกัน",
      note: `ลบรูปหลักฐาน ${type} 1 รูป`,
      userId: gate.userId,
    });
    return NextResponse.json({ evidencePhotos, deletedUrl: photoUrl });
  } catch (e) {
    console.error("DELETE /api/leads/[id]/devices error:", e);
    return NextResponse.json({ error: "Failed to delete warranty evidence photo" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json() as { type?: string; items?: Array<InverterRow | BatteryRow | PanelRow> };
    const type = body.type as DeviceType;
    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of ${TYPES.join("|")}` }, { status: 400 });
    }
    const items = Array.isArray(body.items) ? body.items : [];

    const db = await getDb();
    const table = TABLE[type];

    // Transaction: clear current rows, insert new set in declared order.
    // Position comes from the array index so the UI can preserve ordering
    // (panel rows especially — installer-supplied SN sequence matters).
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await new sql.Request(tx).input("id", sql.Int, leadId)
        .query(`DELETE FROM ${table} WHERE lead_id = @id`);

      for (let i = 0; i < items.length; i++) {
        const it = items[i] as Record<string, unknown>;
        const r = new sql.Request(tx)
          .input("lead_id",   sql.Int,           leadId)
          .input("brand",     sql.NVarChar(100), (it.brand as string | null) ?? null)
          .input("serial_no", sql.NVarChar(100), (it.serial_no as string | null) ?? null)
          .input("position",  sql.Int,           i);
        if (type === "inverters") {
          r.input("kw",        sql.Decimal(10, 3), it.kw != null && it.kw !== "" ? Number(it.kw) : null);
          r.input("photo_url", sql.NVarChar(500), (it.photo_url as string | null) ?? null);
          r.input("photo_box", sql.NVarChar(50),  (it.photo_box as string | null) ?? null);
          r.input("cert_url",  sql.NVarChar(500), (it.cert_url  as string | null) ?? null);
          await r.query(`
            INSERT INTO lead_inverters (lead_id, brand, kw, serial_no, photo_url, photo_box, cert_url, position)
            VALUES (@lead_id, @brand, @kw, @serial_no, @photo_url, @photo_box, @cert_url, @position)
          `);
        } else if (type === "batteries") {
          r.input("kwh",       sql.Decimal(10, 3), it.kwh != null && it.kwh !== "" ? Number(it.kwh) : null);
          r.input("photo_url", sql.NVarChar(500), (it.photo_url as string | null) ?? null);
          r.input("photo_box", sql.NVarChar(50),  (it.photo_box as string | null) ?? null);
          await r.query(`
            INSERT INTO lead_batteries (lead_id, brand, kwh, serial_no, photo_url, photo_box, position)
            VALUES (@lead_id, @brand, @kwh, @serial_no, @photo_url, @photo_box, @position)
          `);
        } else {
          r.input("photo_url", sql.NVarChar(500), (it.photo_url as string | null) ?? null);
          r.input("photo_box", sql.NVarChar(50),  (it.photo_box as string | null) ?? null);
          await r.query(`
            INSERT INTO lead_panels (lead_id, brand, serial_no, photo_url, photo_box, position)
            VALUES (@lead_id, @brand, @serial_no, @photo_url, @photo_box, @position)
          `);
        }
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    // Read back so the client sees ids/timestamps without a follow-up GET.
    const select = type === "inverters"
      ? `SELECT id, brand, kw, serial_no, photo_url, photo_box, cert_url, position, created_at, updated_at FROM lead_inverters WHERE lead_id = @id ORDER BY position, id`
      : type === "batteries"
      ? `SELECT id, brand, kwh, serial_no, photo_url, photo_box, position, created_at, updated_at FROM lead_batteries WHERE lead_id = @id ORDER BY position, id`
      : `SELECT id, brand, serial_no, photo_url, photo_box, position, created_at, updated_at FROM lead_panels WHERE lead_id = @id ORDER BY position, id`;
    const result = await db.request().input("id", sql.Int, leadId).query(select);
    return NextResponse.json({ items: fixDates(result.recordset) });
  } catch (e) {
    console.error("PUT /api/leads/[id]/devices error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
