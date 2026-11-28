"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const never = () => () => {};

// A figure, written as it is: it never counts (#214), a number racing up looked jarring. Only when it changes in place (a filter, a typed
// deposit, an action) does it settle in with a short, quiet fade, opacity only, so it stays under reduced motion. Never on its first paint.
export function Tween({ value }: { value: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);

  useLayoutEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    el.current?.animate?.([{ opacity: 0.5 }, { opacity: 1 }], { duration: 150, easing: "ease-out" });
  }, [value]);

  return <span ref={el}>{value}</span>;
}

// Content that eases in when it mounted in the browser (a client navigation, a new period), never on the server's first paint. The first
// value is held, so the re-render after hydration does not flip it on. The CSS is the [data-fresh] rules.
export function Fresh({ className, children }: { className?: string; children: ReactNode }) {
  const [fresh] = useState(useSyncExternalStore(never, () => true, () => false));
  return (
    <div data-fresh={fresh || undefined} className={className}>
      {children}
    </div>
  );
}
