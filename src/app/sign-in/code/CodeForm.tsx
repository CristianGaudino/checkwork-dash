"use client";

import { useActionState } from "react";
import { adminButton, adminInput } from "@/components/admin/kit";
import { BUSY } from "@/components/admin/ActButton";
import { submitCode } from "../actions";

export function CodeForm({ next }: { next: string }) {
  const [state, run, pending] = useActionState(submitCode, undefined);
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="code" className="text-meta font-medium">
        Code
      </label>
      <input id="code" name="code" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9 ]*" maxLength={10} className={`${adminInput} w-full text-center text-heading tracking-widest tabular-nums`} />
      {state?.error && (
        <p role="alert" className="text-meta text-bad">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={`${adminButton} w-full ${BUSY}`}>
        Sign in
      </button>
    </form>
  );
}
