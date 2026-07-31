import imageCompression from "browser-image-compression";

/**
 * Client-side image compression for documentation photos (survey / install /
 * warranty / quote / grid-tie).
 * - Resizes to fit within maxWidth × maxHeight (preserves aspect ratio)
 * - Re-encodes as JPEG at the given quality
 * - Non-images (PDF etc), SVG and GIF are returned unchanged
 *
 * Target: HD-quality photos for documentation purposes.
 * Do NOT use for payment slips or documents that need OCR/AI processing.
 *
 * WHY THIS DELEGATES INSTEAD OF DRIVING CANVAS DIRECTLY
 * -----------------------------------------------------
 * This used to be a hand-rolled FileReader → <img> → drawImage → toBlob
 * pipeline, and it silently produced SOLID BLACK JPEGs for high-resolution
 * phone photos. Browsers cap the pixel area they will rasterise into a canvas
 * (~16.7 MP on iOS Safari); past that limit drawImage paints nothing while
 * onload still fires. The canvas stays transparent and toBlob("image/jpeg")
 * encodes transparent as black — so the upload "succeeded" with a black frame,
 * and because the black JPEG is tiny the `blob.size >= file.size` guard never
 * caught it. A 20:9 phone shot at 9248×4160 (38 MP) hits this every time:
 * lead 832 produced five survey uploads, all byte-identical 5,078-byte black
 * JPEGs, while the same photo went up fine from the Photos tab — that path was
 * already on browser-image-compression.
 *
 * browser-image-compression scales down in steps and carries the Safari
 * canvas-limit workaround, so both paths now share one proven implementation.
 * Keep it that way — do not reintroduce a bare drawImage here.
 */
export async function compressImage(
  file: File,
  opts: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.85 } = opts;

  if (!file.type.startsWith("image/")) return file;
  // Keep SVG / GIF as-is (canvas may not render reliably)
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const out = await imageCompression(file, {
      // The library takes a single longest-side bound; every caller passes a
      // square box, so the larger of the two is the faithful translation.
      maxWidthOrHeight: Math.max(maxWidth, maxHeight),
      initialQuality: quality,
      fileType: "image/jpeg",
      useWebWorker: true,
      // Generous ceiling — quality is driven by initialQuality above. This is
      // only here so a pathological input can't produce a huge upload.
      maxSizeMB: 2,
    });
    // If compression made it larger (rare), keep the original
    if (out.size >= file.size) return file;

    const name = file.name.replace(/\.(png|webp|jpeg|jpg|heic|heif)$/i, "") + ".jpg";
    return new File([out], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch (e) {
    // Callers already `.catch(() => file)`, but returning the original here too
    // means a compression failure costs quality, never the photo itself.
    console.warn("[compressImage] fallback to original:", e);
    return file;
  }
}
