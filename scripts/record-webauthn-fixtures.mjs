// Records WebAuthn fixtures from Chrome's virtual authenticator (CDP WebAuthn domain) for src/lib/auth/webauthn.test.ts: for each of
// EdDSA, ES256 and RS256 a registration and a sign-in, on a platform authenticator (as a phone or laptop), plus a USB security key. Run: node scripts/record-webauthn-fixtures.mjs
// The output holds only public keys, challenges and the RP id `localhost`, so it is safe to commit (docs/sign-in.md, section 2).
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const server = createServer((_, res) => res.end("<!doctype html><title>fixtures</title>")).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const origin = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();

async function record(name, alg, authenticator) {
  const page = await browser.newPage();
  await page.goto(origin);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, ...authenticator },
  });
  const out = await page.evaluate(
    async (alg) => {
      const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      const random = () => crypto.getRandomValues(new Uint8Array(32));
      const [regChallenge, signChallenge, user] = [random(), random(), random()];
      const created = await navigator.credentials.create({
        publicKey: {
          rp: { id: "localhost", name: "Checkwork" },
          user: { id: user, name: "aoife@example.com", displayName: "aoife@example.com" },
          challenge: regChallenge,
          pubKeyCredParams: [{ type: "public-key", alg }],
          authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
          attestation: "none",
          timeout: 300000,
        },
      });
      const got = await navigator.credentials.get({ publicKey: { challenge: signChallenge, rpId: "localhost", userVerification: "required", allowCredentials: [] } });
      return {
        userHandle: b64u(user),
        registration: { challenge: b64u(regChallenge), id: created.id, clientDataJSON: b64u(created.response.clientDataJSON), attestationObject: b64u(created.response.attestationObject) },
        signIn: {
          challenge: b64u(signChallenge),
          id: got.id,
          clientDataJSON: b64u(got.response.clientDataJSON),
          authenticatorData: b64u(got.response.authenticatorData),
          signature: b64u(got.response.signature),
          userHandle: got.response.userHandle && b64u(got.response.userHandle),
        },
      };
    },
    alg,
  );
  await page.close();
  return { name, rpId: "localhost", origin, ...out };
}

// The virtual authenticator returns no credProtect output (tried on ctap2_1), so the ED case is the test authenticator's until a real
// security key is recorded.
const fixtures = [
  await record("chrome-virtual-platform-eddsa", -8, { transport: "internal" }),
  await record("chrome-virtual-platform-es256", -7, { transport: "internal" }),
  await record("chrome-virtual-platform-rs256", -257, { transport: "internal" }),
  await record("chrome-virtual-security-key-es256", -7, { transport: "usb", ctap2Version: "ctap2_1" }),
];
await browser.close();
server.close();
writeFileSync(new URL("../src/lib/auth/webauthn-fixtures.json", import.meta.url), JSON.stringify({ recordedWith: "scripts/record-webauthn-fixtures.mjs", fixtures }, null, 2) + "\n");
console.log(fixtures.map((f) => f.name).join("\n"));
