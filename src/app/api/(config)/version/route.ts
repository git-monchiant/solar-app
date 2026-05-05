import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  const raw = await readFile(path.join(process.cwd(), "package.json"), "utf-8");
  const { version } = JSON.parse(raw) as { version: string };
  return NextResponse.json({ version });
}
