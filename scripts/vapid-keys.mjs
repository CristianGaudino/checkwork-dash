// Makes a VAPID key pair for push notifications (#11, src/lib/push) with WebCrypto, and prints how to set it. Sets nothing itself.
// One pair per environment: node scripts/vapid-keys.mjs for dev, node scripts/vapid-keys.mjs --env production for production.
// The private key is shown once, here: paste it into the secret prompt and do not keep it anywhere else, never in the repo.
const prod = process.argv.includes("--env") && process.argv[process.argv.indexOf("--env") + 1] === "production";
const b64u = (b) => Buffer.from(b).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64u(await crypto.subtle.exportKey("raw", pair.publicKey));
const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;
const where = prod ? "production (env.production in wrangler.jsonc)" : "dev (the top level of wrangler.jsonc)";

console.log(`VAPID keys for ${where}

1. The public key is not a secret, so it may be a var or a secret, but never both: a var and a secret with the same name clash.
   Either add it to that environment's "vars" in wrangler.jsonc, and deploy:
   "VAPID_PUBLIC_KEY": "${publicKey}"
   or keep it out of wrangler.jsonc and make it a secret (no deploy needed):
   npx wrangler secret put VAPID_PUBLIC_KEY${prod ? " --env production" : ""}

2. The private key is always a Worker secret. Run this and paste the key when asked:
   npx wrangler secret put VAPID_PRIVATE_KEY${prod ? " --env production" : ""}

   ${privateKey}

Changing a pair later turns notifications off on every device: each person turns them on again in Settings.`);
