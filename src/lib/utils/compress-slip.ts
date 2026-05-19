import imageCompression from "browser-image-compression";

// Slip uploads pass through nginx with a 1 MB body limit. Photos straight off
// a phone routinely exceed that, so compress on the client before the round
// trip. Targets:
//   • max 800 KB (well under the proxy ceiling, with headroom for form fields)
//   • max 1920 px on the longest side (more than enough to read slip text)
//   • image/jpeg output for predictable size
//
// PDFs and non-image files are passed through unchanged — the compressor only
// handles raster images.
export async function compressSlipFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  // Already small enough — skip work and avoid re-encoding loss.
  if (file.size <= 800 * 1024) return file;
  try {
    const out = await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.85,
    });
    // Library may return a Blob; wrap as File so multipart/form-data keeps a
    // filename the server can log.
    return new File([out], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (e) {
    // Surface to the caller via console; fall back to the original so the user
    // still has a chance to upload (and the server will return its own 413 if
    // it's truly too large).
    console.warn("[compress-slip] fallback to original:", e);
    return file;
  }
}
