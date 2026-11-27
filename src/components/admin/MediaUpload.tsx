"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMediaAction } from "@/app/marketing/actions";
import { downscale } from "@/components/leads/downscale";
import { MEDIA_ACCEPT, MEDIA_LIMITS } from "@/lib/admin/media-rules";
import type { MediaItem } from "@/lib/admin/collections";
import { press } from "@/components/ui";
import { PlusIcon } from "@/components/stock/icons";
import { Select } from "@/components/Select";
import { Field } from "./kit";
import { BUSY } from "./ActButton";
import { CropIcon, EditPhoto, type Jpeg, type Shape } from "./PhotoEditor";

// Adds photos and videos from this device to the media library (#177). A photo is shrunk here to a 1,600px JPEG (which also drops its
// location data); a video is sent as it is after its length and size are read, so a long one is refused before it travels. Each file is
// sent on its own, so a slow phone connection loses at most one. The server checks the bytes again.
const seconds = (file: File) =>
  new Promise<number>((ok, no) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); ok(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); no(new Error("unreadable")); };
    v.src = url;
  });

// `edit`: a second button picks one photo and opens the photo editor (#125) first, to turn it or cut it to a network's shape; the edited JPEG
// is what is sent. The plain button still adds files as they are.
const LIBRARY_SHAPES: Shape[] = ["photo", "1:1", "4:5", "1.91:1", "9:16", "4:3"];
const pick = `inline-flex h-11 w-fit cursor-pointer items-center justify-center gap-2 rounded-control bg-accent-soft px-5 text-meta font-semibold text-accent-text transition-colors hover:bg-accent-soft-hover has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${press}`;

export function MediaUpload({ accept = MEDIA_ACCEPT, carSlug = "", label = "Add from this device", edit = false, onAdded }: { accept?: string; carSlug?: string; label?: string; edit?: boolean; onAdded?: (item: MediaItem) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState("");
  const [editing, setEditing] = useState<File | null>(null);
  const [pending, start] = useTransition();

  const addEdited = async (jpeg: Jpeg) => {
    const f = new FormData();
    f.set("name", editing!.name);
    if (carSlug) f.set("carSlug", carSlug);
    f.set("file", jpeg.blob);
    f.set("width", String(jpeg.width));
    f.set("height", String(jpeg.height));
    const r = await uploadMediaAction(f);
    if (!r.ok) return r.error;
    onAdded?.(r.item);
    setEditing(null);
    setSaid("Added to your library");
    router.refresh();
  };

  const add = (files: File[]) =>
    start(async () => {
      let added = 0;
      // A file that fails stops the rest, but the ones already added show at once, not after a reload.
      const stop = (msg: string) => {
        if (added) router.refresh();
        setSaid(msg);
      };
      for (const file of files.slice(0, 10)) {
        setSaid(`Adding ${added + 1} of ${Math.min(files.length, 10)}`);
        try {
          const f = new FormData();
          f.set("name", file.name);
          if (carSlug) f.set("carSlug", carSlug);
          if (file.type.startsWith("video/")) {
            if (file.size > MEDIA_LIMITS.videoBytes) return stop("That video is too big. Videos can be up to 15 MB here.");
            const s = await seconds(file);
            if (!(s > 0) || s > MEDIA_LIMITS.videoSeconds) return stop(`Videos can be up to ${MEDIA_LIMITS.videoSeconds} seconds.`);
            f.set("file", file);
            f.set("seconds", String(s));
          } else {
            const jpeg = await downscale(file, 1600);
            f.set("file", jpeg.blob);
            f.set("width", String(jpeg.width));
            f.set("height", String(jpeg.height));
          }
          const r = await uploadMediaAction(f);
          if (!r.ok) return stop(r.error);
          onAdded?.(r.item);
          added++;
        } catch {
          return stop("That file could not be added. Try another.");
        }
      }
      if (input.current) input.current.value = "";
      router.refresh();
      setSaid(added === 1 ? "Added to your library" : `${added} files added to your library`);
    });

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <EditPhoto key={`${editing.name} ${editing.lastModified}`} src={editing} shapes={LIBRARY_SHAPES} saveLabel="Add photo" onSave={addEdited} onCancel={() => setEditing(null)} />
      ) : (
        <div className="flex flex-wrap gap-3">
          <label aria-busy={pending || undefined} className={`${pick} ${BUSY}`}>
            <PlusIcon className="shrink-0 size-4" />
            {label}
            <input ref={input} type="file" accept={accept} multiple disabled={pending} aria-label={label} onChange={(e) => add([...(e.target.files ?? [])])} className="sr-only" />
          </label>
          {edit && (
            <label aria-busy={pending || undefined} className={`${pick} ${BUSY}`}>
              <CropIcon className="shrink-0 size-4" />
              Crop and add a photo
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} aria-label="Crop and add a photo" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setSaid(""); setEditing(f); } }} className="sr-only" />
            </label>
          )}
        </div>
      )}
      <p aria-live="polite" className="text-meta text-text-2">{said}</p>
    </div>
  );
}

// The library page's upload: the same control, with a choice of the car the files belong to (or none).
export function LibraryUpload({ cars }: { cars: { slug: string; title: string }[] }) {
  const [slug, setSlug] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <Field label="Car, if it belongs to one" className="max-w-sm">
        <Select label="Car, if it belongs to one" value={slug} onChange={setSlug} options={[["", "No car"], ...cars.map((c) => [c.slug, c.title] as const)]} />
      </Field>
      <MediaUpload carSlug={slug} label="Add photos or videos" edit />
    </div>
  );
}
