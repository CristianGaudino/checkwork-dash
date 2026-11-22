"use client";

import { useActionState } from "react";
import { adminButton, adminInput } from "@/components/admin/kit";
import { requestCode } from "./actions";

export function EmailForm({ next }: { next: string }) {
  const [state, run, pending] = useActionState(requestCode, undefined);
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-meta font-medium">
        Email
      </label>
      <input id="email" name="email" type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} className={`${adminInput} w-full`} />
      {state?.error && (
        <p role="alert" className="text-meta text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${adminButton} w-full`}>
        Email me a code
      </button>
    </form>
  );
}
