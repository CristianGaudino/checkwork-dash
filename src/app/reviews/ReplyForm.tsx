"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AITextarea } from "@/components/admin/AIWriter";
import { ConfirmDialog, type Confirm } from "@/components/admin/ActButton";
import { Dialog, DialogCancel } from "@/components/admin/Dialog";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { FormActions, adminButton, rowButton, rowButtonStrong } from "@/components/admin/kit";

// Reply (or Edit reply) under a review opens the reply in the house dialog (#141), with the review above the box to answer it. A reply is
// public on Google, so it asks first with the text shown; an empty box with no reply to remove says so. Once Google has it, the dialog closes
// and the page says so.
export function ReplyForm({ action, id, author, review, reply, filter }: { action: (data: FormData) => Promise<void>; id: string; author: string; review: string; reply?: string; filter: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState<Confirm>();
  const form = useRef<HTMLFormElement>(null);
  const sure = useRef(false);
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    if (sure.current) return void (sure.current = false);
    const text = String(new FormData(ev.currentTarget).get("reply") ?? "").trim();
    if (!text && !reply) return void (ev.preventDefault(), setError("Write a reply first"));
    if (text === (reply ?? "")) return void (ev.preventDefault(), setOpen(false)); // nothing changed: nothing to send
    ev.preventDefault();
    setError("");
    setAsking(
      !text
        ? { title: "Remove your reply from Google?", text: "Customers will no longer see it.", yes: "Remove reply" }
        : { title: reply ? "Update your reply on Google?" : "Post this reply on Google?", text: `Anyone can read it: "${text}"`, yes: reply ? "Update reply" : "Post reply", safe: true },
    );
  };
  return (
    <>
      <div className="flex justify-end">
        <button type="button" onClick={() => (setError(""), setOpen(true))} aria-label={`${reply ? "Edit reply" : "Reply"} to ${author}`} className={reply ? rowButton : rowButtonStrong}>
          {reply ? "Edit reply" : "Reply"}
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={reply ? "Edit your reply" : `Reply to ${author}`}>
        <form ref={form} action={action} onSubmit={onSubmit} className="flex flex-col gap-4">
          <blockquote className="max-h-40 overflow-y-auto whitespace-pre-line rounded-control border-l-4 border-hairline bg-row-alt px-4 py-3 text-body">{review}</blockquote>
          <input type="hidden" name="filter" value={filter} />
          <AITextarea id={`reply-${id}`} name="reply" label={`Reply to ${author}`} rows={4} maxLength={500} defaultValue={reply ?? ""} task="reviewReply" request={{ task: "reviewReply", reviewId: id }} />
          {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
          <FormActions>
            <DialogCancel />
            <SubmitButton className={adminButton}>{reply ? "Update reply" : "Post reply"}</SubmitButton>
          </FormActions>
          <WhenSent onSent={() => setOpen(false)} />
          {asking && <ConfirmDialog confirm={asking} yesClassName={asking.safe ? adminButton : undefined} onYes={() => ((sure.current = true), form.current?.requestSubmit())} onClose={() => setAsking(undefined)} />}
        </form>
      </Dialog>
    </>
  );
}

// Calls `onSent` once the form's send (and the page it comes back to) is done.
function WhenSent({ onSent }: { onSent: () => void }) {
  const { pending } = useFormStatus();
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !pending) onSent();
    was.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per send; onSent is a new function each render
  }, [pending]);
  return null;
}
