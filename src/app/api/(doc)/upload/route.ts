import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split(".").pop() || "jpg";
    const customName = formData.get("filename") as string | null;
    const leadId = formData.get("lead_id") as string | null;
    const type = formData.get("type") as string | null;
    const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
    // Random 6-hex suffix makes filenames collision-proof even if two uploads
    // from the same lead/type land in the same millisecond.
    const rand = randomBytes(3).toString("hex");
    const built = leadId && type ? `lead${safe(leadId)}_${safe(type)}_${Date.now()}_${rand}` : null;
    const filename = `${customName ? safe(customName) : built ?? `doc_${Date.now()}_${rand}`}.${ext}`;
    const filepath = path.join(process.cwd(), "public", "uploads", filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ url: `/api/files/${filename}` });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const fileUrl = req.nextUrl.searchParams.get("file");
    if (!fileUrl) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    const filename = fileUrl.replace(/^\/api\/files\//, "").replace(/^\/uploads\//, "");
    if (!filename || filename.includes("/") || filename.includes("..")) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    const filepath = path.join(process.cwd(), "public", "uploads", filename);
    await unlink(filepath).catch(() => {});

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
