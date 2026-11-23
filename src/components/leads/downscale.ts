// Shrinks a picked photo on the device to a JPEG with a 2,000px long edge (UI-SPEC Photos, Resizing). Drawing it to a
// canvas also drops the EXIF data, GPS and camera details included, so the original never leaves the phone (T-03-33).
// The size comes back with it, so the caller need not decode the JPEG again to learn it. `edit` turns it in quarter turns
// clockwise and then cuts it to `crop` (fractions of the turned photo), for the post composer's photo editor (#114).
export type Crop = { x: number; y: number; width: number; height: number };
export type Edit = { turns: number; crop: Crop };

export async function downscale(file: Blob, longEdge = 2000, quality = 0.82, edit?: Edit): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const { width: w, height: h } = cropSize(bmp.width, bmp.height, edit);
  const k = Math.min(1, longEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.fillStyle = "#fff"; // a transparent PNG gets a white background, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawEdited(ctx, bmp, canvas.width, canvas.height, edit);
  bmp.close();
  const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("Encode failed"))), "image/jpeg", quality));
  return { blob, width: canvas.width, height: canvas.height };
}

const quarter = (turns: number) => ((turns % 4) + 4) % 4;
// The photo's size once turned.
export const turnedSize = (width: number, height: number, turns = 0) => (quarter(turns) % 2 ? { width: height, height: width } : { width, height });
// The size in pixels of the part of the photo that is kept.
export function cropSize(width: number, height: number, edit?: Edit) {
  const t = turnedSize(width, height, edit?.turns);
  return edit ? { width: edit.crop.width * t.width, height: edit.crop.height * t.height } : t;
}

// Draws the photo, turned and cut, to fill an outW by outH area at the origin. The editor draws its frame with it too, so what is seen is
// what is sent.
export function drawEdited(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, outW: number, outH: number, edit?: Edit) {
  const turns = quarter(edit?.turns ?? 0);
  const t = turnedSize(img.width, img.height, turns);
  const c = edit?.crop ?? { x: 0, y: 0, width: 1, height: 1 };
  ctx.save();
  ctx.scale(outW / (c.width * t.width), outH / (c.height * t.height));
  ctx.translate(-c.x * t.width + t.width / 2, -c.y * t.height + t.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// The frame over a turned photo (width by height): the biggest `aspect` (width / height) that fits, made `zoom` times smaller, centred on
// (cx, cy) as fractions of the photo and kept inside it. Returns the crop and the centre it ended on, so a drag past the edge stops there.
export function frameCrop(width: number, height: number, aspect: number, zoom: number, cx: number, cy: number): { crop: Crop; cx: number; cy: number } {
  const z = Math.max(1, zoom);
  const fw = Math.min(width, height * aspect) / z;
  const fh = fw / aspect;
  const w = fw / width;
  const h = fh / height;
  const x = Math.min(Math.max(cx, w / 2), 1 - w / 2);
  const y = Math.min(Math.max(cy, h / 2), 1 - h / 2);
  return { crop: { x: x - w / 2, y: y - h / 2, width: w, height: h }, cx: x, cy: y };
}
