// The type comes from the bytes, never from the file name or the browser's type (T-03-30).
export function sniffImage(b: Uint8Array): { ext: "jpg" | "png" | "webp"; contentType: string } | null {
  const at = (sig: number[], from = 0) => sig.every((x, i) => b[from + i] === x);
  if (at([0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: "image/jpeg" };
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: "image/png" };
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return { ext: "webp", contentType: "image/webp" };
  return null;
}

