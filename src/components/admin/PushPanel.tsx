"use client";

import { useEffect, useState, useTransition } from "react";
import { turnOffPushAction, turnOnPushAction } from "@/app/settings/push-actions";
import { pushId, unb64u } from "@/lib/push/webpush";
import { adminButton, adminButtonQuiet, rowButton } from "./kit";
import { registerSw } from "./ServiceWorker";
import { BUSY } from "./ActButton";

export type Device = { id: string; label: string; added: string };
type Here = "checking" | "not-set-up" | "add-to-home" | "unsupported" | "ready";

// Notifications on this device (#11), for the person signed in. An iPhone has push only once the app is on the home screen (iOS 16.4+).
export function PushPanel({ publicKey, devices }: { publicKey: string | null; devices: Device[] }) {
  const [here, setHere] = useState<Here>("checking");
  const [thisId, setThisId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    void (async () => {
      if (!publicKey) return setHere("not-set-up");
      const apple = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (apple && !installed) return setHere("add-to-home");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setHere("unsupported");
      const sub = await (await registerSw()).pushManager.getSubscription();
      if (sub) setThisId(await pushId(sub.endpoint));
      setHere("ready");
    })();
  }, [publicKey]);

  const on = thisId !== null && devices.some((d) => d.id === thisId);
  // The browser's push service can throw (Brave's is off by default): a plain line, never the error screen.
  const turnOn = () =>
    start(async () => {
      setError("");
      try {
        if ((await Notification.requestPermission()) !== "granted") return setError("Notifications are blocked for this site. Allow them in your browser settings.");
        const reg = await registerSw();
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(publicKey!) }));
        const { endpoint, keys } = sub.toJSON();
        const r = await turnOnPushAction({ endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth } });
        if (r.error) {
          await sub.unsubscribe();
          return setError(r.error);
        }
        setThisId(r.id ?? null);
      } catch {
        setError("This browser could not turn on notifications.");
      }
    });
  const turnOff = (id: string) =>
    start(async () => {
      setError("");
      try {
        if (id === thisId) await (await (await registerSw()).pushManager.getSubscription())?.unsubscribe();
        await turnOffPushAction(id);
        if (id === thisId) setThisId(null);
      } catch {
        setError("This browser could not turn off notifications.");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {here === "not-set-up" && <p className="text-body">Notifications are not set up yet.</p>}
      {here === "add-to-home" && <p className="text-body">Add this to your home screen first: Share, then Add to Home Screen.</p>}
      {here === "unsupported" && <p className="text-body">This browser cannot show notifications.</p>}
      {here === "ready" && (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-measure text-body">{on ? "On. What you tick under Push comes here." : "Get what you tick under Push on this phone or computer."}</p>
          <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => (on ? turnOff(thisId!) : turnOn())} className={`${on ? adminButtonQuiet : adminButton} ${BUSY}`}>
            {on ? "Turn off" : "Turn on"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-meta text-destructive">{error}</p>}
      {devices.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-meta text-text-2">Your devices</h3>
          <ul className="flex flex-col">
            {devices.map((d) => (
              <li key={d.id} className="flex min-h-11 items-center justify-between gap-4 border-b border-hairline py-1.5">
                <span>
                  {d.label}
                  {d.id === thisId ? " (this one)" : ""} <span className="text-meta text-text-2">Added {d.added}</span>
                </span>
                <button type="button" disabled={pending} aria-busy={pending || undefined} onClick={() => turnOff(d.id)} className={`${rowButton} ${BUSY}`}>
                  Turn off
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
