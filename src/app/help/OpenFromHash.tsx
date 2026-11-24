"use client";

import { useEffect } from "react";

// A link to /help#whatsapp opens that topic: a <details> does not open itself when it is the link's target, only when something inside it is.
export function OpenFromHash() {
  useEffect(() => {
    const open = () => {
      const el = document.getElementById(location.hash.slice(1)); // ids are plain kebab-case: decoding would only add a URIError on /help#%;
      if (!(el instanceof HTMLDetailsElement)) return;
      el.open = true;
      el.scrollIntoView({ block: "start" });
      el.querySelector("summary")?.focus({ preventScroll: true });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
