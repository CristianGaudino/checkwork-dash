"use client";

import { useState } from "react";
import { Field, adminInput } from "@/components/admin/kit";
import { AITextarea } from "@/components/admin/AIWriter";

// A newsletter's subject and text, with the AI writer under the text. It fills the subject only while that is empty. `subject` and `body`
// start it filled in: a draft being edited, or one written from the newest cars for the dealer to check.
export function NewsletterFields({ subject: initialSubject = "", body = "" }: { subject?: string; body?: string }) {
  const [subject, setSubject] = useState(initialSubject);
  return (
    <>
      <Field label="Subject"><input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={adminInput} maxLength={120} /></Field>
      <div className="flex flex-col gap-1">
        <span className="text-meta font-semibold">Text</span>
        <AITextarea name="body" label="Text" task="newsletter" rows={body ? 12 : 6} maxLength={4000} defaultValue={body} request={() => ({ task: "newsletter" })} onSubject={(s) => setSubject((cur) => cur || s)} />
      </div>
    </>
  );
}
