"use client";

import { useEffect, useRef, useState } from "react";
import { adminButton, adminButtonQuiet, choicePill } from "@/components/admin/kit";
import { downscale, drawEdited, frameCrop, turnedSize } from "@/components/leads/downscale";
import { uploadMediaAction } from "@/app/marketing/actions";
import type { Network, PostFormat } from "@/lib/admin/networks";

// Each network's picture shapes (width / height). A story, a reel and anything on TikTok fill the phone screen; a feed post can be tall,
// square or, on Facebook, wide. The first is the one each network shows biggest, so it is where the editor starts.
const SHAPES = { "4:5": [4 / 5, "Tall 4:5"], "1:1": [1, "Square"], "1.91:1": [1.91, "Wide"], "9:16": [9 / 16, "Full screen"] } as const;
type Shape = keyof typeof SHAPES;
export const shapesFor = (network: Network, format: PostFormat): Shape[] =>
  format === "story" || format === "reel" || network === "TikTok" ? ["9:16"] : network === "Instagram" ? ["4:5", "1:1"] : ["4:5", "1:1", "1.91:1"];

const ZOOM_MAX = 4;
const icon = "size-4 shrink-0";

// Crop and rotate one photo for a post (#114): pick the shape, drag (or use the arrow keys) to frame it, pinch or slide to zoom, turn it a
// quarter at a time. The frame is drawn with the same canvas step that makes the file (downscale), so what is seen is what goes out. The
// result is added to the media library, since a post may only use the car's photos and the library's (the server checks).
export function PhotoEditor({ src, network, format, carSlug, onDone, onCancel }: { src: string; network: Network; format: PostFormat; carSlug: string; onDone: (src: string) => void; onCancel: () => void }) {
  const shapes = shapesFor(network, format);
  const [shape, setShape] = useState<Shape>(shapes[0]);
  const [turns, setTurns] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState<[number, number]>([0.5, 0.5]);
  const [photo, setPhoto] = useState<{ blob: Blob; bmp: ImageBitmap } | null>(null);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    let live = true;
    let bmp: ImageBitmap | undefined;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(async (blob) => {
        bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
        if (live) setPhoto({ blob, bmp });
        else bmp.close();
      })
      .catch(() => live && setSaid("This photo could not be opened. Try another."));
    return () => {
      live = false;
      bmp?.close();
    };
  }, [src]);

  const aspect = SHAPES[shape][0];
  const size = photo ? turnedSize(photo.bmp.width, photo.bmp.height, turns) : { width: 1, height: 1 };
  const frame = frameCrop(size.width, size.height, aspect, zoom, centre[0], centre[1]);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !photo) return;
    const box = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(box.width * dpr);
    c.height = Math.round(box.height * dpr);
    drawEdited(ctx, photo.bmp, c.width, c.height, { turns, crop: frame.crop });
  });

  // Moves the frame by a distance on screen (CSS pixels), or by fractions of the frame from the keyboard.
  const move = (dx: number, dy: number, of = canvas.current?.clientWidth ?? 1) => {
    const r = frameCrop(size.width, size.height, aspect, zoom, centre[0] - (dx / of) * frame.crop.width, centre[1] - (dy / of) * frame.crop.width * (size.width / size.height));
    setCentre([r.cx, r.cy]);
  };
  const zoomTo = (z: number) => setZoom(Math.min(ZOOM_MAX, Math.max(1, z)));
  const reset = () => {
    setZoom(1);
    setCentre([0.5, 0.5]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointers.current;
    const last = p.get(e.pointerId);
    if (!last) return;
    const now = { x: e.clientX, y: e.clientY };
    if (p.size === 1) move(now.x - last.x, now.y - last.y);
    else if (p.size === 2) {
      // Two fingers: the zoom follows how far apart they are.
      const other = [...p.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      if (before > 0) zoomTo((zoom * Math.hypot(now.x - other.x, now.y - other.y)) / before);
    }
    p.set(e.pointerId, now);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.2 : 0.05;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => move(-step, 0, 1),
      ArrowRight: () => move(step, 0, 1),
      ArrowUp: () => move(0, -step, 1),
      ArrowDown: () => move(0, step, 1),
      "+": () => zoomTo(zoom * 1.1),
      "=": () => zoomTo(zoom * 1.1),
      "-": () => zoomTo(zoom / 1.1),
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    keys[e.key]();
  };

  const use = async () => {
    if (!photo) return;
    setBusy(true);
    setSaid("Saving the photo");
    try {
      const jpeg = await downscale(photo.blob, 1600, 0.82, { turns, crop: frame.crop });
      const f = new FormData();
      f.set("name", `${src.split("/").pop()?.replace(/\.\w+$/, "") || "Photo"} edited.jpg`);
      if (carSlug) f.set("carSlug", carSlug);
      f.set("file", jpeg.blob);
      f.set("width", String(jpeg.width));
      f.set("height", String(jpeg.height));
      const r = await uploadMediaAction(f);
      if (!r.ok) return setSaid(r.error);
      onDone(r.item.src);
    } catch {
      setSaid("The photo could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-label="Crop and rotate" className="flex flex-col gap-3 rounded-card border border-hairline bg-row-alt p-3">
      <div className="flex flex-wrap items-center gap-2">
        {shapes.length > 1 ? (
          <div role="radiogroup" aria-label="Shape" className="flex flex-wrap gap-2">
            {shapes.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={shape === s} onClick={() => { setShape(s); reset(); }} className={choicePill(shape === s)}>
                {SHAPES[s][1]}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-meta text-text-2">{SHAPES[shape][1]}, as {network} shows it</span>
        )}
        <button type="button" onClick={() => { setTurns((t) => t + 1); reset(); }} disabled={!photo} className={`${adminButtonQuiet} ml-auto px-4 disabled:opacity-50`}>
          <RotateIcon className={icon} />
          Rotate
        </button>
      </div>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="img"
        aria-label="Photo in its frame. Drag or use the arrow keys to move it, plus and minus to zoom"
        style={{ aspectRatio: aspect, width: `min(100%, calc(55vh * ${aspect}))` }}
        className="mx-auto cursor-grab touch-none rounded-control bg-photo-bg active:cursor-grabbing"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => pointers.current.delete(e.pointerId)}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
      />
      <label className="flex items-center gap-3 text-meta font-medium">
        Zoom
        <input type="range" min={1} max={ZOOM_MAX} step={0.01} value={zoom} disabled={!photo} onChange={(e) => zoomTo(Number(e.target.value))} className="h-11 flex-1 accent-accent" />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p aria-live="polite" className="mr-auto text-meta text-text-2">{said || (photo ? "" : "Opening the photo")}</p>
        <button type="button" onClick={onCancel} className={adminButtonQuiet}>Cancel</button>
        <button type="button" onClick={use} disabled={!photo || busy} className={`${adminButton} disabled:opacity-50`}>Use photo</button>
      </div>
    </div>
  );
}

function RotateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export function CropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M6 2v14a2 2 0 0 0 2 2h14" />
      <path d="M18 22V8a2 2 0 0 0-2-2H2" />
    </svg>
  );
}
