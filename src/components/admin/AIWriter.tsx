"use client";

import { useId, useRef, useState, useTransition } from "react";
import { SparkleIcon } from "@/components/stock/icons";
import { press } from "@/components/ui";
import { writeAction } from "@/lib/ai/actions";
import { ADJUSTS, adjustsFor, type Adjust, type Task, type WriteRequest } from "@/lib/ai/tasks";
import type { PostFormat } from "@/lib/admin/networks";
import { adminButtonQuiet, adminInput, rowButton } from "./kit";
import { BUSY } from "./ActButton";
// A box being written into by AI: dimmed with the busy pulse, and the new text fades in as it lifts.
export const WRITING = "transition-opacity duration-200 aria-busy:opacity-60 motion-safe:aria-busy:animate-pulse";

// The changes to a draft: small neutral chips, a quieter group than Write with AI, 44px on a phone and 36px from 640px.
const chip = `inline-flex min-h-11 items-center rounded-full bg-hairline px-3.5 text-meta font-medium text-text transition-colors hover:bg-accent-soft hover:text-accent-text disabled:opacity-50 pointer-fine:min-h-9 ${press}`;
// The AI limit is our fair use, not a limit the dealer sets on Billing, so the message says where to ask.
const SAID = { limit: "The monthly AI limit is reached. Your text is unchanged. Ask us in Help to raise it.", failed: "Couldn't write that, try again. Your text is unchanged." };
const BRIEF_SAID = { limit: "The monthly AI limit is reached. Ask us in Help to raise it.", failed: "Couldn't write that, try again." };

