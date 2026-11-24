"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Combobox } from "@/components/Combobox";
import { showToast } from "@/components/toast";
import { BUSY, errorOf, formOf } from "./ActButton";

type Act = (data: FormData) => Promise<unknown>;

// ChoiceAct's run for a control that is not one button (a drop-down, a dialog): posts `set` to the form action, refreshes the page, and says
// `done` in the toast with Undo (`back`), or the action's refusal. `ok` runs once it worked (a dialog closes), `failed` once it was refused.
export function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: Act, set: Record<string, string>, done: string, back?: Record<string, string>, then: { ok?: () => void; failed?: () => void } = {}) =>
    start(async () => {
      const error = errorOf(await action(formOf(set)));
      router.refresh();
      if (error) return (showToast(error), then.failed?.());
      then.ok?.();
      showToast(
        done,
        back &&
          (() =>
            start(async () => {
              const e = errorOf(await action(formOf(back)));
              router.refresh();
              if (e) showToast(e);
            })),
      );
    });
  return [pending, run] as const;
}

// One of a few values (a lead's stage, why it was lost, who has it) as the house drop-down, saved the moment one is picked, with Undo in
// the toast: a list to pick from on a phone, typable on a desktop (Combobox). `field` is the name the action reads; `extra` goes with it.
// `done`: the toast, or (from a server page, which cannot pass a function) the words before the label picked ("Lost: ").
export function ActSelect({ id, label, value, options: given, action, field, extra, back, done }: { id?: string; label?: string; value: string; options: readonly (readonly [string, string])[]; action: Act; field: string; extra?: Record<string, string>; back?: Record<string, string>; done: string | ((label: string, value: string) => string) }) {
  const [pending, run] = useAct();
  // A stored value no longer offered (someone since removed from the team, a reason since dropped) stays shown, never the first option.
  const options = value && !given.some(([v]) => v === value) ? [[value, value] as const, ...given] : given;
  const [chosen, setChosen] = useState(value);
  // The page's value after a refresh (or someone else's change) wins over the one picked here.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setChosen(value);
  }
  return (
    <div aria-busy={pending || undefined} className={BUSY}>
      <Combobox
        id={id}
        size="md"
        label={label}
        value={chosen}
        options={options.map(([v, l]) => ({ value: v, label: l }))}
        onChange={(v) => {
          if (v === chosen || pending) return;
          setChosen(v);
          const picked = options.find(([o]) => o === v)?.[1] ?? v;
          run(action, { ...extra, [field]: v }, typeof done === "string" ? `${done}${picked}` : done(picked, v), back, { failed: () => setChosen(value) });
        }}
      />
    </div>
  );
}
