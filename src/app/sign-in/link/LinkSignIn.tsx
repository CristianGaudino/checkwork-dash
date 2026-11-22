"use client";

import { useEffect, useRef, useState } from "react";
import { adminButton } from "@/components/admin/kit";
import { peekSignInLink, signInWithLink } from "../actions";

type View = { kind: "loading" } | { kind: "missing" } | { kind: "expired" } | { kind: "rate" } | { kind: "ready"; email: string };
const RATE = "Too many tries. Wait a minute and try again.";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function LinkSignIn({ next }: { next: string }) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [iphone, setIphone] = useState(false);
  const [limited, setLimited] = useState(false); // the last press was refused for rate
  const token = useRef<string | null>(null); // kept in memory only, so a failed request can be tried again
  const started = useRef(false);

  const peek = async () => {
    if (!token.current) return;
    try {
      const r = await peekSignInLink(token.current);
      setView("email" in r ? { kind: "ready", email: r.email } : "rate" in r ? { kind: "rate" } : { kind: "expired" });
    } catch {
      setView({ kind: "rate" }); // a failed request, not a dead link: the token stays, so it can be tried again
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
    window.history.replaceState(null, "", window.location.pathname + window.location.search); // out of the address bar and the history at once
    const valid = TOKEN.test(t);
    if (valid) token.current = t;
    setIphone(/iPhone/.test(navigator.userAgent));
    if (!valid) void Promise.resolve().then(() => setView({ kind: "missing" }));
    else void peek();
  }, []);

  const use = async () => {
    setLimited(false);
    const r = token.current ? await signInWithLink(token.current, next) : { expired: true as const };
    if ("expired" in r) setView({ kind: "expired" });
    else setLimited(true); // rate: the token stays in memory and the button works again. Success redirects
  };

  if (view.kind === "ready")
    return (
      <>
        <h1 className="break-words text-display font-bold">Sign in as {view.email}?</h1>
        {limited && (
          <p role="alert" className="text-meta text-bad">
            {RATE}
          </p>
        )}
        <form action={use}>
          <button type="submit" className={`${adminButton} w-full`}>
            Sign in
          </button>
        </form>
        {iphone && <p className="text-meta text-text-2">Using the Checkwork app on your home screen? Type the code from the email in the app instead.</p>}
      </>
    );
  if (view.kind === "rate")
    return (
      <>
        <h1 className="text-display font-bold">Sign in</h1>
        <p role="alert" className="text-body text-text-2">
          {RATE}
        </p>
        <button type="button" onClick={() => void peek()} className={`${adminButton} w-full`}>
          Try again
        </button>
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
