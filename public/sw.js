// The dashboard's service worker (#11). It caches only the offline screen and the app icon, never a page or data: everything a dealer sees
// is live and personal. Pages always come from the network; with no network a page shows the offline screen. It also shows push
// notifications (src/lib/push) and opens the app at a notification's link when tapped.
const CACHE = "checkwork-shell-v1";
const SHELL = ["/offline.html", "/brand/app-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Page loads only. Everything else (scripts, actions, data) goes to the network untouched.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  // Copied into a new response: Workers static assets may have redirected /offline.html to /offline, and a page load refuses a redirected one.
  const offline = () => caches.match("/offline.html").then((r) => (r ? new Response(r.body, { headers: { "Content-Type": "text/html; charset=utf-8" } }) : Response.error()));
  event.respondWith(fetch(event.request).catch(offline));
});

// { title, body, url } from the server: what happened, the car, and the record's own page.
self.addEventListener("push", (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    // not ours: show the plain one
  }
  event.waitUntil(
    self.registration.showNotification(msg.title || "Checkwork", { body: msg.body || "", icon: "/brand/app-192.png", badge: "/brand/app-192.png", data: { url: msg.url || "/" } }),
  );
});

// A tap opens the app at the link: an open window of the app is focused and moved there, or a new one opens. Only our own paths.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  const url = new URL(raw.startsWith("/") && !raw.startsWith("//") ? raw : "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      // navigate() works only on a window this worker controls; otherwise a new one opens.
      if (win) return win.focus().then(() => win.navigate(url)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});
