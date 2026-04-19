import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import path from "path";

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
    const filename = customName ? `${customName}.${ext}` : `doc_${Date.now()}.${ext}`;
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
