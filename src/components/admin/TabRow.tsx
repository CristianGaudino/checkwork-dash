"use client";

import { useEffect, useRef } from "react";

// A row of tabs that scrolls sideways on a phone, scrolled so the open tab is in view on load and on each change (`current`). Only the
// row scrolls, never the page. An edge with more beyond it fades out, so a cut-off tab reads as "there is more", never as a cut label.
export function TabRow({ current, children, style, ...rest }: { current: string; children: React.ReactNode } & React.ComponentProps<"nav">) {
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = row.current;
    if (!nav) return;
    const tab = nav.querySelector("[aria-current]");
    if (tab) {
      const [n, t] = [nav.getBoundingClientRect(), tab.getBoundingClientRect()];
      nav.scrollLeft += t.left - n.left - (n.width - t.width) / 2;
    }
    // Each edge fades only while there is more past it (2rem of fade, none at an end).
    const fade = () => {
      const end = nav.scrollWidth - nav.clientWidth - nav.scrollLeft;
      nav.style.setProperty("--fade-l", nav.scrollLeft > 1 ? "2rem" : "0px");
      nav.style.setProperty("--fade-r", end > 1 ? "2rem" : "0px");
    };
    fade();
    nav.addEventListener("scroll", fade, { passive: true });
    window.addEventListener("resize", fade);
    return () => {
      nav.removeEventListener("scroll", fade);
      window.removeEventListener("resize", fade);
    };
  }, [current]);
  return (
    <nav ref={row} style={{ maskImage: "linear-gradient(to right, transparent, #000 var(--fade-l, 0px), #000 calc(100% - var(--fade-r, 0px)), transparent)", ...style }} {...rest}>
      {children}
    </nav>
  );
}
