import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth";
import { fetchHuaweiWarranty } from "@/lib/huawei-warranty";

// POST /api/huawei-warranty
// Body: { serial_no: string, lead_id?: number | string }
// Pulls the warranty record + official certificate PDF from Huawei's ESCP
// portal for a device serial number. Captcha is solved automatically via Gemini.
// Returns: { ok, info, url } where `url` points at the saved certificate PDF
//          (served through /api/files/[filename]) or is null when none exists.
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const serialNo = String(body?.serial_no || "").trim();
  const leadId = body?.lead_id != null ? String(body.lead_id) : null;
  if (!serialNo) {
    return NextResponse.json({ error: "serial_no required" }, { status: 400 });
  }

  try {
    const { info, pdf } = await fetchHuaweiWarranty(serialNo);
    if (!info) {
      // 200 (not 404) so apiFetch on the client doesn't throw and can surface
      // this message to the user instead of a generic "API error".
      return NextResponse.json({
        ok: false,
        error: "ไม่พบข้อมูลรับประกัน Huawei สำหรับ Serial นี้",
      });
    }

    let url: string | null = null;
    if (pdf) {
      const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
      const stamp = `${Date.now()}_${randomBytes(3).toString("hex")}`;
      const prefix = leadId ? `lead${safe(leadId)}_` : "";
      const filename = `${prefix}huawei_warranty_${safe(serialNo)}_${stamp}.pdf`;
      await writeFile(path.join(process.cwd(), "public", "uploads", filename), pdf);
      url = `/api/files/${filename}`;
    }

    return NextResponse.json({ ok: true, info, url });
  } catch (error) {
    console.error("POST /api/huawei-warranty error:", error);
    const message = error instanceof Error ? error.message : "ดึงข้อมูล Huawei ไม่สำเร็จ";
    // 200 + ok:false: let the client read `error` (apiFetch throws on non-2xx).
    return NextResponse.json({ ok: false, error: message });
  }
}
