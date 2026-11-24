"use client";

import { useKeptForm } from "@/components/admin/useKeptForm";
import { useState } from "react";
import { Select } from "@/components/Select";
import { CameraIcon } from "@/components/stock/icons";
import { Field, FormActions, adminButton, adminButtonQuiet, adminInput, choicePill } from "@/components/admin/kit";
import { sendFeedbackAction, sendHelpAction, type HelpState } from "@/app/help/actions";
import { MESSAGE_MAX, type HelpType } from "@/lib/admin/help-rules";

// The message to us. "Something isn't working" asks for the steps and takes a screenshot. The server checks all of it again.
export function HelpForm({ types, first, from }: { types: HelpType[]; first: HelpType; from: string }) {
  const [state, run, pending] = useKeptForm<HelpState>(sendHelpAction, undefined);
  const [type, setType] = useState<string>(first);
  const [shot, setShot] = useState(""); // the chosen screenshot's file name
  const errors = state?.errors ?? {};
  return (
    <form {...run} onReset={() => setShot("")} className="flex max-w-2xl flex-col gap-4" noValidate>
      <input type="hidden" name="from" value={from} />
      <Field label="What is it about?" error={errors.type}>
        <Select name="type" label="What is it about?" value={type} onChange={(v) => { if (v !== type) setShot(""); setType(v); }} options={types.map((t) => [t, t] as const)} />
      </Field>
      {type === "Something isn't working" && (
        <Field label="What were you doing, and what happened?" error={errors.steps}>
          <textarea name="steps" rows={3} maxLength={MESSAGE_MAX} className={`${adminInput} h-auto py-2`} />
        </Field>
      )}
      <Field label={type === "Something isn't working" ? "Anything else" : "Your message"} error={errors.message}>
        <textarea name="message" rows={4} maxLength={MESSAGE_MAX} className={`${adminInput} h-auto py-2`} />
      </Field>
      {type === "Something isn't working" && (
        <Field label="Screenshot (optional)" hint="Only add one if it shows no customer details" error={errors.screenshot}>
          {/* The house file button (as on Media and a car's photos), not the browser's grey one; the Field's label opens the picker. */}
          <span className="flex min-w-0 flex-wrap items-center gap-3">
            <span className={`${adminButtonQuiet} w-fit cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}>
              <CameraIcon className="size-4 shrink-0" />
              {shot ? "Choose another" : "Choose a picture"}
              <input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Screenshot" onChange={(e) => setShot(e.target.files?.[0]?.name ?? "")} className="sr-only" />
            </span>
            {shot && <span className="min-w-0 truncate text-meta text-text-2">{shot}</span>}
          </span>
        </Field>
      )}
      <FormActions>
        {state?.saved && !pending && (
          <p role="status" className="mr-auto text-meta text-ok">
            Sent. We will reply here.
          </p>
        )}
        <button type="submit" disabled={pending} className={adminButton}>
          {pending ? "Sending" : "Send"}
        </button>
      </FormActions>
    </form>
  );
}

// A small, skippable question, shown on the Help page only, and not again for a quarter once answered or skipped.
export function FeedbackForm() {
  const [score, setScore] = useState(0);
  return (
    <form action={sendFeedbackAction} className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2 text-body font-semibold">How is the dashboard working for you? 1 is poor, 5 is great.</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`${choicePill(score === n)} cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-2`}>
            <input type="radio" name="score" value={n} checked={score === n} onChange={() => setScore(n)} className="sr-only" />
            {n}
          </label>
        ))}
      </fieldset>
      <Field label="Anything to add? (optional)">
        <input name="note" maxLength={500} className={adminInput} />
      </Field>
      <FormActions>
        {/* Quiet: the message form's Send is the page's one filled button. First in the form, so Enter in the note sends rather than
            skips; drawn right-most, as the main one is. */}
        <button type="submit" disabled={!score} className={`${adminButtonQuiet} order-last`}>
          Send
        </button>
        <button type="submit" name="skip" value="1" className={adminButtonQuiet}>
          Not now
        </button>
      </FormActions>
    </form>
  );
}
