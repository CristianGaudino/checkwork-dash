"use client";

import { useEffect, useRef } from "react";

// A row of tabs that scrolls sideways on a phone, scrolled so the open tab is in view on load and on each change (`current`). Only the
// row scrolls, never the page.
export function TabRow({ current, children, ...rest }: { current: string; children: React.ReactNode } & React.ComponentProps<"nav">) {
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = row.current;
    const tab = nav?.querySelector('[aria-current="page"]');
    if (!nav || !tab) return;
    const [n, t] = [nav.getBoundingClientRect(), tab.getBoundingClientRect()];
    nav.scrollLeft += t.left - n.left - (n.width - t.width) / 2;
  }, [current]);
  return (
    <nav ref={row} {...rest}>
      {children}
    </nav>
  );
}
