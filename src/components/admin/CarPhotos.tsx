"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCarPhotoAction, carPhotoAction, replaceCarPhotoAction } from "@/app/stock/actions";
import { downscale } from "@/components/leads/downscale";
import { PHOTO_TYPES } from "@/lib/leads/constants";
import type { Photo } from "@/lib/stock/types";
import { ActButton } from "./ActButton";
import { EditPhoto, type Jpeg } from "./PhotoEditor";
import { CarThumb } from "./CarThumb";
import { Panel, adminButtonQuiet, rowButton, rowDanger } from "./kit";
import { RowMenu } from "./RowMenu";
import { CameraIcon } from "@/components/stock/icons";

// The photos with their buttons, the first marked as the main one. The same for a saved car and one being added. On a phone each photo is
// a row, small photo then its buttons (two half-width tiles are too narrow); tiles from 640px. Make main shows; Edit and Remove are under
// the photo's menu, so a tile's buttons stay on one line. Edit opens the photo editor (#125) in the grid's place, framed 4:3 as the
// website shows a car, and the edited copy takes the photo's place.
const EDIT_NOTE = "4:3, as the website shows it";
function PhotoGrid({ srcs, makeMain, remove, onEdit }: { srcs: string[]; makeMain: (src: string, i: number) => React.ReactNode; remove: (src: string, i: number) => React.ReactNode; onEdit: (i: number) => void }) {
  return (
    <>
      <p className="text-meta text-text-2">The first photo is the one on the car&apos;s card and at the top of its page.</p>
      {srcs.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {srcs.map((src, i) => (
            <li key={src} className="flex flex-wrap items-center gap-3 sm:flex-col sm:flex-nowrap sm:items-stretch sm:gap-2">
              <div className="aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-control bg-photo-bg sm:w-auto">
                <CarThumb src={src} />
              </div>
              <div className="flex grow items-center justify-between gap-2">
                {i === 0 ? <span className="inline-flex h-11 items-center px-3 text-meta font-medium text-text-2">Main photo</span> : makeMain(src, i)}
                <RowMenu label={`More for photo ${i + 1}`}>
                  <button type="button" onClick={() => onEdit(i)} aria-label={`Crop and rotate photo ${i + 1}`} className={rowButton}>
                    Edit
                  </button>
                  {remove(src, i)}
                </RowMenu>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// A car's photos (#21): add several at once, choose the main one, remove one. Each photo is shrunk on the device to a 1,600px JPEG (which
// also drops its location data) and sent on its own, so a slow connection loses at most one. Our version only: DoneDeal has the photos.
// The same types as the trade-in form: with HEIC left out, an iPhone hands over a JPEG itself.
export function CarPhotos({ carId, photos, max }: { carId: string; photos: Photo[]; max: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const replace = async (jpeg: Jpeg) => {
    const f = new FormData();
    f.set("photo", jpeg.blob);
    f.set("width", String(jpeg.width));
    f.set("height", String(jpeg.height));
    const r = await replaceCarPhotoAction(carId, editing!, f);
    if (r.error) return r.error;
    setEditing(null);
    setSaid("Photo saved");
    router.refresh();
  };

  const add = (files: File[]) =>
    start(async () => {
      const room = max - photos.length;
      let added = 0;
      let failed = false;
      for (const file of files.slice(0, room)) {
        setSaid(`Adding photo ${added + 1} of ${Math.min(files.length, room)}`);
        try {
          const jpeg = await downscale(file, 1600);
          const f = new FormData();
          f.set("photo", jpeg.blob);
          f.set("width", String(jpeg.width));
          f.set("height", String(jpeg.height));
          const r = await addCarPhotoAction(carId, f);
          if (r.error) {
            setSaid(r.error);
            failed = true;
            break;
          }
          added++;
        } catch {
          setSaid("That photo could not be added. Try another.");
          failed = true;
          break;
        }
      }
      if (input.current) input.current.value = "";
      router.refresh();
      if (failed) return;
      if (added === files.length) setSaid(added === 1 ? "Photo added" : `${added} photos added`);
      else if (files.length > room) setSaid(`Added ${added}. A car can have ${max} photos.`);
    });

  return (
    <div id="photos" className="scroll-mt-24">
    <Panel title="Photos">
      {editing ? (
        <EditPhoto key={editing} src={editing} shapes={["4:3"]} note={EDIT_NOTE} saveLabel="Save photo" onSave={replace} onCancel={() => setEditing(null)} />
      ) : (
      <PhotoGrid srcs={photos.map((p) => p.src)} onEdit={(i) => setEditing(photos[i].src)} makeMain={(src, i) => (
        <ActButton act={carPhotoAction.bind(null, carId, src, "first")} label={`Make photo ${i + 1} the main photo`} className={rowButton}>
          Make main
        </ActButton>
      )} remove={(src, i) => (
        <ActButton act={carPhotoAction.bind(null, carId, src, "remove")} confirm={{ title: "Remove this photo?", text: "It comes off the website at once.", yes: "Remove" }} label={`Remove photo ${i + 1}`} className={rowDanger}>
          Remove
        </ActButton>
      )} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${adminButtonQuiet} cursor-pointer ${pending || photos.length >= max ? "pointer-events-none opacity-60" : ""}`}>
          <CameraIcon className="shrink-0 size-4" />
          {pending ? "Adding photos" : "Add photos"}
          <input ref={input} type="file" accept={PHOTO_TYPES.join(",")} multiple disabled={pending || photos.length >= max} onChange={(e) => add([...(e.target.files ?? [])])} className="sr-only" />
        </label>
        <span aria-live="polite" className="text-meta text-text-2">
          {said || `${photos.length} of ${max}`}
        </span>
      </div>
    </Panel>
    </div>
  );
}

// Photos for a car being added (CarForm): shrunk here the same way, held in the page, and sent with the form when it is saved, so the car
// goes on the website with them. Saved first, the car has none of its own yet to add them to one by one.
export type PickedPhoto = { blob: Blob; width: number; height: number; url: string };
const SEND_MAX_BYTES = 15 * 1024 * 1024; // under the server actions' 18 MB body limit (next.config.ts), with room for the form

export function NewCarPhotos({ photos, onChange, max, error }: { photos: PickedPhoto[]; onChange: (photos: PickedPhoto[]) => void; max: number; error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState("");
  const [pending, start] = useTransition();

  const add = (files: File[]) =>
    start(async () => {
      setSaid("");
      const next = [...photos];
      let bytes = next.reduce((n, p) => n + p.blob.size, 0);
      for (const file of files) {
        if (next.length >= max) {
          setSaid(`A car can have ${max} photos.`);
          break;
        }
        try {
          const jpeg = await downscale(file, 1600);
          if (bytes + jpeg.blob.size > SEND_MAX_BYTES) {
            setSaid("That is all that can go with the form. Add the rest once the car is saved.");
            break;
          }
          bytes += jpeg.blob.size;
          next.push({ ...jpeg, url: URL.createObjectURL(jpeg.blob) });
        } catch {
          setSaid("That photo could not be added. Try another.");
          break;
        }
      }
      if (input.current) input.current.value = "";
      onChange(next);
    });
  const remove = (i: number) => {
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.filter((_, j) => j !== i));
  };
  const first = (i: number) => onChange([photos[i], ...photos.filter((_, j) => j !== i)]);
  const [editing, setEditing] = useState<number | null>(null);
  const replace = async (jpeg: Jpeg) => {
    const i = editing!;
    if (photos.reduce((n, p, j) => n + (j === i ? jpeg.blob.size : p.blob.size), 0) > SEND_MAX_BYTES) return "That is more than can go with the form. Remove a photo first.";
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.map((p, j) => (j === i ? { ...jpeg, url: URL.createObjectURL(jpeg.blob) } : p)));
    setEditing(null);
  };

  return (
    <Panel>
      {editing !== null && photos[editing] ? (
        <EditPhoto key={photos[editing].url} src={photos[editing].blob} shapes={["4:3"]} note={EDIT_NOTE} saveLabel="Save photo" onSave={replace} onCancel={() => setEditing(null)} />
      ) : (
      <PhotoGrid srcs={photos.map((p) => p.url)} onEdit={setEditing} makeMain={(_, i) => (
        <button type="button" onClick={() => first(i)} aria-label={`Make photo ${i + 1} the main photo`} className={rowButton}>
          Make main
        </button>
      )} remove={(_, i) => (
        <button type="button" onClick={() => remove(i)} aria-label={`Remove photo ${i + 1}`} className={rowDanger}>
          Remove
        </button>
      )} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${adminButtonQuiet} cursor-pointer ${pending || photos.length >= max ? "pointer-events-none opacity-60" : ""}`}>
          <CameraIcon className="shrink-0 size-4" />
          {pending ? "Adding photos" : "Add photos"}
          <input ref={input} type="file" accept={PHOTO_TYPES.join(",")} multiple disabled={pending || photos.length >= max} onChange={(e) => add([...(e.target.files ?? [])])} className="sr-only" />
        </label>
        <span aria-live="polite" className="text-meta text-text-2">
          {said || `${photos.length} of ${max}`}
        </span>
      </div>
      {error && <p className="text-meta text-destructive">{error}</p>}
    </Panel>
  );
}
