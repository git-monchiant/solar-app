/**
 * Client-side image compression using canvas.
 * - Resizes to fit within maxWidth × maxHeight (preserves aspect ratio)
 * - Re-encodes as JPEG at given quality
 * - If input is not an image (e.g. PDF), returns the original file unchanged
 *
 * Target: HD-quality photos for documentation purposes.
 * Do NOT use for payment slips or documents that need OCR/AI processing.
 */
export async function compressImage(
  file: File,
  opts: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.85 } = opts;

  if (!file.type.startsWith("image/")) return file;
  // Keep SVG / GIF / HEIC as-is (canvas may not render reliably)
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });

  let { width, height } = img;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
  if (!blob) return file;

  // If compression made it larger (rare), keep original
  if (blob.size >= file.size) return file;

  const name = file.name.replace(/\.(png|webp|jpeg|jpg|heic|heif)$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}
