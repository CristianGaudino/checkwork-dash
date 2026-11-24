"use client";

import { useRef, useState } from "react";
import { AITextarea } from "@/components/admin/AIWriter";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { FormActions, Panel, adminButton, rowButton } from "@/components/admin/kit";
import { useLeaveGuard } from "@/components/admin/useLeaveGuard";
import { InfoIcon, PencilIcon } from "@/components/stock/icons";
import type { WriteRequest } from "@/lib/ai/tasks";

// A synced car's description (#138): read first, as set text that scrolls when long, and changed in the house dialog, where Write with AI
// has the room it needs. The listing site owns the text (the site shows the feed's), so Done keeps the new text on this page only, until it
// is pasted into the ad: the notice says so and copies it. Nothing is stored, so leaving the page asks first.
export function SyncedDescription({ description, request, site }: { description: string; request: WriteRequest; site: string }) {
  const [text, setText] = useState(description);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const changed = text !== description;
  // The house leave guard, fed by a hidden form: empty when the page opens, the new text once Done changes it, empty again once that text
  // is copied (it is on its way to the listing site, so leaving loses nothing). A new edit after the copy asks again.
  const keep = useRef<HTMLFormElement>(null);
  useLeaveGuard(keep);
  return (
    <Panel
      title="Description"
      action={
        <button type="button" onClick={() => setOpen(true)} className={rowButton}>
          <PencilIcon aria-hidden="true" className="size-4 shrink-0" />
          Edit<span className="sr-only"> description</span>
        </button>
      }
    >
      <form ref={keep} hidden>
        <input type="hidden" name="text" value={changed && copied !== text ? text : ""} readOnly />
      </form>
      {/* No gap here: the live region stays on the page empty (a screen reader reads a region that fills, not one added already full). */}
      <div className="flex flex-col">
        <div role="status">
          {changed && (
            <div className="mb-4 flex flex-col gap-3 rounded-control bg-info-soft px-4 py-3 text-body text-info sm:flex-row sm:items-center">
              <p className="flex flex-1 gap-2">
                <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                Not on {site} yet, so your website still shows the old text. Paste it into the ad; the website follows within 15 minutes.
              </p>
              <CopyButton text={text} label={`Copy for ${site}`} copied={copied} setCopied={setCopied} />
            </div>
          )}
        </div>
        {text.trim() ? (
          // Its own scroll box when long, so the page around it stays short; focusable so a keyboard can scroll it.
          <div role="region" aria-label="Description text" tabIndex={0} className="max-h-80 max-w-measure overflow-y-auto overscroll-contain whitespace-pre-line rounded-control text-body outline-offset-2">
            {text}
          </div>
        ) : (
          <p className="text-body text-text-2">No description on {site} yet.</p>
        )}
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Description" text={`Write a better one, then copy it into ${site}.`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setText(String(new FormData(e.currentTarget).get("description") ?? ""));
            setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <AITextarea name="description" label="Description" task="carDescription" defaultValue={text} rows={10} request={request} />
          <FormActions>
            <DialogCancel />
            <button type="submit" className={adminButton}>
              Done
            </button>
          </FormActions>
        </form>
      </Dialog>
    </Panel>
  );
}

// Copies `text`. It says Copied until the text changes, and a copy that fails says so: otherwise the dealer pastes whatever was copied before.
function CopyButton({ text, label, copied, setCopied }: { text: string; label: string; copied: string | null; setCopied: (t: string | null) => void }) {
  const [error, setError] = useState("");
  const copy = () => {
    const failed = () => (setCopied(null), setError("Couldn't copy. Select the text and copy it."));
    setError("");
    if (!navigator.clipboard) return failed();
    navigator.clipboard.writeText(text).then(() => setCopied(text), failed);
  };
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button type="button" onClick={copy} className={adminButton}>
        {copied === text ? "Copied" : label}
      </button>
      <p aria-live="polite" className="text-meta text-bad">{error}</p>
    </div>
  );
}
