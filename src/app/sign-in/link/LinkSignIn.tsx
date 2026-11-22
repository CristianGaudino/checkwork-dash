"use client";

import { useEffect, useRef, useState } from "react";
import { adminButton } from "@/components/admin/kit";
import { peekSignInLink, signInWithLink } from "../actions";

type View = { kind: "loading" } | { kind: "missing" } | { kind: "expired" } | { kind: "ready"; email: string };
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function LinkSignIn({ next }: { next: string }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [iphone, setIphone] = useState(false);
  const token = useRef<string | null>(null); // kept in memory only, so a failed request can be tried again
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search); // out of the address bar and the history at once
    const valid = TOKEN.test(t);
    if (valid) token.current = t;
    void (async () => {
      setIphone(/iPhone/.test(navigator.userAgent));
      if (!valid) return setView({ kind: "missing" });
      try {
        const r = await peekSignInLink(t);
        setView("email" in r ? { kind: "ready", email: r.email } : { kind: "expired" });
      } catch {
        setView({ kind: "expired" });
      }
    })();
  }, []);

  const use = async () => {
    const r = token.current ? await signInWithLink(token.current, next) : { expired: true as const };
    if ("expired" in r) setView({ kind: "expired" }); // success redirects
  };

  if (view.kind === "ready")
    return (
      <>
        <h1 className="break-words text-display font-bold">Sign in as {view.email}?</h1>
        <form action={use}>
          <button type="submit" className={`${adminButton} w-full`}>
            Sign in
          </button>
        </form>
        {iphone && <p className="text-meta text-text-2">Using the Checkwork app on your home screen? Type the code from the email in the app instead.</p>}
      </>
    );
  return (
    <>
      <h1 className="text-display font-bold">{view.kind === "loading" ? "Sign in" : view.kind === "missing" ? "Open the link again" : "This link has expired"}</h1>
      {view.kind !== "loading" && <p className="text-body text-text-2">{view.kind === "missing" ? "Open the link from your email again." : "Go back to the sign-in page and ask for a new one."}</p>}
      {view.kind === "expired" && (
        <a href="/sign-in" className="inline-flex min-h-11 items-center text-meta font-medium text-accent-text underline">
          Sign in
        </a>
      )}
    </>
  );
}
