import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "@/components/stock/icons";

// The heading of a stepped form takes focus when the step changes (not on the first render), so a screen reader hears where it is. For the
// dashboard's steps; the website's forms do it in useSteps, which also waits for a field being typed in.
export function useStepHeading(step: number) {
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) heading.current?.focus();
    moved.current = true;
  }, [step]);
  return heading;
}

// A step's section eases in when the step changes, but not the one first shown: on a hard load it is the server's first paint (as Fresh).
export function useStepFade(step: number) {
  const [first, setFirst] = useState<number | null>(step);
  if (first !== null && step !== first) setFirst(null);
  return first === null ? "transition-opacity duration-200 ease-out starting:opacity-0" : "";
}

// The progress of a stepped form: a row, a numbered dot per step joined by a line. The current step's heading follows (it takes focus when the
// step changes, so `headingRef` is the form's).
export function Stepper({ titles, step, headingRef }: { titles: string[]; step: number; headingRef: React.Ref<HTMLHeadingElement> }) {
  const last = titles.length - 1;
  return (
    <>
      <ol aria-label="Progress" className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {titles.map((title, i) => (
          <li key={title} aria-current={i === step ? "step" : undefined} className="flex flex-1 items-center gap-2 last:flex-none">
            <span className="flex items-center gap-3">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-meta font-semibold transition-colors duration-200 ${i < step ? "bg-accent text-on-accent" : i === step ? "bg-text text-ink" : "bg-hairline text-text-2"}`}>
                {i < step ? <CheckIcon className="size-4" /> : i + 1}
              </span>
              <span className={`hidden text-meta sm:block ${i === step ? "font-semibold" : "text-text-2"}`}>{title}</span>
            </span>
            {i < last && <span aria-hidden="true" className={`h-px flex-1 transition-colors duration-200 ${i < step ? "bg-accent" : "bg-hairline"}`} />}
          </li>
        ))}
      </ol>
      {/* From 640px the row above shows the titles, so the heading is for screen readers there (and still takes focus). */}
      <h2 ref={headingRef} tabIndex={-1} className="text-heading font-semibold outline-none sm:sr-only">
        <span className="text-text-2">
          Step {step + 1} of {titles.length}
        </span>
        : {titles[step]}
      </h2>
    </>
  );
}
