"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { REDUCED_MOTION } from "@/components/useMediaQuery";
import { countable, figureAt, parseFigure } from "@/lib/tween-number";

const DURATION = 300;
const never = () => () => {};

// A figure that counts to its new value when it changes in place (a filter, a typed deposit, a new period), so the eye sees which way it
// moved. On a page opened from another (its loading state gave way to it) it counts up from 0 once, as the figures arrive (#109). Never
// on a page's first paint from the server: that number is already on screen and stays put. Writes the text node React made, so React stays
// in charge of the final value. While it counts, its live region (if any) is aria-busy, so a screen reader waits for the settled figure.
export function Tween({ value }: { value: string }) {
  const el = useRef<HTMLSpanElement>(null);
  // False while hydrating the server's HTML, true when this mounts in the browser alone.
  const fresh = useRef(useSyncExternalStore(never, () => true, () => false));
  const shown = useRef(value); // what is on screen, so a change mid-count carries on from there

  useLayoutEffect(() => {
    const span = el.current;
    const node = span?.firstChild;
    const to = parseFigure(value);
    const from = fresh.current && to ? { ...to, n: 0 } : parseFigure(shown.current);
    fresh.current = false;
    shown.current = value;
    if (!span || !(node instanceof Text) || !countable(from, to) || window.matchMedia(REDUCED_MOTION).matches) return;
    const start = performance.now();
    const paint = (now: number) => {
      const t = (now - start) / DURATION;
      node.data = shown.current = t >= 1 ? value : figureAt(from, to!, t);
      if (t < 1) frame = requestAnimationFrame(paint);
      else region.removeAttribute("aria-busy");
    };
    const region = span.closest("[aria-live]") ?? span; // screen readers honour aria-busy on the live region itself
    region.setAttribute("aria-busy", "true");
    node.data = shown.current = figureAt(from, to!, 0); // back to the old figure before the browser paints the new one
    let frame = requestAnimationFrame(paint);
    // Stop only: React has already written the next value by the time this runs, and the next count starts from `shown`.
    return () => {
      cancelAnimationFrame(frame);
      region.removeAttribute("aria-busy");
    };
  }, [value]);

  return <span ref={el}>{value}</span>;
}
