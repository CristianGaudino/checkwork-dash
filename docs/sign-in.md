# Our own sign-in (#10)

Design and security review. It replaces Cloudflare Access with sign-in of our own: passkeys first, an emailed code and link as the
fallback, invite only. Status: approved by the owner on 2026-11-22 (`docs/decisions.md`), built in the steps of section 9.
Revised after an independent security review (second round).

What is fixed (owner): our own code, never Clerk, Auth0 or a similar service; invite only, never a sign-up page; passkeys first, email as
the fallback; a short-lived, HTTP-only session cookie with sign-out everywhere; it works in the installed phone app; rate limits and
lockout; no personal data in logs; no new dependency unless truly unavoidable. This design adds none.

The seam does not move. `staffIdentity()` in `src/lib/staff.ts` is still the one function that says who is signed in; only its body
changes, from "verify the Access token" to "look up the session". Which dealer, and with which role, stays the directory's
(`dealerAccess()` in `src/lib/tenancy/membership.ts`), checked on every request. Nothing in sign-in ever names a dealer.

## 1. How it works for a person

### Being invited

An owner or manager adds the person in Settings, Team, as today (or we add a dealer's first owner with `scripts/add-dealer.mjs`). Adding
them is the invitation: there is no other way in. When someone is added in Settings, Team, they get one email:

> Subject: You have been added to Checkwork Motors
>
> Ciara Walsh added you to the Checkwork Motors team on Checkwork.
>
> Sign in at https://www.dash.checkwork.ie with this email address.

The invitation carries no token. It is a plain link to the sign-in page, so an old invitation in a mailbox can never sign anyone in.
A dealer's first owner, added by our script, gets the same words from us.

### First sign-in

1. **Sign in** (`/sign-in`). Title "Sign in to Checkwork". A button "Sign in with a passkey", then "or", an Email field and a button
   "Email me a code". Nothing else: no sign-up link, no "forgot password" (there are no passwords).
2. They type their email and tap "Email me a code".
3. **Check your email** (`/sign-in/code`). "If that email is on a team, we have sent a code to it. It works for 15 minutes." A Code field
   (six digits) and a button "Sign in". Under it: "Send a new code" (after a minute) and "Use a different email". The page says the same
   for an email that is on no team, so it never tells anyone whether an address is known.
4. The email has the code and a link (section 3). They type the code, or tap the link and then "Sign in" on the page it opens.
5. Signed in, they land where they were going (the link they first opened, or the overview), with one dealer open, or the chooser if they
   are at several.
6. Straight after a sign-in by email, the page **Sign in faster next time** (`/sign-in/passkey`) asks once: "Use Face ID, your
   fingerprint or your screen lock instead of an email." Buttons "Add a passkey" and "Not now".

Every sign-in by email also sends the person a short notice: "A device signed in to Checkwork with an email code (iPhone, 21 Nov 09:14).
If it was not you, sign in, tap Sign out everywhere and check your passkeys."

### Adding a passkey

"Add a passkey" opens the phone's or computer's own passkey prompt (Face ID, a fingerprint, Windows Hello, the screen lock). Once done:
"Passkey added. Next time, tap Sign in with a passkey." The person also gets an email: "A passkey was added to your Checkwork sign-in
(iPhone). If it was not you, remove it in Settings, Your sign-in, and tell your manager."

It can also be added later in **Settings, Your sign-in**, which lists:

| Part | What it shows |
|---|---|
| Passkeys | Each one's device ("iPhone", "Mac", "Android phone", "Windows"), "Added 3 Nov, last used today", and Remove |
| Signed in on | Each signed-in device, its kind and when it signed in, "This device" on the current one |
| Buttons | "Add a passkey", "Sign out", "Sign out everywhere" |

Adding or removing a passkey needs the session to have been confirmed within the last 10 minutes (`sessions.verified_at`, set at sign-in
and by "Confirm it's you"). Otherwise the page first asks **Confirm it's you**:

- A passkey: `allowCredentials` lists only the passkeys of the person this session belongs to, and the server checks that the credential's
  `staff_id` equals `session.staff_id`. Someone else's passkey on the same device cannot confirm.
- Or an emailed code, sent only to the session's own email (there is no Email field on this screen). It carries no link, works only in
  this browser, and counts towards the same limits as a sign-in code (section 5).

Success sets `verified_at` and starts no new session. So a session left open on a desk cannot quietly add a passkey for someone else.

A sign-in itself also sets `verified_at`, so someone who signs in with a code relayed through a fake page (section 8, phishing) can add a
passkey of their own in the next 10 minutes. What catches that is the "A passkey was added" email and the passkey list the person is
pointed to after "Sign out everywhere".

From then on, "Sign in with a passkey" is one tap and Face ID: no email typed. On a browser that offers it, the Email field also offers the
passkey as an autofill suggestion.

### A new phone, and the installed app

- **Passkeys from iCloud Keychain or Google Password Manager** are synced: on a new iPhone or Android phone signed in to the same Apple or
  Google account, "Sign in with a passkey" just works.
- **Otherwise** they sign in once by email code on the new phone and add a passkey there, or use the phone that has the passkey: on a
  laptop, the browser's passkey prompt offers "use a phone" with a QR code (the standard cross-device sign-in).
- **The installed app on an iPhone** keeps its cookies apart from the browser's, so it signs in on its own, once. A passkey works there as
  in the browser, because passkeys live in the phone's keychain, not in the browser. The emailed code is the fallback that works inside the
  app: a link in Mail opens in the phone's default browser (Safari unless the person changed it), never in the installed app (section 3).
  Not yet tested on a real device: step 5 of the build plan does.
- **The installed app on Android** shares its sign-in with Chrome on the same phone, so signing in in either signs in both.

### A lost or stolen phone

1. They sign in anywhere else (a laptop, by email code or another passkey), open Settings, Your sign-in, tap "Sign out everywhere" and
   remove the lost phone's passkey if it is not a synced one.
2. If they cannot sign in at all, someone allowed to taps "Sign out on all devices" next to their name in Settings, Team: an owner for
   anyone, a manager for anyone but an owner (the rule Settings, Team already has for changing an owner).
3. A synced passkey on the lost phone still needs that phone's Face ID or passcode to be used, so the phone's lock protects it. Their email
   on the phone is the weaker part: anyone who can read it can get a code. Settings tells them so in one line on this screen.

After "Sign out everywhere" the page says: "Check your passkeys below and remove any you do not recognise." Sign out everywhere keeps
passkeys, so this is where a passkey someone else added would be found (the email sent when it was added is the other place).

"Sign out everywhere" also turns off notifications on every device they had, so a lost phone stops showing leads on its lock screen.

### Sign out, and sign out everywhere

- **Sign out** (the menu, and Settings, Your sign-in) ends this device's session, turns off this device's notifications and opens the
  sign-in page.
- **Sign out everywhere** asks first ("Sign out on every device, this one too?"), then ends every session of theirs, turns off
  notifications on all their devices and opens the sign-in page. Passkeys stay.

A session is a person, not a dealer, so "Sign out everywhere", and an owner's or manager's "Sign out on all devices", end the person's
sessions at every dealer they are at. Someone at two dealers who is signed out by one of them signs in again and still reaches the other.

### Removed from the team

Removing someone in Settings, Team (`changeTeamMember` in `src/lib/admin/collections.ts`, which also handles adding and role changes) ends
their sessions, in this order:

1. The directory membership is removed, then the dealer's own details are saved (`details()`), as today. If `details()` throws, the
   membership is put back and nothing else has happened: no session, passkey or staff row is touched.
2. Only when `role === null` (a removal) and only after `details()` has succeeded: every session of the person ends, at every dealer. If
   they are at no dealer any more, their passkeys, staff row and pending sign-in attempts are deleted too.
3. A role change ends nothing: the role is read from the directory on every request anyway.

If step 2 fails after step 1 succeeded, the removal still stands: the membership is gone, so their sessions no longer reach this dealer,
and the nightly purge deletes passkeys and staff rows with no membership. If they are still at another dealer they sign in again and
reach only that one. At no dealer, signing in gives the same "If that email is on a team" answer as for a stranger. Their devices'
notifications already go when they leave (today's rule).

## 2. Passkeys (WebAuthn)

References: W3C Web Authentication Level 3 (cited below by section title or number), MDN "Web Authentication API".

### Relying party id: one per environment

| Environment | RP id | Origin accepted |
|---|---|---|
| Production | `dash.checkwork.ie` | `https://www.dash.checkwork.ie` only |
| Dev | `dev.dash.checkwork.ie` | `https://dev.dash.checkwork.ie` only |
| `next dev`, E2E | `localhost` | `http://localhost:<port>` (WebAuthn treats localhost as a secure context) |

Why not one RP id (`dash.checkwork.ie`) for both:
- A passkey manager lists every passkey for an RP id. Our own people use both environments: with one RP id their picker would show the dev
  and the production passkey side by side, and the wrong one fails, because each environment has its own directory.
- Kept apart, a dev passkey is never offered on production and the other way round.

Why production's is `dash.checkwork.ie` and not `www.dash.checkwork.ie`: it keeps passkeys working if we ever drop `www` (the bare domain
redirects to www today, so only the www origin reaches the app). An RP id may be the origin's host or a registrable suffix of it
(WebAuthn, "Relying Party Identifier"), so a page on dev could ask for production's RP id and get a production passkey to sign. That gains
nothing: the browser signs the real origin (dev's) into `clientDataJSON`, and production accepts only its own origin. Rule that follows:
nothing is hosted under `dash.checkwork.ie` except production itself and dev, and dev is ours, deployed from this repo.

The RP id and origin come from the environment's vars in `wrangler.jsonc` (`APP_URL` exists; `RP_ID` is new), never from a request.

### Registration (adding a passkey)

Options the server sends (`navigator.credentials.create`):

| Option | Value | Why |
|---|---|---|
| `rp` | `{ id: RP_ID, name: "Checkwork" }` | |
| `user.id` | the person's user handle: 32 random bytes, the same for all their passkeys | Never the email: WebAuthn says the user handle must not hold personal data ("User Handle Contents"). One per person, because an authenticator replaces a passkey with the same RP id and user handle |
| `user.name`, `user.displayName` | their email | Shown only in their own passkey manager |
| `challenge` | 32 random bytes, single use, 5 minutes | |
| `pubKeyCredParams` | EdDSA (-8), ES256 (-7), RS256 (-257), in that order | The list WebAuthn L3 recommends. ES256 covers Apple, Google and most security keys; Windows Hello has used RS256; some security keys prefer Ed25519. Workers' WebCrypto verifies Ed25519, and it is the simplest of the three to check (a raw 64-byte signature, no DER), about 10 lines |
| `authenticatorSelection` | `residentKey: "required"`, `requireResidentKey: true`, `userVerification: "required"` | A discoverable passkey, so sign-in needs no email typed; user verification so a passkey is something you have and are |
| `attestation` | `"none"` | We do not need to know the make of the authenticator, and attestation brings certificate chains we would have to check |
| `excludeCredentials` | their existing passkeys | The same device is not added twice |
| `timeout` | 300000 ms | |

### Authentication (signing in)

Options (`navigator.credentials.get`): a fresh challenge (32 bytes, single use, 5 minutes), `rpId`, `userVerification: "required"`,
`allowCredentials` empty (discoverable passkeys: the person picks theirs). For "Confirm it's you", `allowCredentials` lists the session
person's passkeys instead (section 1).

The challenge is kept server side (section 6, `sign_in_attempts`), not in a cookie, so it can be used once only.

**Autofill (conditional mediation).** The sign-in page also starts a request with `mediation: "conditional"`, so the Email field
(`autocomplete="username webauthn"`) offers passkeys where the browser supports it. Three rules:
- Its challenge lives 5 minutes, so while the page is visible the page aborts and restarts it with a fresh challenge every 4 minutes.
  Timers stop in a hidden tab, so on `visibilitychange` back to visible it also restarts the request if it is older than 4 minutes.
- Before "Sign in with a passkey" starts its own request, the page aborts the conditional one (`AbortController`). A browser allows one
  request at a time.
- Every challenge row written for someone signed out counts in `SIGN_IN_LIMITER` (section 5), so a script cannot fill the table.

**Tidying the person's passkey manager** (WebAuthn L3 §5.1.10, signal methods), each call wrapped in a check that the browser has it:
- Only when no `passkeys` row exists for the credential id (a removed passkey, or a person deleted), the server says so and the page
  calls `PublicKeyCredential.signalUnknownCredential({ rpId, credentialId })`, so the manager can hide it. A passkey we hold that is
  refused for any other reason (a bad signature, the counter, a person at no active dealer whose rows are not yet purged) never triggers
  it: §5.1.10.2 is for credentials the site does not recognise, and §5.1.10.3 warns that a manager may remove a passkey for good.
- After every passkey sign-in, and after a passkey is removed in Settings, Your sign-in, the page calls
  `PublicKeyCredential.signalAllAcceptedCredentials({ rpId, userId, allAcceptedCredentialIds })` with the person's current list, which the
  server returns (§5.1.10.3).

### Reading the binary parts

- **The CBOR reader** decodes one item and reports how many bytes it used. Where a structure must be complete (the attestation object,
  an extensions map) the caller requires nothing left over.
- **Authenticator data at registration:** 37 bytes (rpIdHash, flags, count), then the attested credential data (AAGUID, credential id
  length and id), then the credential public key as one CBOR item. Then, if the ED flag (bit 7) is set, the extensions as one CBOR map.
  Then nothing may be left. ED set with nothing after the key is refused; bytes after the key with ED clear are refused. This case is
  real: Chrome sets `credProtect` on discoverable credentials made on security keys, which comes back as an extension.
- **Authenticator data at sign-in:** AT (bit 6) must be clear. 37 bytes, then, only if ED is set, one CBOR map, then nothing.

### What the server checks

Registration (WebAuthn, "Registering a New Credential"), every one or it fails:

1. `clientDataJSON` parses; `type` is `webauthn.create`.
2. `challenge` equals an unused, unexpired challenge we issued for this person's registration, which is then marked used in the same
   statement (`UPDATE ... WHERE used_at IS NULL ... RETURNING`).
3. `origin` equals this environment's origin exactly. `crossOrigin` is absent or false; `topOrigin` is absent.
4. `attestationObject` decodes (CBOR, nothing left over). `fmt` is either:
   - `none` with an empty `attStmt`; or
   - `packed` with no `x5c` (self attestation): `attStmt.alg` equals the new credential's `alg`, and `attStmt.sig` verifies with the new
     credential's own public key over `authenticatorData` followed by SHA-256 of `clientDataJSON`. When the site asks for `"none"`, the
     client keeps self attestation only when the AAGUID is all zeros, `fmt` is `packed` and there is no `x5c`, and replaces anything else
     with `none` (WebAuthn L3 §5.1.3, step 22). Whether self attestation is acceptable is the site's choice (§7.1, step 24): we accept
     it, because it tells us no more and no less than `none` does.

   Anything else is refused.
5. `authenticatorData` reads as above; `rpIdHash` equals SHA-256 of our RP id.
6. Flags: UP (bit 0) set, UV (bit 2) set, AT (bit 6) set. If BE (bit 3) is clear, BS (bit 4) must be clear too.
7. The credential id is at most 1023 bytes and not registered to anyone yet.
8. The COSE public key is one we offered, and its parts match:

   | `alg` | `kty` | Other checks |
   |---|---|---|
   | -8 EdDSA | 1 (OKP) | `crv` 6 (Ed25519); `x` is 32 bytes |
   | -7 ES256 | 2 (EC2) | `crv` 1 (P-256); `x` and `y` are 32 bytes each |
   | -257 RS256 | 3 (RSA) | the modulus `n` is 2048 to 4096 bits; the exponent `e` is 65537 (with `e` = 1 anyone could forge a signature) |

   WebCrypto's `importKey` then refuses a point that is not on the curve.

Sign-in (WebAuthn, "Verifying an Authentication Assertion"):

1. The credential id is one we hold, and it belongs to a person who is at an active dealer. In a sign-in (no one identified beforehand),
   `response.userHandle` must be present and equal that person's user handle (WebAuthn L3 §7.2: when the user was not identified before
   the ceremony, the user handle is required). In "Confirm it's you", the credential's `staff_id` must equal `session.staff_id`, and a
   user handle, if present, must equal theirs.
2. `clientDataJSON`: `type` is `webauthn.get`; `challenge` is an unused, unexpired one we issued for this kind of request (sign-in, or
   this session's confirmation), marked used in the same statement; `origin` exact; `crossOrigin` absent or false.
3. `authenticatorData` reads as above; `rpIdHash` matches; UP and UV set; BE equals what was stored at registration (it never changes for
   a credential, "Credential Backup State"); if BE is clear, BS is clear.
4. The signature verifies with the stored public key over `authenticatorData` followed by SHA-256 of the raw `clientDataJSON` bytes.
5. Counter ("Signature Counter Considerations"): checked and written in one statement, `UPDATE passkeys SET sign_count = :new, ... WHERE id
   = :id AND (sign_count < :new OR (sign_count = 0 AND :new = 0)) RETURNING id`. No row back means the count went back or stood still (a
   possible cloned authenticator): refused, logged by its code only, and the person is told to sign in by email. Synced passkeys (Apple,
   Google) always send 0, which passes. Because the check is the write, two sign-ins racing with the same count cannot both pass.
6. That statement also writes BS and last used; then a session starts (section 4). In "Confirm it's you", `verified_at` is set instead.

### Stored per passkey

Credential id, the person's id, the COSE public key (bytes) and its `alg`, the sign count, BE and BS, the transports the browser reported (to
help the browser's prompt), a label from the device kind (the same `deviceLabel` the notifications panel uses: "iPhone", "Mac"), created and
last used. Never the attestation, and nothing biometric: Face ID and fingerprints never leave the device.

### Our own code, not a library

It can be done with WebCrypto (in Workers) and a small reader in our code, as Web Push already is (`src/lib/push/webpush.ts`).

| Part | Size (estimate) |
|---|---|
| CBOR reader (RFC 8949): unsigned and negative integers, byte and text strings, arrays, maps, true, false, null; reports bytes used. Refuses tags, floats, indefinite lengths, 8-byte lengths and integers (nothing in WebAuthn needs them), lengths past the end, duplicate map keys, and nesting deeper than 8 | about 80 lines |
| COSE key to JWK (RFC 9052, 9053): OKP Ed25519, EC2 P-256 and RSA, with the checks in registration step 8, then `crypto.subtle.importKey("jwk", ...)` | about 45 lines |
| Authenticator data: rpIdHash, flags, count, and at registration the AAGUID, credential id, key and extensions, with nothing left over | about 40 lines |
| ES256 signature from ASN.1 DER to the raw r and s that WebCrypto expects (WebAuthn: ES256 signatures are DER). Strict: minimal DER only, r and s positive, a leading 0x00 only where the next byte needs it, at most 32 bytes once that is dropped (shorter ones padded), no trailing bytes | about 30 lines |
| `packed` self attestation | about 15 lines |
| The two ceremonies, "Confirm it's you" and their checks | about 130 lines |

About 340 lines plus tests. WebCrypto does the cryptography (Ed25519, ECDSA P-256 with SHA-256, RSASSA-PKCS1-v1_5 with SHA-256); we only
parse and compare. Importing an Ed25519 key as a JWK (`kty: "OKP"`, `crv: "Ed25519"`) works in workerd: build step 2 ran the verifier in
`wrangler dev` (wrangler 4.157, compatibility date 2026-10-01) on the recorded fixtures, and the EdDSA registration and sign-in passed and a
changed signature was refused, so -8 stays in `pubKeyCredParams`.

The library people use is `@simplewebauthn/server` (14.1.0): 870 kB unpacked and ten dependencies (`@peculiar/x509`, five `@peculiar/asn1-*`
packages, `@hexagon/base64`, `@levischuck/tiny-cbor`, `reflect-metadata`). Nearly all of that is for attestation formats and certificate
chains that `attestation: "none"` never uses. Its real strength is that many people have tested it. We get most of that back with:
- the spec's own checks as unit tests, one failing case per check above, and the parsing cases in the build plan (section 9, step 2);
- fixtures recorded from authenticators, committed as test data (they hold only a public key, a challenge and our RP id). Step 2 covers
  Chrome's virtual authenticator (EdDSA, ES256 and RS256 as a platform authenticator, ES256 as a USB key;
  `scripts/record-webauthn-fixtures.mjs`) and a software authenticator made with `node:crypto` for every negative case and for
  `credProtect`, which the virtual one does not return. Real devices (an iPhone, an Android phone, Windows Hello for RS256, and a security
  key for Ed25519 and `credProtect`) are recorded in step 5's manual check, once a real page exists, into the same file;
- the CBOR reader tested against the examples in RFC 8949, Appendix A.

Recommendation: we write it. The risk is a missed check, not broken cryptography, and the tests above are aimed at exactly that.

On the browser, the options and responses are turned to and from base64url by a few lines of our own, rather than
`PublicKeyCredential.parseCreationOptionsFromJSON` and `toJSON()`, which older Safari versions lack (I have not confirmed from which
version Safari has them, so we do not rely on them).

## 3. The emailed code and link

One email carries both. The code is for the device that asked; the link is for whoever opens the mailbox.

> From: Checkwork <noreply@checkwork.ie>
> Subject: Your Checkwork sign-in code
>
> Your code is 482 913
>
> Or open this link to sign in: https://www.dash.checkwork.ie/sign-in/link#t=...
>
> The code and the link work once, for 15 minutes. If you did not ask to sign in, you can ignore this email.
> Only type the code at www.dash.checkwork.ie. Checkwork will never ask you for it.

| | Code | Link |
|---|---|---|
| What it is | 6 digits | 32 random bytes, base64url |
| Its own row | yes (`kind` `code`) | yes (`kind` `link`); every sign-in email writes exactly one, which is what the email caps count |
| Stored | `HMAC-SHA-256(SIGN_IN_SECRET, "code|" + row id + "|" + code)` | `HMAC-SHA-256(SIGN_IN_SECRET, "link|" + token)` |
| Works | Once, 15 minutes, 5 tries, only in the browser that asked (a `__Host-cw_attempt` cookie, HttpOnly, SameSite=Strict, 15 minutes) | Once, 15 minutes, on any device |
| Bound to | the email it was sent to, checked again at use: still at an active dealer | the same |

- **Why HMAC and not a plain hash:** a six-digit code has only a million values, so a plain hash in a leaked database would be undone in a
  second. With a secret key the database alone is not enough. The row id in the input means a code's HMAC cannot be matched against
  another row's.
- **Rotating `SIGN_IN_SECRET`** is free at any time: it only ends codes and links still pending. Sessions do not use it (section 4).
- **Checking a code** (`/sign-in/code`): the attempt is found only through the `__Host-cw_attempt` cookie's row, never by an id or email
  in the form. One statement spends a try before anything is compared: `UPDATE sign_in_attempts SET tries = tries + 1 WHERE browser_hash =
  :h AND kind = 'code' AND used_at IS NULL AND expires_at > :now AND tries < 5 RETURNING id, email, code_hmac`. No row back means the code
  is dead. Then the HMAC of what was typed is compared with `code_hmac` in constant time (`crypto.subtle.timingSafeEqual` in Workers,
  `node:crypto` in tests). A match marks the row used (`UPDATE ... SET used_at = :now WHERE id = :id AND used_at IS NULL RETURNING`), so
  two posts at once cannot both sign in.
- **Single use, and a new code:** a new email to the same address ends that address's earlier code and link. A request that sends
  nothing (over a limit) ends nothing, so the last link the person was sent stays valid.
- **The link and the code are separate rows.** Using one does not end the other. So a mail scanner that runs the page's script and clicks
  "Sign in" spends only the link: the code still works where the person asked for it. (Such a scanner would get a session of its own, which
  it never uses; the person gets the "a device signed in" email, section 1.)
- **Another device:** the link signs in the device that opens it (a phone's Mail opening the link signs in that phone's browser). That is
  the point of the link: the mailbox is the proof. The code works only where it was asked for, so a code read out to someone is useless on
  their own device unless they started the sign-in (see phishing, section 8).

### The link page (`/sign-in/link`)

- **A GET only shows a page.** Its script reads `#t`, clears it at once with `history.replaceState` (so it is not left in the address bar
  or history), keeps the token in memory (so a failed request can be tried again), then posts it to a read-only server action. That
  action changes nothing, counts in `SIGN_IN_LIMITER`, and answers with the email partly masked, or "This link has expired" for a used or
  expired link and for anyone no longer on a team.
- **The page names who it signs in:** "Sign in as ci…a@gmail.com?" (the first two letters and the last of the name, and the whole domain)
  and a "Sign in" button. Only the button's POST uses the token. Only someone holding the link sees this, so showing that much costs
  little, and it lets a person spot an address that is not theirs. This stops a login CSRF, where someone sends a person their own link
  so the person works signed in as them.
- **The fragment never reaches a request.** Browsers never send `#...` to a server, so it is in no request log. A `Referer` never carries
  a fragment either (the Referrer Policy spec strips it), and the page sends `Referrer-Policy: no-referrer` anyway. One trap: a redirect
  carries the fragment over to its new address, so `/sign-in/link` must never redirect. That includes the rule that sends a signed-in
  person on to `next` (section 4): it does not apply here, or `#t` would land on a dashboard page whose CSP allows the beacon. A
  signed-in person sees the same page, and using the link replaces their session.
- **No `#t` on the page** (the fragment was lost, for example through Access's PIN form in `both` mode): the page says "Open the link from
  your email again", not "expired". Opening a link only to look never uses it up, so the same link still works.
- **In `both` mode** (section 7) Access is still in front. Someone opening the link in a browser with no Access session is redirected to
  Cloudflare Access's login page and back, and the fragment travels with both redirects. It is never sent to a server, but it is in the
  address of Access's own page while it is open. We accept that for the weeks of `both`: Access is Cloudflare's, which we already trust
  with sign-in then, and the person spends the token a minute later. Our own team uses codes during the dev trial.
- **No analytics on `/sign-in/*`.** Our CSP allows `static.cloudflareinsights.com`, and the zone's Web Analytics can inject its beacon,
  which reports the page address. `/sign-in/:path*` gets its own `Content-Security-Policy`, built in `next.config.ts` from the same list
  as the main one with the two analytics origins left out, so `frame-ancestors 'none'`, `form-action 'self'` and the rest stay. It must be
  the whole policy: in `headers()`, when two rules set the same key on a path, the last one wins and replaces the first
  (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`, "Header Overriding Behavior"), so the
  sign-in rule comes after the general one. A test pins that `/sign-in/link` sends `frame-ancestors 'none'` and no `cloudflareinsights`.
  These pages load nothing from another site.

### Phones

- **The installed iPhone app:** a link in Mail opens in the phone's default browser (Safari unless the person changed it), never in a home
  screen app, and the app does not share the browser's cookies. So the link would sign in the browser, not the app. The code is the answer:
  the person reads it in Mail and types it in the app. The Code field has `autocomplete="one-time-code"` and `inputmode="numeric"`; iOS 17
  and later can offer codes from Mail above the keyboard, but I have not confirmed that it does inside a home screen app, so the design
  does not depend on it. On an iPhone, the link's page also says: "Using the Checkwork app on your home screen? Type the code from the email
  in the app instead."
- **Android:** an installed app may open links to its own site (depending on the mail app), and shares Chrome's cookies anyway, so either
  works.

### Sending, and answering the same for every email

"Email me a code" does the same work in front of the answer for every email: it checks the IP limit, makes a random attempt id and cookie
value, sets the `__Host-cw_attempt` cookie, and answers. Everything that depends on the email runs after the answer, in `after()`:

1. Look the email up in the directory.
2. On a team, not over its limits and not locked: write the code row and the link row (and the `staff` row if this is their first time),
   and send the email.
3. On a team, not over its limits, but locked or with codes off (section 5): write the link row with the email (so it counts towards the
   3 in 15 minutes and 10 a day like any other email), and send the link-only email. Its first line says why there is no code: "Codes
   are paused for your address after wrong tries. Use this link to sign in." So a lookalike email asking for a code stands out.
4. In every case but 2, also write a code row with no email and no code, so the code page still dies after 5 tries and behaves exactly
   as for a known email. Unknown or over a limit: that row is all, and nothing is sent or ended.

So a known and an unknown email answer in the same time, with the same cookie. `after()` needs the platform's `waitUntil` to finish its
work after the response (Next docs, `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`); OpenNext on Workers
provides it. If the Worker stops before it finishes, no email arrives and the person taps "Send a new code". A code typed in the moment
before the row exists fails as a wrong code (the IP limit caps that moment).

Checking a code also does the same work either way: the row with no code compares the HMAC against a random value. The per-email counts
are updated after the answer (section 5).

Mail goes through the Worker's `EMAIL` binding, from `noreply@checkwork.ie`. See open question 3: production must be able to send to any
staff address.

## 4. Sessions

| | |
|---|---|
| Cookie | `__Host-cw_session`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. Value: 32 random bytes, base64url. `Max-Age` the absolute lifetime |
| Server side | the `sessions` table in the **directory** D1, keyed by the SHA-256 of the cookie value |
| Idle lifetime | 12 hours with no request |
| Absolute lifetime | 7 days from sign-in, whatever the use |
| Recently confirmed | `verified_at`: set at sign-in and by "Confirm it's you"; adding or removing a passkey needs it within 10 minutes |
| Most per person | 20; the oldest ends when a 21st starts |

- **Why the directory, not the dealer's D1:** a session is a person, not a dealer. It starts before a dealer is chosen and covers all the
  person's dealers. The dealer stays a per-request decision from memberships, as now.
- **Why a hash in the table:** someone who reads the table cannot use a row as a cookie. Plain SHA-256 is enough here because the value is
  256 random bits, so `SIGN_IN_SECRET` is not involved.
- **Why `__Host-`:** the browser refuses the cookie unless it is Secure, `Path=/` and has no `Domain` (MDN, Set-Cookie, "Cookie prefixes"). So
  it is never sent to `demo.checkwork.ie`, `www.checkwork.ie` or dev, and none of them can set or overwrite it.
- **Why Lax, not Strict:** a link to the app from an email (the morning digest, a lead email) is a navigation from another site. With
  Strict the cookie would not go with it and the person would see the sign-in page although signed in. Lax sends it on top-level GET
  navigations from any site, which is why no GET may change anything (below).
- **Idle and absolute:** a cookie can only be set in a server action, a route handler or the proxy, never while a page renders (Next docs,
  `cookies`, in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`). So the cookie's own expiry is the absolute
  lifetime, set once at sign-in, and the idle limit is the server's: `last_seen_at` is written at most once every 5 minutes, and a session
  idle for 12 hours is refused and deleted.
- **Rotation:** every sign-in makes a new session id. An id is never accepted unless we issued it at a sign-in, so it cannot be fixed in
  advance. A session already on the device is ended at sign-in.

### Each request, and a dead cookie

- `staffIdentity()` reads the cookie, looks up its hash, checks both lifetimes, and returns the email (once a request, React `cache`, as
  now).
- **The proxy** only checks that the cookie is there; Next's docs say the proxy should make only such optimistic checks and not read a
  database (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Optimistic checks with Proxy"). A page load with no cookie
  goes to `/sign-in?next=<path>`. A POST with no cookie (a server action) gets a 404, never a redirect. The proxy also passes the page's
  path and query to the server in a request header (`x-cw-path`), set with `headers.set` so it overwrites any copy the client sent,
  never appends to it, so layouts can build `next`.
- **`/sign-in`, everything under it, and `/sign-out` are outside the proxy matcher** (`/sign-in` itself too, or a signed-out visit would
  redirect to `/sign-in?next=...` over and over), as `api/` is today, so the 404 above never meets the signed-out sign-in
  actions. They check the mode themselves: in `access` they answer 404, in `both` they verify the Access token as the proxy does, in
  `own` they are open.
- **`next`** is one rule, in one function, used everywhere: it must start with a single `/` (not `//`), contain no `\`, and its path must
  match the app's path regex (letters, digits, `-`, `_`, `/` and `.`); the query is parsed and written out again with `URLSearchParams`;
  anything else becomes `/`. The notification links use the same rule. `safeFrom` (help requests' `from`) shares the path check but keeps
  stripping the query, so a help request never stores a query string such as a lead's id.
- **A cookie that is there but dead** (ended, idle, past 7 days) passes the proxy. Layouts and pages then `redirect('/sign-in?next=...')`
  in place of today's 404.
- **A server action with no live session** answers 404 (`notFound()`, as today), never a redirect: the caller is script, not a person on a
  page.
- **The sign-in page** treats only a live session as signed in, so there is no loop. A dead cookie is left alone: it only ever leads to
  the sign-in page, and the next sign-in overwrites it.

### Sign out

`Clear-Site-Data` is a response header, and a server action cannot set one. So **Sign out** and **Sign out everywhere** are a POST route
handler, `/sign-out` (a form field says which), with its own Origin check. It ends the session or sessions, turns off the notifications,
deletes the cookie, and answers `303` to `/sign-in` with `Clear-Site-Data: "cache"`.

### CSRF

What Next 16.4.5 does (`node_modules/next/dist/server/app-render/action-handler.js`): a server action whose `Origin` host differs from the
request's host is aborted; `Origin: null` is aborted too; a POST with **no** `Origin` is let through with only a warning. Browsers send
`Origin` on every POST, so a missing one means a hand-made request, which needs the cookie already to act as anyone. That leaves the
places where a request without a session can still change something, or where a route handler has no Next check at all. One helper,
`sameOrigin(request)`, requires `Origin` to be present and equal to `APP_URL`'s origin:

- every sign-in action (request a code, check a code, peek and use a link, passkey challenges and verification), and any other action that
  changes state while signed out;
- `/sign-out`;
- every non-GET route handler that reads the session (route handlers get no check from Next).

No GET changes state anywhere: SameSite=Lax sends the cookie with top-level GETs from any site. `serverActions.allowedOrigins` stays unset.

Why this matters here: the other `checkwork.ie` sites are the same *site* as the dashboard, so SameSite=Lax sends the cookie on their
POSTs too. Only the Origin check tells them apart.

## 5. Abuse

| Limit | Where | Value |
|---|---|---|
| Sign-in requests per IP | New `SIGN_IN_LIMITER` rate limit binding (namespace 2005 dev, 1005 production), keyed by an HMAC of the IP | 30 a minute: every sign-in step, and every challenge row written for someone signed out |
| Emails per address | D1: the `link` and `confirm-code` rows with that email (every email we send writes exactly one) | 3 in 15 minutes, 10 a day. Over either, nothing is sent and nothing is ended |
| Tries per code | D1, on the code's row | 5, then the code is dead |
| Wrong codes per email | D1: the `tries` on the email's code rows from the last 24 hours, less one for each that was used, whichever code they were made on | 15, then the email is **locked** for 24 hours (`staff.code_locked_until`) |
| Wrong codes in a row | D1, `staff.code_failures`, back to 0 at any sign-in | 100, then codes are off for that person until they sign in by link or passkey |

What "locked" and "codes off" do:
- No code is accepted for that email, and its live codes end at once (the step that counts the 15th wrong try ends them).
- "Email me a code" still answers as usual (section 3), and sends an email with **only the link**, which says that codes are paused. The
  link cannot be guessed, so it is safe to keep, and the person is not shut out by someone else's guessing. That email is counted
  and capped like any other (3 in 15 minutes, 10 a day), so the lock cannot be used to flood a mailbox.
- At the lock, one warning email: "Someone tried to sign in to Checkwork as you. If it was not you, tell your manager."
- A lock never blocks a passkey. Passkey sign-in needs no email.

The binding's period can only be 10 or 60 seconds, and Cloudflare counts it per location, so it is a brake on bursts, not an exact limit.
Anything longer is counted in D1.

Why 30 a minute, counting every step: a dealership signs in on one Wi-Fi address, and phones on mobile data share addresses (carrier
NAT). A passkey sign-in is 2 or 3 requests (the autofill challenge, the button's challenge, the check), so 10 a minute would stop a
fourth person arriving in the same minute; 30 lets about ten through. Counting only the costly steps would have been the other choice,
but every step writes or reads D1, and one rule is easier to reason about. Guessing is bounded per email in D1, not by this limit.

**The lock is exact.** The 15th wrong try is counted in `after()`, so a few tries already in flight are still compared. So on a matching
code, before a session starts, the check reads `code_locked_until` and `code_failures` and counts the email's wrong tries in the last 24
hours from the rows; if any of them says locked or off, the match is refused as a wrong code. A correct guess after the 15th wrong one
never signs in.

**Spending someone's emails.** Anyone can use up a person's 10 emails a day by asking for codes for their address. That denies them email
sign-in for the rest of the day, except the last link they were sent, which an over-limit request does not end, and only for that link's
15 minutes: after that they have no working email sign-in until the next day. Their passkey still works. Open question 2 is the lasting answer.

**Guessing a code.** The 6-digit code has a million values.
- Per day: at most 15 wrong tries per email, whichever code they were made on, so about 1 in 67,000 a day.
- NIST SP 800-63B-4 §3.2.2 ("Rate Limiting (Throttling)") limits consecutive failed attempts using a specific authenticator to no more
  than 100. Ours stop at 100 in a row: against someone who never signs in, an attacker gets 100 guesses in all, 1 in 10,000.
- Against someone who signs in every day (which resets the run, as NIST's rule allows), the daily cap is the bound: a year of trying every
  day is at most 5,475 guesses, about 1 in 183. Every guess needs a code emailed to the real person, who gets a warning email each day it
  locks. That is the honest worst case. Requiring passkeys (open question 2) removes it for whoever it covers.
- NIST does not accept email as an authenticator: SP 800-63B-4 §3.1.3.1 says "Email SHALL NOT be used for out-of-band
  authentication". Our emailed code and link are account recovery by mailbox, and we take NIST's throttling number for them, not its
  blessing.
- The link cannot be guessed (256 bits).

**Never saying whether an email exists:** the same page, the same words ("If that email is on a team, we have sent a code to it"), the
same cookie and the same timing for a known email, an unknown one, a locked one and one over its limit. All the per-email database work
and the email run after the answer (section 3). A code typed for an unknown email fails as a wrong code does, after the same 5 tries.

**Logs:** one function, `logSignIn({ step, outcome })`, builds the line from fixed words by name, as `logSite` does in `src/lib/log.ts`:
`{"signIn":"code","outcome":"wrong-code"}`. Never an email, IP, code, token, cookie, credential id or user agent. Steps: `passkey`,
`register`, `confirm`, `email`, `code`, `link`, `session`, `sign-out`. Outcomes are fixed codes (`ok`, `wrong-code`, `expired`, `used`,
`rate`, `locked`, `bad-origin`, `bad-signature`, `bad-data`, `counter`, `unknown-credential`, `no-dealer`). Errors from D1 are rethrown
without their values (the `quiet` rule in `src/lib/tenancy/directory.ts`).

**Activity log:** the activity log is per dealer and records changes, so it gets the changes: "Added a passkey (iPhone)", "Removed a
passkey", "Signed out everywhere", and an owner's "Signed Conor Byrne out on all devices", written to each dealer the person is at. A plain
sign-in is not a change and is not written there; the person sees their own signed-in devices in Settings, Your sign-in, and gets an email
for every sign-in by email (section 1).

## 6. Data

### New tables, all in the directory (`drizzle-directory/`, additive)

| Table | Columns | Notes |
|---|---|---|
| `staff` | `id` (the user handle, 32 random bytes base64url, primary key), `email` (unique, lower case), `code_failures`, `code_locked_until`, `created_at` | One row per person, made the first time they ask for a code or sign in. `members` stays keyed by email |
| `passkeys` | `id` (credential id, base64url, primary key), `staff_id`, `public_key` (COSE bytes), `alg`, `sign_count`, `backup_eligible`, `backed_up`, `transports`, `label`, `created_at`, `last_used_at` | Index on `staff_id`. At most 10 per person |
| `sessions` | `id_hash` (hex SHA-256 of the cookie value, primary key), `staff_id`, `method` (`passkey` or `email`), `label` (device kind), `created_at`, `last_seen_at`, `verified_at`, `expires_at` | Index on `staff_id` |
| `sign_in_attempts` | `id`, `kind` (`passkey-sign-in`, `passkey-register`, `passkey-confirm`, `code`, `confirm-code`, `link`), `email` (code, link and confirm-code rows for a known email only; the link-only email writes its link row with the email too), `staff_id` (registration and confirmation), `challenge` (passkeys), `code_hmac`, `token_hmac` (unique), `browser_hash` (the attempt cookie's hash), `tries`, `created_at`, `expires_at`, `used_at` | A code row is written for every request, with no email and no code when the email is unknown, over a limit or locked; the counts in section 5 come from the rows that have an email. Indexes on `created_at`, `browser_hash`, (`email`, `created_at`) and `staff_id` |

No IP addresses and no user agents are stored: only the device kind ("iPhone").

With no D1 (`next dev`, the E2E run, unit tests) the same live in the in-memory directory, as members and site keys do now.

### Retention (the nightly job in `worker.mjs`)

| What | Deleted |
|---|---|
| `sign_in_attempts` | 24 hours after they were made (the daily counts need a day; the lock lives on `staff`) |
| `sessions` | when they end (sign-out, sign out everywhere, removal), and nightly once past either lifetime |
| `passkeys`, `staff` | when the person is at no dealer any more (at removal), and nightly for any `staff` row with no membership |

The nightly job gains one directory step, `purge-sign-in`, which logs counts only, as the other purges do. It deletes at most 20 chunks of
5,000 rows per table a night (`PURGE_LIMITS` in `src/lib/auth/purge.ts`), so a flood of requests can't stop it; the rest goes the next
night.

### A data request from a staff member

Staff are not in the dealers' Data requests screen today (customers are), and this keeps that. A staff member who asks what we hold gets,
from a script we run on the directory: their `staff` row, their passkeys (device label and dates; the public key too if they ask, it is
not secret), their sessions (device kind and dates) and any pending sign-in attempts. Erasure is removal from every team, which deletes all
of it. The activity log entries that name them as the person who made a change are the dealer's records and follow the dealer's 12-month
retention.

### GDPR notes

- Kept to the minimum: an email (already in `members`), a random id, public keys, dates, two counters and a device kind. No IPs, no user
  agents, no passwords, nothing biometric (user verification happens on the device; WebAuthn sends us only a flag).
- The purpose is security of the service, and the retention above is short.
- Checkwork keeps staff sign-in records as each dealer's processor (owner, 2026-11-22; section 11, question 4).

## 7. Moving off Access

A new var, `SIGN_IN`, per environment in `wrangler.jsonc`:

| Value | Who is let in |
|---|---|
| `access` | As today: the Access token only. Also what an unset or unknown value means, so a typo or a missing var fails closed, and merging the code changes nothing |
| `both` | Access stays in front at Cloudflare and its token is still required. Our sign-in pages work behind it. The person is always the Access token's email; where our session cookie is there too, its email must equal the Access email, or the request is refused |
| `own` | Our session only. Access's token is not checked |

`NEXT_PUBLIC_ADMIN_OPEN` and `next dev` keep their open shortcut, unchanged and still refused wherever the directory is bound.

### Every order fails closed

Two things change at each step: the var (a deploy) and the Access policy (the owner, in Cloudflare). Whichever goes first, nobody gets in
who should not:

| Moving | Right order | If the other goes first |
|---|---|---|
| `access` to `both` | Only the var changes | Nothing to order |
| `both` to `own` | The var first, then Bypass, Everyone | Bypass first: `both` still wants an Access token, which Access stops sending, so everyone is refused until the var changes |
| `own` back to `both` or `access` | Remove Bypass first, then the var | The var first: it wants an Access token that is not coming, so everyone is refused until Bypass goes |

Between the two halves of the right order the app is stricter, never looser: with `own` and Access still enforcing, a person needs both.
`both` is safe only while the identity is always the Access email and a cookie for a different email is refused; step 3's tests pin both.

### Dev first

1. Merge the build plan's steps 1 to 6 (each changes nothing while `SIGN_IN` is `access`).
2. Owner: `npx wrangler secret put SIGN_IN_SECRET` (dev), a random 32-byte value. Set up `noreply@checkwork.ie` as a sending address
   (open question 3). Dev's `EMAIL` binding can only send to `contact@checkwork.ie` today: add our own team's addresses to its
   `allowed_destination_addresses`. If the zone's Web Analytics is on, also exclude `/sign-in/*` there (the CSP already blocks it).
3. PR: dev's `SIGN_IN` to `both`. Deploy. Each of us signs in through Access, then through our sign-in (email code, then add a passkey) on
   a laptop, an iPhone (the browser and the home screen app) and an Android phone.
4. PR: dev's `SIGN_IN` to `own`. Deploy. Then the owner: on dev's Access application, add a policy **Bypass, Everyone** at the top (Access
   then stops checking, and the application and its other policies stay for rollback). Do the same on dev's two Bypass applications for
   `/api/owner/*` and `/api/site/*` (nothing changes for them).
5. Run for a week: sign in and out on each device, a lost phone drill (sign out everywhere from a laptop), a removal from a team, the
   lockout, and a push notification tap while signed out (it must reach sign-in and then the lead).

### Then production

6. Owner: `SIGN_IN_SECRET` for production.
7. PR: production's `SIGN_IN` to `both`. Every real person signs in once through our sign-in and adds a passkey while Access still guards
   the app. We check in the directory that each has one.
8. PR: production's `SIGN_IN` to `own`. Deploy, then the owner adds Bypass, Everyone on production's Access application.
9. Two weeks later, if nothing went wrong: the owner deletes the Access applications (dev and production, and the four Bypass ones), and a
   last PR removes `src/lib/access.ts`, the `CF_ACCESS_*` vars, the `access` and `both` modes, and the Access sections of
   `docs/dealer-admin.md` and `docs/new-dealer.md` (step 5 there becomes "they get an invitation email"). From then on an unset or
   unknown `SIGN_IN` has no Access to fall back to, so that PR makes it refuse everyone instead.

### Rollback

- From `own`: the owner removes the Bypass, Everyone policy first, then `SIGN_IN` goes back to `both` or `access` (a one-line PR, or a
  manual Deploy of the previous commit from the Actions tab). Access is back in front within a minute. The new tables stay; they hurt
  nothing.
- From `both`: set it to `access`.
- After step 9 rollback means building Access again from `docs/dealer-admin.md` in git history; that is why step 9 waits two weeks.

### What the owner does in Cloudflare

| When | What |
|---|---|
| Step 2 and 6 | `SIGN_IN_SECRET` per environment |
| Step 2 | The sending address `noreply@checkwork.ie`, dev's allowed addresses, and Web Analytics off for `/sign-in/*` if it is on |
| Step 4 and 8 | Bypass, Everyone on the Access application (dev, then production), after the deploy |
| Step 9 | Delete the Access applications |

The rate limit namespaces are config in `wrangler.jsonc`, in a PR, not a dashboard step.

## 8. Threats and answers

| Threat | Answer | What is left |
|---|---|---|
| Phishing (a fake sign-in page) | A passkey only signs for our real origin; the browser puts the origin in what it signs and we check it. A fake site gets nothing it can use | The emailed code can be relayed in real time by a fake site that started its own sign-in. That session is confirmed at sign-in, so it can add a passkey within 10 minutes; the "A passkey was added" email and the passkey review after "Sign out everywhere" are what catch it. The email says where to type the code, and every sign-in by email is emailed to the person. Open question 2 can close this for people with a passkey |
| Stolen session cookie | HttpOnly (no script reads it), Secure, `__Host-`, 12 hours idle and 7 days at most, ended by sign out everywhere or by removal from the team | Someone with the cookie is the person until one of those happens. No binding to the device (a user agent is easy to copy, so it would add little) |
| Stolen phone | The passkey needs the phone's Face ID or passcode. Sign out everywhere (or "Sign out on all devices" from an owner or manager) ends its session and its notifications | An unlocked phone with the app open is signed in until then. Email on the phone can get a code |
| A passkey added by someone else | Adding one needs a confirmation within 10 minutes, scoped to the session's own person, and emails the person. Sign out everywhere points them at their passkey list | A passkey survives sign out everywhere until the person removes it |
| Email account takeover | Codes and links need the mailbox; the lockout email, the sign-in emails and the activity log entries show changes | Whoever holds the mailbox can sign in by email. Open question 2 |
| An insider at dealer A reaching dealer B | Sign-in says only who someone is. Which dealer is the directory's, checked on every request and action (`dealerAccess`, `requireStaff`); a cookie, form or header naming dealer B opens nothing. Unchanged by this work, and `e2e/dealers.spec.ts` keeps proving it | Dealer A's owner can sign one of their people out, which also signs that person out at dealer B (sessions are per person). They sign in again; it is written in both dealers' activity |
| Brute force | Codes: 5 tries each, 15 wrong in a day per email whichever code, 100 in a row, 3 emails in 15 minutes and 10 a day, per-IP limits. Links: 256 bits. Passkeys: nothing to guess | About 1 in 183 over a year of daily attempts on one person who signs in daily (section 5). Rate limit bindings count per location, so a spread-out attack gets a little more; the D1 counts are exact |
| Spending a person's emails | 10 a day per address; an over-limit request ends nothing, so their last link stays valid | Someone can use up a person's 10 emails a day; their passkey still works. Open question 2 |
| Telling known emails from unknown | Every per-email step runs after the answer; the same cookie, page and tries for all | None known. The step 4 tests compare known and unknown |
| Replay | Challenges, codes and links are single use, marked used in the same statement that checks them, and expire (5 and 15 minutes). The passkey's signature covers our challenge and origin. The counter catches a cloned hardware key | Synced passkeys send no counter, so cloning one is not detectable; that is the platform's (Apple's, Google's) to protect |
| CSRF and login CSRF | Server actions: Next's Origin check, plus our own where Next lets a missing Origin through (section 4). No GET changes state. The link page names the email it signs in | None known |
| The link token leaking | In the fragment, never sent; cleared from the address bar at once; no analytics beacon, no third-party loads, no referrer, no redirect on that page | A mail scanner that runs script can spend the link (not the code) |
| The service worker caching a signed-in page | `public/sw.js` caches only the offline screen and the icon; page loads always go to the network. That rule stays, and a unit test pins the worker's cache list. Signed-in pages are dynamic, which Next sends with `no-store` (step 3 adds a test that pins it). Sign out sends `Clear-Site-Data: "cache"` | `"storage"` is not sent: it would also remove the service worker and with it the device's notifications |
| An XSS in the app | HttpOnly keeps the cookie from script. React escapes output. The CSP allows scripts from our own origin only (`next.config.ts`). Adding a passkey needs a recent confirmation and the device's own prompt, so script cannot add one quietly | The CSP allows `'unsafe-inline'` scripts (no nonce, for static pages), so an injected inline script would run and could act as the person while the page is open. Removing `'unsafe-inline'` is separate work |
| A subdomain cookie leak (`demo.checkwork.ie`, `www.checkwork.ie`, dev) | `__Host-` cookies have no `Domain`, so they go to their own host only and no other host can set one. Origin checks stop a POST from another `checkwork.ie` host even though browsers count it as the same site. Separate RP ids and origins per environment | The dealer choice cookie (`checkwork-dealer`) is not `__Host-`; a sibling host could set it, but it is only a preference checked against memberships. It moves to `__Host-` in step 3 anyway |

## 9. Build plan

Each step is one PR, ready for review, with the house checks (`docs`-only steps excepted). Steps 1 to 6 change nothing on a deploy while
`SIGN_IN` is `access`.

| # | PR | Tests |
|---|---|---|
| 1 | **Tables.** The four directory tables and their migration; the in-memory copies; `purge-sign-in` in the nightly job | Integration test on SQLite with the real migrations (`*.int.test.ts`); purge deletes only what is due; `bash scripts/check-migrations.sh main` |
| 2 | **The WebAuthn verifier.** `src/lib/auth/cbor.ts` and `webauthn.ts`: CBOR, COSE to JWK, DER to raw, `packed` self attestation, both ceremonies and the confirmation | RFC 8949 Appendix A vectors. CBOR: a length past the end, 8-byte lengths, duplicate map keys, nesting past the limit, tags and floats refused. ES256 DER: r or s of 31 bytes, and of 33 with a leading 0x00, both accepted; non-minimal DER and trailing bytes refused. Authenticator data: ED with extensions after the key accepted, ED set with nothing after it refused, extra bytes with ED clear refused. `packed` self attestation accepted, with a wrong `alg` or a bad signature refused, with `x5c` refused. Keys: `kty` not matching `alg`, a short EC coordinate, a 1024-bit RSA key. A missing user handle in a sign-in, and a confirmation with another person's passkey. The counter: written only where `sign_count < new`, and two sign-ins with the same count, one refused. One failing test per check in section 2; fixtures recorded from Chrome's virtual authenticator; a test authenticator made with `node:crypto` for the negative cases and `credProtect`; once in `wrangler dev`, an Ed25519 JWK import and verify in workerd |
| 3 | **Sessions and the switch.** `src/lib/auth/session.ts`; `SIGN_IN` modes in `staffIdentity()` and `src/proxy.ts`; `sameOrigin`; the `/sign-out` route; the redirect to sign-in with `next`; the dealer cookie to `__Host-` | Each mode against each of: no cookie, a good one, an idle one, an expired one, an ended one, a mismatched Access email in `both`; an unset and an unknown `SIGN_IN` act as `access`; the open shortcut still refused with a directory bound; the cookie's attributes; a dead cookie redirects a page and 404s an action; `next` refuses `//`, `\`, another site and a client-sent `x-cw-path`; `/sign-out` refuses a missing and a foreign Origin and sends `Clear-Site-Data` |
| 4 | **Email code and link.** The request, code and link screens; the stricter CSP on `/sign-in/*`; HMACs; the limits and lockout; the emails; the attempt cookie; an outbox in memory for the E2E run (only with `E2E_FAKE_BACKENDS=1` and no directory bound, like the in-memory directory) | Same answer, cookie and work in front of the answer for known, unknown, locked and limited emails; 5 tries on an unknown email's page; tries spent before comparing, under two posts at once; a code HMAC from one row refused on another; expiry; the caps; 15 wrong across three codes locks; 100 in a row turns codes off and a sign-in resets it; a locked email still gets a working link, counted in the caps, and nothing past them; an over-limit request ends no earlier link; a matching code after the 15th wrong try is refused; the link does not spend the code; `/sign-in/link` sends `frame-ancestors 'none'` and no `cloudflareinsights`, and never redirects, signed in or not; the link page clears the fragment and shows the masked email; sign-in actions refuse a missing Origin; the log lines hold no email (a test watches `console`) |
| 5 | **Passkeys in the app.** "Sign in with a passkey" with autofill (renewal and abort); "Sign in faster next time"; Settings, Your sign-in (passkeys, devices, sign out everywhere, the passkey review prompt); "Confirm it's you"; the signal calls; the email when a passkey is added | E2E with Playwright's CDP virtual authenticator (`WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator` with `protocol: "ctap2"`, `transport: "internal"`, `hasResidentKey`, `hasUserVerification`, `isUserVerified`, `automaticPresenceSimulation`): add a passkey after an email sign-in, sign out, sign in with it, remove it; adding one after 10 minutes asks for confirmation. A manual check on a real iPhone (the browser and the home screen app) and Android phone, which also records fixtures for `src/lib/auth/webauthn-fixtures.json` from an iPhone, an Android phone, Windows Hello (RS256) and a security key (Ed25519 and `credProtect`) |
| 6 | **The team.** The invitation email; removal ends sessions (and passkeys when at no dealer), only for `role === null` and only after `details()` succeeds; "Sign out on all devices" with the owner and manager rule; sign out everywhere turns notifications off; activity entries | `src/lib/admin/team.test.ts` grows: a role change ends no session; a removal whose `details()` throws keeps sessions, passkeys and the staff row; a manager cannot sign out an owner. E2E: someone removed is signed out at their next click |
| 7 | **Dev cut-over** (section 7, steps 2 to 5): `SIGN_IN` to `both`, then `own` | The E2E suite and the week of checks |
| 8 | **Production cut-over** (steps 6 to 8) | The same, on production, by us |
| 9 | **Access removed** (step 9): code, vars and docs | The whole suite with `access.ts` gone |

The E2E run today is open (`NEXT_PUBLIC_ADMIN_OPEN=1`, the one person `DEV_EMAIL`). Sign-in tests need a server that is closed: a third
`webServer` of the same build in `playwright.config.ts`, on the next free port, with a server-only `E2E_SIGN_IN=1` that turns the open
shortcut off. That switch can only close the app, never open it. The virtual authenticator is Chromium only, which is what the suite runs
(`devices["Pixel 7"]`).

## 10. Recovery and support

| Situation | What happens |
|---|---|
| Every passkey lost | The person signs in by emailed code (or link) and adds a new passkey. Nothing for us to do |
| A person loses their mailbox | Their owner or manager changes their email in Settings, Team: remove and add again with the new address. Their passkeys go with the old person if they are at no other dealer |
| A dealer's only owner loses their mailbox | Nobody at the dealer can fix it, so we do: we confirm who they are out of band (a call to the dealer's known phone number, and someone else at the dealer who knows them), then add the new address as an owner with a script, and remove the old one. This is the one place a social engineering attack would aim: someone posing as the owner to get an account. So it is never done on an email or a call that came in alone, and the old address is told by email |
| We need to look at a dealer's account to help | We add ourselves as an explicit member of that dealer, with a role, through the same script, and remove ourselves when done. Both show in the dealer's Activity. There is no feature to act as another person, and none is planned |
| Anything we change by script | The script writes an Activity line at that dealer, naming us ("Checkwork support added Conor Byrne as Owner"), like the app's own changes |

If the directory database or `SIGN_IN_SECRET` leaks, a script ends every session (deletes every `sessions` row) and the owner rotates
`SIGN_IN_SECRET`, which ends every pending code and link. Everyone then signs in again; passkeys stay, since a public key is not a secret.
We tell the dealers what leaked and when.

The scripts go through `target()` in `scripts/dealers.mjs`, dev by default, production only with `--env production`.

## 11. Open questions for the owner

Answered by the owner on 2026-11-22: questions 1, 2, 4 and 5 approved as recommended, and question 3's sending address is
`noreply@checkwork.ie`. Question 3's check of production's binding is still open.

1. **How long a session lasts.** Answered (owner, 2026-11-22): as recommended. Recommended: 12 hours idle, 7 days at most. On the phone app
   that means Face ID about once a working day, one tap. This is longer than NIST SP 800-63B-4's guidance for AAL2 (1 hour idle and 24 hours
   overall, both SHOULD, not SHALL). Why it is acceptable here: the app is a dealer's working tool, open all day on a phone that has its own
   lock; a 1 hour idle limit would mean Face ID many times a day and people leaving the app open to avoid it. The things that matter most
   are guarded more tightly: adding or removing a passkey needs a confirmation within 10 minutes, every request checks the membership again,
   and a lost phone is ended from any other device. Longer (say 30 days) is friendlier and weaker on a lost phone; shorter is closer to
   NIST.
2. **Email sign-in once someone has a passkey.** Answered (owner, 2026-11-22): as recommended, email sign-in for everyone. Recommended for
   now: keep it for everyone, so a lost phone never locks anyone out (every sign-in by email is already emailed to the person). Later, once
   everyone has a passkey on two devices, we can require passkeys for owners and managers, which closes code relaying, mailbox takeover and
   the residual guessing odds in section 5 for them.
3. **Sending sign-in email to any address.** Production must email any staff member. I have not confirmed that our `EMAIL` binding on
   production can send to addresses that are not verified in Email Routing (dev's cannot, by design). Lead emails to dealers suggest it can,
   but this must be checked on dev with an unverified address before step 4 ships. If it cannot, the choice is Cloudflare's email sending
   service (if it is available to the account) or an email API called with `fetch` (a service, not a library). Recommended: Cloudflare's, so
   nothing new is added. The sending address is `noreply@checkwork.ie` (owner, 2026-11-22). Whether production's binding can send to any
   address is still open.
4. **Who controls staff sign-in data.** Answered (owner, 2026-11-22): as recommended, Checkwork as the dealer's processor. Recommended: say
   in the agreement with each dealer that Checkwork keeps staff sign-in records (section 6) as the dealer's processor, for security only,
   with the retention above. This wants your solicitor's or the DPA's wording, not ours.
5. **The only-owner recovery in section 10.** Answered (owner, 2026-11-22): the call and the second person are enough. Is a call to the
   dealer's known number plus a second person at the dealer enough proof for you, or do you want something stronger (a signed letter, a
   visit) before we add an owner by script?
