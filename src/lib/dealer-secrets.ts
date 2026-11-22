import "server-only";
import { defineCollection } from "@/lib/admin/docs";
import { currentDealer } from "@/lib/tenancy/current";

// A dealer's own outside-service keys (#26), one sealed record each in their own store (the `secrets` collection). Sealed with AES-GCM:
// the key is HKDF-derived from the Worker secret DEALER_SECRETS_KEY (32 random bytes, base64) with the dealer's id as info, so one dealer's
// store opened under another's id fails. The record's name and the dealer are also the AAD, so a sealed value cannot be moved to another
// name. Format `v1.<iv>.<ciphertext>` (base64, a random 12-byte iv per value). A rotation adds a version here (v2 reads DEALER_SECRETS_KEY_V2)
// and reseals; until then an unknown version is refused. A value is never returned to a browser, logged, or put in the activity history.
const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// The key each version is sealed under, by Worker secret name.
const KEY_ENV: Record<string, string> = { v1: "DEALER_SECRETS_KEY" };
const CURRENT = "v1";

export const secretsKeyReady = () => {
  try {
    return unb64(process.env[KEY_ENV[CURRENT]] ?? "").length === 32;
  } catch {
    return false;
  }
};

async function aesKey(version: string, dealerId: string, usage: "encrypt" | "decrypt") {
  const raw = unb64(process.env[KEY_ENV[version] ?? ""] ?? "");
  if (raw.length !== 32) throw new Error("secrets key not set");
  const base = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(`checkwork/dealer-secret/${dealerId}`) }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}
const aad = (dealerId: string, name: string) => enc.encode(`${dealerId}/${name}`);

export async function seal(dealerId: string, name: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(dealerId, name) }, await aesKey(CURRENT, dealerId, "encrypt"), enc.encode(plain));
  return `${CURRENT}.${b64(iv)}.${b64(ct)}`;
}
export async function unseal(dealerId: string, name: string, sealed: string): Promise<string> {
  const [version, iv, ct] = sealed.split(".");
  if (!version || !iv || !ct) throw new Error("bad sealed value");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: aad(dealerId, name) }, await aesKey(version, dealerId, "decrypt"), unb64(ct));
  return new TextDecoder().decode(plain);
}

type Sealed = { id: string; sealed: string; at: number };
const store = defineCollection<Sealed>("secrets", () => []);

// Which of these names the current dealer has saved (no decrypting).
export const savedNames = async () => new Set((await store.list()).map((d) => d.id));

export async function saveSecret(name: string, value: string) {
  const { id } = await currentDealer();
  await store.put({ id: name, sealed: await seal(id, name, value), at: Date.now() });
}
export const removeSecret = (name: string) => store.remove(name);

// The value for the current dealer: theirs first, else the app-wide variable (so nothing breaks while a key is still a Worker secret).
export async function secretFor(name: string): Promise<string | undefined> {
  const mine = await store.get(name);
  if (mine) {
    try {
      return await unseal((await currentDealer()).id, name, mine.sealed);
    } catch {
      console.error(JSON.stringify({ job: "secrets", error: "could not open a saved key", name })); // the name only, never a value
    }
  }
  return process.env[name] || undefined;
}
