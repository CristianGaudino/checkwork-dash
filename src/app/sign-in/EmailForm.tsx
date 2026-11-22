"use client";

import { useActionState, useEffect, useRef } from "react";
import { adminButton, adminInput } from "@/components/admin/kit";
import { requestCode } from "./actions";
import { SITE_KEY, useTurnstile } from "./useTurnstile";

export function EmailForm({ next }: { next: string }) {
  const [state, run, pending] = useActionState(requestCode, undefined);
  const slot = useRef<HTMLDivElement>(null);
  const { token, failed, reset } = useTurnstile(slot);
  useEffect(() => {
    if (state) reset(); // an answer that is an error may have spent the token
  }, [state, reset]);
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-meta font-medium">
        Email
      </label>
      <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} className={`${adminInput} w-full`} />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <div ref={slot} />
      {(state?.error || failed) && (
        <p role="alert" className="text-meta text-bad">
          {state?.error ?? "We could not run the check. Reload the page and try again."}
        </p>
      )}
      <button type="submit" disabled={pending || (!!SITE_KEY && !token)} className={`${adminButton} w-full`}>
        Email me a code
      </button>
    </form>
  );
}
