"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// The bot check on the email form (src/lib/auth/turnstile.ts). Its script is loaded here, on the sign-in page only. The widget shows
// nothing unless Cloudflare wants a challenge. developers.cloudflare.com/turnstile/get-started/client-side-rendering/
type Api = { render(el: HTMLElement, o: Record<string, unknown>): string | undefined; reset(id: string): void; remove(id: string): void };
const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function load(): Promise<Api> {
  const api = () => (window as unknown as { turnstile?: Api }).turnstile;
  return new Promise((resolve, reject) => {
    if (api()) return resolve(api()!);
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (api() ? resolve(api()!) : reject());
    s.onerror = () => reject();
    document.head.append(s);
  });
}

// token is "" until the check passes, and again after it is used or expires. With no site key there is no widget (dev, E2E): token stays "".
export function useTurnstile(slot: React.RefObject<HTMLDivElement | null>) {
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);
  const widget = useRef<string | undefined>(undefined);
  const api = useRef<Api | undefined>(undefined);

  useEffect(() => {
    if (!SITE_KEY) return;
    let gone = false;
    load().then(
      (t) => {
        if (gone || !slot.current) return;
        api.current = t;
        widget.current = t.render(slot.current, {
          sitekey: SITE_KEY,
          action: "sign-in",
          appearance: "interaction-only",
          "response-field": false,
          callback: (v: string) => (setFailed(false), setToken(v)),
          "error-callback": () => (setToken(""), setFailed(true)),
          "expired-callback": () => setToken(""),
        });
      },
      () => setFailed(true),
    );
    return () => {
      gone = true;
      if (widget.current) api.current?.remove(widget.current);
    };
  }, [slot]);

  // A token works once: after a send that may have spent it, ask for a fresh one.
  const reset = useCallback(() => {
    setToken("");
    if (widget.current) api.current?.reset(widget.current);
  }, []);
  return { token, failed, reset };
}
