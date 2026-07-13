import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { requireAuth } from "@/lib/auth";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/gif",
  "application/pdf",
];

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    // Reject anything that isn't an image or PDF — no .html / .js / .exe / etc.
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = file.name.split(".").pop() || "jpg";
    const customName = formData.get("filename") as string | null;
    const leadId = formData.get("lead_id") as string | null;
    const type = formData.get("type") as string | null;
    const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
    // Random 6-hex suffix makes filenames collision-proof even if two uploads
    // from the same lead/type land in the same millisecond. The same suffix
    // is appended even when a customName is supplied — otherwise re-uploads
    // produce the same URL and browser/CDN caches keep serving the stale file.
    const rand = randomBytes(3).toString("hex");
    const stamp = `${Date.now()}_${rand}`;
    const built = leadId && type ? `lead${safe(leadId)}_${safe(type)}_${stamp}` : null;
    const base = customName ? `${safe(customName)}_${stamp}` : built ?? `doc_${stamp}`;
    const filename = `${base}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    const filepath = path.join(uploadDir, filename);

    // public/uploads is intentionally gitignored, so it may not exist on a
    // fresh checkout, deployment, or after uploads are cleaned. Always create
    // it at write time instead of relying on an empty directory in Git.
    await mkdir(uploadDir, { recursive: true });
    await writeFile(filepath, buffer);

    return NextResponse.json({ url: `/api/files/${filename}` });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
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
