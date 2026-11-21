import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: (n: string) => (n === "user-agent" ? "Mozilla/5.0 (Linux; Android 14; Pixel 7)" : null) }) }));
let me = "conor@example.com";
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {}, staffIdentity: async () => ({ ok: true, email: me }) }));
const { turnOffPushAction, turnOnPushAction } = await import("./push-actions");
const { pushStore } = await import("@/lib/push");
const { listActivity } = await import("@/lib/admin/activity");
const { b64u } = await import("@/lib/push/webpush");

const sub = async () => {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { endpoint: "https://fcm.googleapis.com/fcm/send/the-secret-endpoint", keys: { p256dh: b64u(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), auth: b64u(new Uint8Array(16)) } };
};

beforeEach(async () => {
  me = "conor@example.com";
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  for (const s of await pushStore.list()) await pushStore.remove(s.id);
});

describe("notifications on this device", () => {
  it("turns on for the signed-in person, once per device, and the history never has the endpoint", async () => {
    const s = await sub();
    const { id } = await turnOnPushAction(s);
    await turnOnPushAction(s);
    expect(await pushStore.list()).toEqual([expect.objectContaining({ id, email: "conor@example.com", endpoint: s.endpoint, label: "Android phone" })]);
    const [entry] = (await listActivity({ area: "settings" }, 1, 1)).rows;
    expect(entry.summary).toBe("Turned on notifications on a device (Android phone)");
    expect(JSON.stringify(entry)).not.toContain("secret-endpoint");
  });

  it("turns off only your own device", async () => {
    const { id } = await turnOnPushAction(await sub());
    me = "aoife@example.com";
    await turnOffPushAction(id!);
    expect(await pushStore.get(id!)).toBeDefined();
    me = "conor@example.com";
    await turnOffPushAction(id!);
    expect(await pushStore.get(id!)).toBeUndefined();
    expect((await listActivity({ area: "settings" }, 1, 1)).rows[0].summary).toBe("Turned off notifications on a device (Android phone)");
  });

  it("says so with no keys, and refuses an address that is not a push service's", async () => {
    expect(await turnOnPushAction({ ...(await sub()), endpoint: "https://example.com/hook" })).toEqual({ error: "This browser gave an address we cannot send to." });
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await turnOnPushAction(await sub())).toEqual({ error: "Notifications are not set up yet." });
    expect(await pushStore.list()).toEqual([]);
  });
});
