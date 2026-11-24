import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { noticeOfLead, notify } = await import("@/lib/admin/notifications");
const { LEAD_TYPES } = await import("@/lib/admin/collections");
const { pushStore, pushToTeam, validSub, deviceLabel } = await import("./index");
const { b64u, ecJwk, unb64u } = await import("./webpush");
const { runAsDealer } = await import("@/lib/tenancy/current");

// A browser's side: its own key pair and auth secret, so the test can open what was sent, as the phone would.
type Phone = { endpoint: string; keys: { p256dh: string; auth: string }; priv: CryptoKey };
async function phone(name: string): Promise<Phone> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const p256dh = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}-secret-endpoint`, keys: { p256dh, auth: b64u(crypto.getRandomValues(new Uint8Array(16))) }, priv: pair.privateKey };
}
async function open(p: Phone, body: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16);
  const asPublic = body.slice(21, 86);
  const ua = unb64u(p.keys.p256dh);
  const hkdf = async (s: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string | Uint8Array<ArrayBuffer>, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: s, info: typeof info === "string" ? new TextEncoder().encode(info) : info }, await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), n * 8));
  const as = await crypto.subtle.importKey("jwk", ecJwk(asPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: as }, p.priv, 256));
  const info = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...ua, ...asPublic]);
  const ikm = await hkdf(unb64u(p.keys.auth), ecdh, info, 32);
  const key = await crypto.subtle.importKey("raw", await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16), "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12) }, key, body.slice(86)));
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
}

let sent: { url: string; body: Uint8Array<ArrayBuffer> }[];
let status: number;
const phones: Record<string, Phone> = {};
beforeEach(async () => {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"])) as CryptoKeyPair;
  vi.stubEnv("VAPID_PUBLIC_KEY", b64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))));
  vi.stubEnv("VAPID_PRIVATE_KEY", (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!);
  sent = [];
  status = 201;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, body: init.body as Uint8Array<ArrayBuffer> });
    return new Response(null, { status });
  });
  for (const s of await pushStore.list()) await pushStore.remove(s.id);
  // The demo team (src/lib/admin/collections.ts): Aoife the owner, Conor in sales; and someone no longer on it.
  for (const [who, email] of [["aoife", "aoife@example.com"], ["conor", "conor@example.com"], ["gone", "gone@example.com"]]) {
    phones[who] = await phone(who);
    await pushStore.put({ id: `push-${who}`, email, endpoint: phones[who].endpoint, keys: phones[who].keys, label: "Android phone", addedAt: 0 });
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const to = () => sent.map((s) => s.url.split("/").pop()!.split("-")[0]).sort();

describe("push notifications follow the bell", () => {
  it("sends a new website request to everyone still on the team, saying what happened and the car only", async () => {
    await notify({ kind: "lead", text: "Car enquiry", detail: "2019 Kia Soul", href: "/leads/real-1" });
    expect(to()).toEqual(["aoife", "conor"]);
    expect(await open(phones.aoife, sent.find((s) => s.url === phones.aoife.endpoint)!.body)).toEqual({ title: "Car enquiry", body: "Checkwork Motors: 2019 Kia Soul", url: "/dealers/open?dealer=checkwork-motors&to=%2Fleads%2Freal-1" });
    sent = [];
    await notify({ kind: "drive", text: "Test drive request", detail: "2019 Kia Soul", href: "/test-drives/real-2" });
    expect(await open(phones.conor, sent.find((s) => s.url === phones.conor.endpoint)!.body)).toMatchObject({ title: "Test drive request", url: "/dealers/open?dealer=checkwork-motors&to=%2Ftest-drives%2Freal-2" });
  });

  it("sends a lead given to someone to that person alone", async () => {
    await notify({ kind: "assigned", for: "Conor Doyle", text: "Aoife Brennan gave you a lead", detail: "Finance application · 2019 Kia Soul", href: "/leads/l9" });
    expect(to()).toEqual(["conor"]);
    expect(await open(phones.conor, sent[0].body)).toEqual({ title: "Aoife Brennan gave you a lead", body: "Checkwork Motors: Finance application · 2019 Kia Soul", url: "/dealers/open?dealer=checkwork-motors&to=%2Fleads%2Fl9" });
  });

  it("goes only to those who keep push on for it (Settings, Notifications, #142)", async () => {
    const { staffStore } = await import("@/lib/whatsapp/store");
    const conor = (await staffStore.get("u2"))!;
    await staffStore.put({ ...conor, push: ["assigned"] });
    try {
      await notify({ kind: "lead", text: "Car enquiry", detail: "2019 Kia Soul", href: "/leads/real-1" });
      expect(to()).toEqual(["aoife"]);
      sent = [];
      await notify({ kind: "lead", text: "Trade-in valuation", href: "/leads/real-2" }, Date.now(), "trade-in");
      expect(to()).toEqual(["aoife"]);
      sent = [];
      await notify({ kind: "assigned", for: "Conor Doyle", text: "Aoife Brennan gave you a lead", href: "/leads/l9" });
      expect(to()).toEqual(["conor"]);
    } finally {
      await staffStore.put(conor);
    }
  });

  it("sends nothing for the bell's other kinds, or with no keys set", async () => {
    await notify({ kind: "sync", text: "DoneDeal stock did not update", href: "/stock" });
    await notify({ kind: "warranty", text: "Warranty request", href: "/aftersales/requests/w" });
    expect(sent).toEqual([]);
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await notify({ kind: "lead", text: "Car enquiry", href: "/leads/x" });
    expect(sent).toEqual([]);
  });
});

describe("what a website request says on the lock screen", () => {
  it("names the kind and what it is about for every kind of lead, never the customer", async () => {
    const customer = { name: "Sean O'Brien", email: "sean@example.ie", phone: "087 123 4567" };
    for (const type of LEAD_TYPES) {
      sent = [];
      const n = noticeOfLead({ id: `real-${type}`, type, carTitle: "2020 Audi A3 1.6 TDI", ...customer });
      await notify(n);
      if (type === "warranty") {
        expect(sent).toEqual([]); // stays in the bell
        continue;
      }
      const push = await open(phones.aoife, sent.find((s) => s.url === phones.aoife.endpoint)!.body);
      expect(push.title).toBe(n.text);
      expect(push.title).not.toBe("General");
      expect(push.body).toBe("Checkwork Motors: 2020 Audi A3 1.6 TDI");
      expect(JSON.stringify(push)).not.toMatch(/Sean|sean@|087/);
    }
  });

  it("gives a contact form message its topic and answers, as the leads list tags them", async () => {
    await notify(noticeOfLead({ id: "real-m", type: "general", topic: "buying", answers: { timing: "this-week", hasTradeIn: "yes", contactVia: "call" } }));
    expect(await open(phones.aoife, sent.find((s) => s.url === phones.aoife.endpoint)!.body)).toMatchObject({ title: "Message", body: "Checkwork Motors: Buying, this week, trade-in" });
  });
});

describe("a device the push service no longer knows", () => {
  it("is removed on a 404 or 410, and kept on any other failure", async () => {
    status = 410;
    await pushToTeam({ title: "A lead for you", body: "2019 Kia Soul", url: "/leads/1" }, "Conor Doyle");
    expect(await pushStore.get("push-conor")).toBeUndefined();
    status = 404;
    await pushToTeam({ title: "A lead for you", body: "2019 Kia Soul", url: "/leads/1" }, "Aoife Brennan");
    expect(await pushStore.get("push-aoife")).toBeUndefined();
    await pushStore.put({ id: "push-aoife", email: "aoife@example.com", endpoint: phones.aoife.endpoint, keys: phones.aoife.keys, label: "Mac", addedAt: 0 });
    status = 500;
    await pushToTeam({ title: "A lead for you", body: "x", url: "/" }, "Aoife Brennan");
    expect(await pushStore.get("push-aoife")).toBeDefined();
  });
});

describe("nothing personal in the logs", () => {
  it("logs a failure by its status only, never the endpoint, the keys or what the lead said", async () => {
    const lines: string[] = [];
    for (const level of ["log", "warn", "error", "info"] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    status = 500;
    await notify({ kind: "lead", text: "Car enquiry", detail: "2019 Kia Soul", href: "/leads/real-1" });
    vi.stubGlobal("fetch", async () => {
      throw new Error(`could not reach ${phones.aoife.endpoint}`);
    });
    await notify({ kind: "lead", text: "Car enquiry", detail: "2019 Kia Soul", href: "/leads/real-1" });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l).not.toMatch(/secret-endpoint|fcm\.googleapis|example\.com|Kia/);
      for (const p of Object.values(phones)) expect(l).not.toContain(p.keys.p256dh);
    }
    vi.restoreAllMocks();
  });
});

describe("dealers kept apart", () => {
  it("keeps one dealer's devices from another, and a push at one never reaches the other's", async () => {
    await runAsDealer("test-motors", async () => {
      expect(await pushStore.list()).toEqual([]);
      await pushStore.put({ id: "push-b", email: "aoife@example.com", endpoint: "https://fcm.googleapis.com/fcm/send/b-secret-endpoint", keys: phones.aoife.keys, label: "Mac", addedAt: 0 });
      await notify({ kind: "lead", text: "Car enquiry", href: "/leads/x" });
    });
    expect(sent).toEqual([]); // Test Motors' team is empty: Aoife works at Checkwork Motors
    expect((await pushStore.list()).map((s) => s.id).sort()).toEqual(["push-aoife", "push-conor", "push-gone"]);
  });
});

describe("what the browser sends", () => {
  it("takes only a browser push service's address and well formed keys", async () => {
    const p = await phone("ok");
    expect(validSub(p)).toBe(true);
    expect(validSub({ ...p, endpoint: "https://web.push.apple.com/abc" })).toBe(true);
    expect(validSub({ ...p, endpoint: "https://evil.example.com/fcm.googleapis.com" })).toBe(false);
    expect(validSub({ ...p, endpoint: "http://fcm.googleapis.com/x" })).toBe(false);
    expect(validSub({ ...p, endpoint: "https://169.254.169.254/" })).toBe(false);
    expect(validSub({ ...p, keys: { p256dh: "short", auth: p.keys.auth } })).toBe(false);
    expect(validSub({ endpoint: p.endpoint })).toBe(false);
  });

  it("names the device from its browser", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 7)")).toBe("Android phone");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows computer");
  });
});
