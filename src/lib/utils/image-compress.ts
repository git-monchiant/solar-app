// Browser-side JPEG compression for OCR uploads. A modern phone camera shot is
// typically 3-5 MB; that bloats the upload + the Gemini request body and is the
// dominant cost in our scan latency. Resizing to ≤ MAX_DIMENSION and re-encoding
// at JPEG_QUALITY drops the payload to ~150-300 KB without hurting OCR
// accuracy on Thai text.
//
// Why not server-side? The upload itself is the slow leg on cellular networks,
// so compressing before send wins both the upload AND the Gemini step.
// 2000px keeps Thai ID-card serial font legible (1600 starts to fuzz out the
// thin strokes); 0.85 quality preserves edge sharpness around small text.
// Tested: 4MB phone shot → ~400-600KB after compression, still OCR-clean.
const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.85;

export async function compressImageForOCR(file: File): Promise<File> {
  // Bail for non-images and tiny files — re-encoding them would only hurt.
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 300 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;
    // Skip if the "compressed" version is somehow larger (small / already-tiny inputs)
    if (blob.size >= file.size) return file;
    return new File([blob], (file.name || "scan").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
