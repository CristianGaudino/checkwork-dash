"use client";

import { useRef, useState } from "react";
import { AITextarea } from "@/components/admin/AIWriter";
import { ConfirmDialog, type Confirm } from "@/components/admin/ActButton";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { adminButton } from "@/components/admin/kit";

// The reply box under a review. A reply is public on Google, so it asks first with the text shown; an empty box with no reply to remove says so.
export function ReplyForm({ action, id, author, reply, filter }: { action: (data: FormData) => Promise<void>; id: string; author: string; reply?: string; filter: string }) {
  const [error, setError] = useState("");
  const [asking, setAsking] = useState<Confirm>();
  const form = useRef<HTMLFormElement>(null);
  const sure = useRef(false);
  const onSubmit = (ev: React.FormEvent<HTMLFormElement>) => {
    if (sure.current) return void (sure.current = false);
    const text = String(new FormData(ev.currentTarget).get("reply") ?? "").trim();
    if (text === (reply ?? "")) return; // nothing changed: the server does nothing
    ev.preventDefault();
    if (!text && !reply) return setError("Write a reply first");
    setError("");
    setAsking(
      !text
        ? { title: "Remove your reply from Google?", text: "Customers will no longer see it.", yes: "Remove reply" }
        : { title: reply ? "Update your reply on Google?" : "Post this reply on Google?", text: `Anyone can read it: "${text}"`, yes: reply ? "Update reply" : "Post reply", safe: true },
    );
  };
  return (
    <form ref={form} action={action} onSubmit={onSubmit} className="mt-2 flex max-w-measure flex-col gap-2">
      <input type="hidden" name="filter" value={filter} />
      <AITextarea id={`reply-${id}`} name="reply" label={`Reply to ${author}`} rows={3} maxLength={500} defaultValue={reply ?? ""} task="reviewReply" request={{ task: "reviewReply", reviewId: id }} />
      {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
      <SubmitButton className={`${adminButton} self-start`}>{reply ? "Update reply" : "Post reply"}</SubmitButton>
      {asking && <ConfirmDialog confirm={asking} yesClassName={asking.safe ? adminButton : undefined} onYes={() => ((sure.current = true), form.current?.requestSubmit())} onClose={() => setAsking(undefined)} />}
    </form>
  );
}
