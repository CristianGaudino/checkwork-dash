"use client";

import { useEffect, useRef } from "react";

// A row of tabs that scrolls sideways on a phone, scrolled so the open tab is in view on load and on each change (`current`). Only the
// row scrolls, never the page. An edge with more beyond it fades out, so a cut-off tab reads as "there is more", never as a cut label.
export function TabRow({ current, children, className = "", ...rest }: { current: string; children: React.ReactNode } & React.ComponentProps<"nav">) {
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
      const [l, r] = [nav.scrollLeft > 1 ? "2rem" : "0px", end > 1 ? "2rem" : "0px"];
      // The mask only while there is more: with none it would clip the focus ring on a row that does not scroll (640px up).
      nav.style.maskImage = l === "0px" && r === "0px" ? "" : `linear-gradient(to right, transparent, #000 ${l}, #000 calc(100% - ${r}), transparent)`;
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
    // scroll-px-8: a tab reached by keyboard stops clear of the fade.
    <nav ref={row} className={`scroll-px-8 ${className}`} {...rest}>
      {children}
    </nav>
  );
}
