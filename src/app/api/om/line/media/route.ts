import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { MEDIA_RULES, mediaKindOf, storeMedia } from "@/lib/om/media";

// POST multipart form-data { file } — แอดมินอัปโหลดรูป/วิดีโอก่อนส่งเข้าแชต
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "ต้องแนบไฟล์ (field: file)" }, { status: 400 });
  }

  const kind = mediaKindOf(file.type);
  if (!kind) {
    return NextResponse.json({ error: `ชนิดไฟล์ไม่รองรับ (${file.type}) — รูป JPEG/PNG หรือวิดีโอ MP4 เท่านั้น` }, { status: 400 });
  }
  if (file.size > MEDIA_RULES[kind].maxBytes) {
    const mb = Math.round(MEDIA_RULES[kind].maxBytes / 1024 / 1024);
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${mb}MB` }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const media = await storeMedia({ kind, mime: file.type, buf, source: "admin", createdBy: gate.userId });
  return NextResponse.json({ ok: true, media_id: media.id, token: media.token, kind });
}