// "Write with AI" for any text box (#179): a first draft from the record's facts, then buttons that rewrite it, Undo for one step back, and a
// label so AI text is never taken for the dealer's own. The box stays the host's own and stays editable. `request` is read when a button is
// pressed (the car form's boxes may have changed). `onBusy`: a write started (true) or ended (false), so the box can hold still while it is written.
export function AIWriter({ task, request, text, onText, onBusy, format }: { task: Task; request: () => WriteRequest | null; text: string; onText: (text: string) => void; onBusy?: (busy: boolean) => void; format?: PostFormat }) {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState("");
  const [written, setWritten] = useState(false); // for a screen reader: the draft arrived
  const [ai, setAi] = useState<string | null>(null); // the last text AI wrote
  const [back, setBack] = useState<{ text: string; ai: string | null } | null>(null);

  const run = (adjust?: Adjust) => {
    const req = request();
    if (!req) return setSaid("Fill in the car's details first.");
    setSaid("");
    setWritten(false);
    onBusy?.(true);
    start(async () => {
      try {
        const r = await writeAction(req, adjust, text);
        if (!r.ok) return setSaid(SAID[r.reason]);
        setBack({ text, ai });
        setAi(r.text);
        onText(r.text);
        setWritten(true);
      } catch {
        setSaid(SAID.failed);
      } finally {
        onBusy?.(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Its own look among the secondary buttons: the sparkle in a filled dot says this one writes for you. */}
        <button type="button" onClick={() => run()} disabled={pending} aria-busy={pending || undefined} className={`${adminButtonQuiet} pl-2.5 ${BUSY}`}>
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
            <SparkleIcon className="shrink-0 size-4" />
          </span>
          {pending ? "Writing" : ai === null ? "Write with AI" : "Write again"}
        </button>
        {ai !== null && text.trim() !== "" && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-info-soft px-2.5 text-meta font-medium text-info">
            <SparkleIcon className="shrink-0 size-3.5" />
            {text === ai ? "AI draft" : "AI draft, edited"}
          </span>
        )}
        {back && !pending && (
          <button type="button" onClick={() => { onText(back.text); setAi(back.ai); setBack(null); }} className={rowButton}>
            Undo
          </button>
        )}
      </div>
      {ai !== null && (
        // Tied to the box by an indigo rule, under a label, so the changes read as one group that belongs to the draft.
        <div role="group" aria-label="Change the draft" className="flex flex-col gap-2 border-l-2 border-accent pl-3">
          <span aria-hidden="true" className="text-meta text-text-2">Change it</span>
          <div className="flex flex-wrap gap-2">
            {adjustsFor(task, format).map((a) => (
              <button key={a} type="button" disabled={pending} onClick={() => run(a)} className={chip}>
                {ADJUSTS[a]}
              </button>
            ))}
          </div>
        </div>
      )}
      <p aria-live="polite" className="-mt-3 text-meta text-text-2 [&:not(:empty)]:mt-0">{said}</p>
      {/* Apart from the line above, so the announcement never moves the layout. */}
      <p aria-live="polite" className="sr-only">{written ? "Draft written." : ""}</p>
    </div>
  );
}

// A text box with the writer under it, for the places that have no state of their own (a form that posts the box by `name`). `request` is
// the ask, or (from a client component only) a function that gets the box, so the car form can read its sibling fields. `copy` adds a Copy button (a string names it), for a draft that is sent from somewhere else.
// `folded`: only Write with AI until it is pressed, then the box, focused (a lead's reply, so a phone is not handed a big empty box). It
// opens on the press, not on success, so a failed write or the AI limit still leaves a box to type in.
export function AITextarea({ id, name, label, defaultValue = "", rows = 5, maxLength, task, request, copy = false, folded = false }: { id?: string; name?: string; label: string; defaultValue?: string; rows?: number; maxLength?: number; task: Task; request: WriteRequest | ((box: HTMLTextAreaElement | null) => WriteRequest | null); copy?: boolean | string; folded?: boolean }) {
  const box = useRef<HTMLTextAreaElement>(null);
  const own = useId();
  id ??= own;
  const [text, setText] = useState(defaultValue);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [open, setOpen] = useState(!folded);
  const [busy, setBusy] = useState(false); // read-only while AI writes, so nothing typed meanwhile is lost
  // A copy that fails says so: otherwise the dealer pastes whatever was copied before.
  const copyText = () => {
    const failed = () => { setCopied(false); setCopyError("Couldn't copy. Select the text and copy it."); };
    setCopyError("");
    if (!navigator.clipboard) return failed();
    navigator.clipboard.writeText(text).then(() => setCopied(true), failed);
  };
  return (
    <div className="flex flex-col gap-2">
      {open && (
        <>
          <label className="sr-only" htmlFor={id}>{label}</label>
          <textarea ref={box} id={id} name={name} rows={rows} maxLength={maxLength} autoFocus={folded} readOnly={busy} aria-busy={busy || undefined} value={text} onChange={(e) => { setText(e.target.value); setCopied(false); setCopyError(""); }} className={`${adminInput} h-auto py-2 ${WRITING}`} />
        </>
      )}
      <AIWriter task={task} text={text} request={() => (typeof request === "function" ? request(box.current) : request)} onBusy={(b) => { setBusy(b); if (b) setOpen(true); }} onText={(t) => { setText(t); setCopied(false); setCopyError(""); }} />
      {copy && text.trim() && (
        <>
          <button type="button" onClick={copyText} className={`${adminButtonQuiet} self-start`}>
            {copied ? "Copied" : copy === true ? "Copy" : copy}
          </button>
          <p aria-live="polite" className="text-meta text-bad">{copyError}</p>
        </>
      )}
    </div>
  );
}

// "Prepare me" on a lead (#34): a short brief to read before calling them back, from the lead, their visit and the stock. The same button as
// Write with AI, then the brief under an AI tag. Nothing to edit or send, so no box, no changes and no Undo; Prepare again writes it afresh.
export function AIBrief({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const [said, setSaid] = useState("");
  const [brief, setBrief] = useState("");
  const run = () => {
    setSaid("");
    start(async () => {
      try {
        const r = await writeAction({ task: "leadBrief", leadId });
        if (!r.ok) return setSaid(BRIEF_SAID[r.reason]);
        setBrief(r.text);
      } catch {
        setSaid(BRIEF_SAID.failed);
      }
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={run} disabled={pending} aria-busy={pending || undefined} className={`${adminButtonQuiet} pl-2.5 ${BUSY}`}>
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-accent text-on-accent">
            <SparkleIcon className="shrink-0 size-4" />
          </span>
          {pending ? "Writing" : brief ? "Prepare again" : "Prepare me"}
        </button>
        {brief && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-info-soft px-2.5 text-meta font-medium text-info">
            <SparkleIcon className="shrink-0 size-3.5" />
            AI brief
          </span>
        )}
      </div>
      {/* A line a paragraph, so the parts (what they want, the cars, the opening line) read apart on a phone. */}
      {brief && (
        <div aria-label="Brief" role="group" aria-busy={pending || undefined} className={`flex max-w-measure flex-col gap-2 rounded-control bg-row-alt px-4 py-3 text-body ${WRITING}`}>
          {brief.split("\n").filter((l) => l.trim()).map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
      <p aria-live="polite" className="-mt-3 text-meta text-text-2 [&:not(:empty)]:mt-0">{said}</p>
    </div>
  );
}
