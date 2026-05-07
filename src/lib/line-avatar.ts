// Caches LINE profile pictures to public/uploads/line-avatars so the UI
// keeps showing them after LINE's CDN URLs expire (they rotate every
// ~30-90 days when the user updates their avatar).
import { writeFile, mkdir, stat } from "fs/promises";
import path from "path";

const AVATAR_DIR = path.join(process.cwd(), "public", "uploads", "line-avatars");
const PUBLIC_PREFIX = "/uploads/line-avatars";

async function ensureDir() {
  try {
    await stat(AVATAR_DIR);
  } catch {
    await mkdir(AVATAR_DIR, { recursive: true });
  }
}

/**
 * Download a LINE profile URL and save it to disk. Returns the public path
 * (e.g. "/uploads/line-avatars/Uxxxxxx.jpg") on success, or null on failure
 * (404 from LINE, network error, etc.). Callers should fall back to whatever
 * picture_url the DB already has when this returns null.
 */
export async function cacheLineAvatar(lineUserId: string, pictureUrl: string): Promise<string | null> {
  if (!lineUserId || !pictureUrl) return null;
  try {
    const res = await fetch(pictureUrl, {
      // LINE CDN sometimes 403s without a UA header.
      headers: { "User-Agent": "Mozilla/5.0 SenaSolarApp/1.0" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "image/jpeg";
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const buf = Buffer.from(await res.arrayBuffer());
    await ensureDir();
    // Sanitise the user id for filesystem safety even though LINE ids are
    // already alnum/U-prefixed.
    const safeId = lineUserId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeId}.${ext}`;
    await writeFile(path.join(AVATAR_DIR, filename), buf);
    return `${PUBLIC_PREFIX}/${filename}`;
  } catch (err) {
    console.warn(`cacheLineAvatar(${lineUserId}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
