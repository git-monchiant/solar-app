// Fetches LINE profile pictures so we can store the bytes in line_users
// directly (picture_blob + picture_mime). Storing in the DB means avatars sync
// alongside the row — previous on-disk design left UAT/dev with broken images
// after a DB-only sync, since public/uploads/line-avatars/ is .gitignored.
export interface LineAvatarFetch {
  buf: Buffer;
  mime: string;
}

/**
 * Download a LINE profile picture from its CDN URL. Returns the raw bytes +
 * mime, or null on failure (404, network error, non-image response). Callers
 * should leave the existing blob untouched when this returns null — LINE's CDN
 * sometimes 403s transiently.
 */
export async function fetchLineAvatar(pictureUrl: string): Promise<LineAvatarFetch | null> {
  if (!pictureUrl) return null;
  try {
    const res = await fetch(pictureUrl, {
      // LINE CDN sometimes 403s without a UA header.
      headers: { "User-Agent": "Mozilla/5.0 SenaSolarApp/1.0" },
    });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, mime };
  } catch (err) {
    console.warn("fetchLineAvatar failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
