# Our own sign-in (#10)

Design and security review, for the owner to approve before any code. It replaces Cloudflare Access with sign-in of our own: passkeys
first, an emailed code and link as the fallback, invite only. Status: proposed, pending the owner's approval (`docs/decisions.md`).

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
4. The email has the code and a link (see section 3). They type the code, or tap the link and then "Sign in" on the page it opens.
5. Signed in, they land where they were going (the link they first opened, or the overview), with one dealer open, or the chooser if they
   are at several.
6. Straight after a sign-in by email, the page **Sign in faster next time** (`/sign-in/passkey`) asks once: "Use Face ID, your
   fingerprint or your screen lock instead of an email." Buttons "Add a passkey" and "Not now".

### Adding a passkey

"Add a passkey" opens the phone's or computer's own passkey prompt (Face ID, a fingerprint, Windows Hello, the screen lock). Once done:
"Passkey added. Next time, tap Sign in with a passkey." It can also be added later in **Settings, Your sign-in**, which lists:

| Part | What it shows |
|---|---|
| Passkeys | Each one's device ("iPhone", "Mac", "Android phone", "Windows"), "Added 3 Nov, last used today", and Remove |
| Signed in on | Each signed-in device, its kind and when it signed in, "This device" on the current one |
| Buttons | "Add a passkey", "Sign out", "Sign out everywhere" |

Adding or removing a passkey needs a sign-in within the last 10 minutes; otherwise the page first asks "Confirm it's you" (a passkey or
an emailed code). So a session left open on a desk cannot quietly add a passkey for someone else.

From then on, "Sign in with a passkey" is one tap and Face ID: no email typed. On a browser that offers it, the Email field also offers the
passkey as an autofill suggestion.

### A new phone, and the installed app

- **Passkeys from iCloud Keychain or Google Password Manager** are synced: on a new iPhone or Android phone signed in to the same Apple or
  Google account, "Sign in with a passkey" just works.
- **Otherwise** they sign in once by email code on the new phone and add a passkey there, or use the phone that has the passkey: on a
  laptop, the browser's passkey prompt offers "use a phone" with a QR code (the standard cross-device sign-in).
- **The installed app on an iPhone** keeps its cookies apart from Safari's, so it signs in on its own, once. A passkey works there as in
  Safari, because passkeys live in the phone's keychain, not in the browser. The emailed code is the fallback that works inside the app:
  a link in Mail opens in Safari, never in the installed app (section 3). Not yet tested on a real device: step 5 of the build plan does.
- **The installed app on Android** shares its sign-in with Chrome on the same phone, so signing in in either signs in both.

### A lost or stolen phone

1. They sign in anywhere else (a laptop, by email code or another passkey), open Settings, Your sign-in, tap "Sign out everywhere" and
   remove the lost phone's passkey if it is not a synced one.
2. If they cannot sign in at all, their owner or manager taps "Sign out on all devices" next to their name in Settings, Team.
3. A synced passkey on the lost phone still needs that phone's Face ID or passcode to be used, so the phone's lock protects it. Their email
   on the phone is the weaker part: anyone who can read it can get a code. Settings tells them so in one line on this screen.

"Sign out everywhere" also turns off notifications on every device they had, so a lost phone stops showing leads on its lock screen.

### Sign out, and sign out everywhere

- **Sign out** (the menu, and Settings, Your sign-in) ends this device's session, turns off this device's notifications and opens the
  sign-in page.
- **Sign out everywhere** asks first ("Sign out on every device, this one too?"), then ends every session of theirs, turns off
  notifications on all their devices and opens the sign-in page. Passkeys stay.

### Removed from the team

Removing someone in Settings, Team (as today, `changeTeamMember`) also ends every session they have, at once, whatever dealer they were
at. If they are still at another dealer they sign in again and reach only that one. If they are at no dealer any more, their passkeys,
sessions and pending codes are deleted with them; signing in then gives the same "If that email is on a team" answer as for a stranger.
Their devices' notifications already go when they leave (today's rule).

## 2. Passkeys (WebAuthn)

References: W3C Web Authentication Level 3 (cited below by section title), MDN "Web Authentication API".

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
(WebAuthn, "Relying Party Identifier"), so `dev.dash.checkwork.ie` could also ask for production's RP id. That gains nothing: the browser
signs the real origin into `clientDataJSON` and production accepts only its own origin. Rule that follows: nothing else is ever hosted under
`dash.checkwork.ie`.

The RP id and origin come from the environment's vars in `wrangler.jsonc` (`APP_URL` exists; `RP_ID` is new), never from a request.

### Registration (adding a passkey)

Options the server sends (`navigator.credentials.create`):

| Option | Value | Why |
|---|---|---|
| `rp` | `{ id: RP_ID, name: "Checkwork" }` | |
| `user.id` | the person's user handle: 32 random bytes, the same for all their passkeys | Never the email: WebAuthn says the user handle must not hold personal data ("User Handle Contents"). One per person, because an authenticator replaces a passkey with the same RP id and user handle. |
| `user.name`, `user.displayName` | their email | Shown only in their own passkey manager |
| `challenge` | 32 random bytes, single use, 5 minutes | |
| `pubKeyCredParams` | ES256 (-7), then RS256 (-257) | ES256 covers Apple, Google and security keys; Windows Hello has used RS256, so we accept it |
| `authenticatorSelection` | `residentKey: "required"`, `requireResidentKey: true`, `userVerification: "required"` | A discoverable passkey, so sign-in needs no email typed; user verification so a passkey is something you have and are |
| `attestation` | `"none"` | We do not need to know the make of the authenticator, and attestation brings certificate chains we would have to check |
| `excludeCredentials` | their existing passkeys | The same device is not added twice |
| `timeout` | 300000 ms | |

### Authentication (signing in)

Options (`navigator.credentials.get`): a fresh challenge (32 bytes, single use, 5 minutes), `rpId`, `userVerification: "required"`,
`allowCredentials` empty (discoverable passkeys: the person picks theirs). The sign-in page also starts a request with
`mediation: "conditional"` so the Email field (`autocomplete="username webauthn"`) offers passkeys as autofill where the browser supports it.

The challenge is kept server side (section 6, `sign_in_attempts`), not in a cookie, so it can be used once only.

### What the server checks

Registration (WebAuthn, "Registering a New Credential"), every one or it fails:

1. `clientDataJSON` parses; `type` is `webauthn.create`.
2. `challenge` equals an unused, unexpired challenge we issued for this person's registration, which is then marked used in the same
   statement (`UPDATE ... WHERE used_at IS NULL ... RETURNING`).
3. `origin` equals this environment's origin exactly. `crossOrigin` is absent or false; `topOrigin` is absent.
4. `attestationObject` decodes (CBOR); `fmt` is `none` with an empty `attStmt` (other formats are refused, which "none" requested).
5. `authenticatorData`: `rpIdHash` equals SHA-256 of our RP id.
6. Flags: UP (bit 0) set, UV (bit 2) set, AT (bit 6) set. If BE (bit 3) is clear, BS (bit 4) must be clear too.
7. The credential id is at most 1023 bytes and not registered to anyone yet.
8. The COSE public key's `alg` is ES256 or RS256 and is one we offered; for ES256 the curve is P-256 (`crv` 1).

Sign-in (WebAuthn, "Verifying an Authentication Assertion"):

1. The credential id is one we hold; it belongs to a person who is at an active dealer. If the response has a `userHandle`, it equals that
   person's user handle.
2. `clientDataJSON`: `type` is `webauthn.get`; `challenge` is an unused, unexpired one we issued for sign-in, marked used in the same
   statement; `origin` exact; `crossOrigin` absent or false.
3. `authenticatorData`: `rpIdHash` matches; UP and UV set; BE equals what was stored at registration (it never changes for a credential,
   "Credential Backup State"); if BE is clear, BS is clear.
4. The signature verifies with the stored public key over `authenticatorData` followed by SHA-256 of the raw `clientDataJSON` bytes.
5. Counter ("Signature Counter Considerations"): if the stored count or the new one is not zero, the new one must be greater. Synced passkeys
   (Apple, Google) always send 0, which passes. A count that goes back is refused (a possible cloned authenticator), logged by its code
   only, and the person is told to sign in by email.
6. Then the stored count, BS and last used are updated, and a session starts (section 4).

### Stored per passkey

Credential id, the person's id, the COSE public key (bytes) and its `alg`, the sign count, BE and BS, the transports the browser reported (to
help the browser's prompt), a label from the device kind (the same `deviceLabel` the notifications panel uses: "iPhone", "Mac"), created and
last used. Never the attestation, and nothing biometric: Face ID and fingerprints never leave the device.

### Our own code, not a library

It can be done with WebCrypto (in Workers) and a small reader in our code, as Web Push already is (`src/lib/push/webpush.ts`).

| Part | Size (estimate) |
|---|---|
| CBOR reader (RFC 8949): unsigned and negative integers, byte and text strings, arrays, maps, true, false, null. Refuses anything else, indefinite lengths and trailing bytes | about 60 lines |
| COSE key to JWK (RFC 9052, 9053): EC2 P-256 (`x` -2, `y` -3) and RSA (`n` -1, `e` -2), then `crypto.subtle.importKey("jwk", ...)` | about 30 lines |
| Authenticator data: rpIdHash, flags, count, and on registration the AAGUID, credential id and the key | about 30 lines |
| ES256 signature from ASN.1 DER to the raw r and s that WebCrypto expects (WebAuthn: ES256 assertion signatures are DER) | about 20 lines |
| The two ceremonies and their checks above | about 120 lines |

About 260 lines plus tests. WebCrypto does the cryptography (ECDSA P-256 with SHA-256, RSASSA-PKCS1-v1_5 with SHA-256); we only parse
and compare.

The library people use is `@simplewebauthn/server` (14.1.0): 870 kB unpacked and ten dependencies (`@peculiar/x509`, five `@peculiar/asn1-*`
packages, `@hexagon/base64`, `@levischuck/tiny-cbor`, `reflect-metadata`). Nearly all of that is for attestation formats and certificate
chains that `attestation: "none"` never uses. Its real strength is that many people have tested it. We get most of that back with:
- the spec's own checks as unit tests, one failing case per check above;
- fixtures recorded from real authenticators (Chrome's virtual authenticator, an iPhone, an Android phone, and Windows Hello for RS256),
  committed as test data (they hold only a public key, a challenge and our RP id);
- the CBOR reader tested against the examples in RFC 8949, Appendix A.

Recommendation: we write it. The risk is a missed check, not broken cryptography, and the tests above are aimed at exactly that.

On the browser, the options and responses are turned to and from base64url by a few lines of our own, rather than
`PublicKeyCredential.parseCreationOptionsFromJSON` and `toJSON()`, which older Safari versions lack (I have not confirmed from which
version Safari has them, so we do not rely on them).

## 3. The emailed code and link

One email carries both. The code is for the device that asked; the link is for whoever opens the mailbox.

> From: Checkwork <sign-in@checkwork.ie>
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
| Stored | HMAC-SHA-256 with a Worker secret (`SIGN_IN_SECRET`) | the same |
| Works | Once, 15 minutes, 5 tries, only in the browser that asked (a `__Host-cw_attempt` cookie, HttpOnly, SameSite=Strict, 15 minutes) | Once, 15 minutes, on any device |
| Bound to | the email it was sent to, checked again at use: still at an active dealer | the same |

- **Why HMAC and not a plain hash:** a six-digit code has only a million values, so a plain hash in a leaked database would be undone in a
  second. With a secret key the database alone is not enough.
- **Single use:** the row is marked used in the same statement that checks it (`UPDATE ... WHERE used_at IS NULL AND expires_at > now
  RETURNING`). A new code for the same email ends the old ones.
- **Another device:** the link signs in the device that opens it (a phone's Mail opening the link signs in that phone's browser). That is
  the point of the link: the mailbox is the proof. The code works only where it was asked for, so a code read out to someone is useless on
  their own device unless they started the sign-in (see phishing, section 8).
- **Email scanners:** some mail systems open every link to check it. A GET of `/sign-in/link` only shows a page: "Sign in on this
  device?" "You asked to sign in to Checkwork." and a "Sign in" button. Only the button's POST (a server action) uses the token. The token is
  in the link's fragment (`#t=`), which a browser never sends to the server, so it is in no request log either; the page's script reads it
  and posts it.
- **The installed iPhone app:** a link in Mail opens in Safari, never in a home screen app, and the app does not share Safari's cookies.
  So the link would sign in Safari, not the app. The code is the answer: the person reads it in Mail and types it in the app. The Code
  field has `autocomplete="one-time-code"` and `inputmode="numeric"`; iOS 17 and later can offer codes from Mail above the keyboard, but I
  have not confirmed that it does inside a home screen app, so the design does not depend on it. On an iPhone, the link's page in Safari
  also says: "Using the Checkwork app on your home screen? Type the code from the email in the app instead."
- **Android:** an installed app may open links to its own site (depending on the mail app), and shares Chrome's cookies anyway, so either
  works.
- **Sending:** through the Worker's `EMAIL` binding, from `sign-in@checkwork.ie`, sent after the answer (`after()`), so the page answers
  as fast for an unknown email as for a known one. See open question 3: production must be able to send to any staff address.

## 4. Sessions

| | |
|---|---|
| Cookie | `__Host-cw_session`: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`. Value: 32 random bytes, base64url. `Max-Age` the absolute lifetime |
| Server side | the `sessions` table in the **directory** D1, keyed by the SHA-256 of the cookie value |
| Idle lifetime | 12 hours with no request |
| Absolute lifetime | 7 days from sign-in, whatever the use |
| Most per person | 20; the oldest ends when a 21st starts |

- **Why the directory, not the dealer's D1:** a session is a person, not a dealer. It starts before a dealer is chosen and covers all the
  person's dealers. The dealer stays a per-request decision from memberships, as now.
- **Why a hash in the table:** someone who reads the table cannot use a row as a cookie.
- **Why `__Host-`:** the browser refuses the cookie unless it is Secure, `Path=/` and has no `Domain` (MDN, Set-Cookie, "Cookie prefixes"). So
  it is never sent to `demo.checkwork.ie`, `www.checkwork.ie` or dev, and none of them can set or overwrite it.
- **Why Lax, not Strict:** a link to the app from an email (the morning digest, a lead email) is a navigation from another site. With
  Strict the cookie would not go with it and the person would see the sign-in page although signed in. Lax sends it on top-level GET
  navigations only. CSRF is handled below, not by SameSite.
- **Idle and absolute:** a cookie can only be set in a server action, a route handler or the proxy, never while a page renders (Next docs,
  `cookies`, in `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`). So the cookie's own expiry is the absolute
  lifetime, set once at sign-in, and the idle limit is the server's: `last_seen_at` is written at most once every 5 minutes, and a session
  idle for 12 hours is refused and deleted.
- **Rotation:** every sign-in makes a new session id. An id is never accepted unless we issued it at a sign-in, so it cannot be fixed in
  advance. A session already on the device is ended at sign-in.
- **Each request:** `staffIdentity()` reads the cookie, looks up its hash, checks both lifetimes, and returns the email (once a request, React
  `cache`, as now). The proxy only checks that the cookie is there and sends a page load without one to `/sign-in?next=<path>`; Next's docs
  say the proxy should make only such optimistic checks and not read a database
  (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`, "Optimistic checks with Proxy"). `next` is only ever a path on this site
  (the same rule as the notification links and `safeFrom`).
- **Sign out everywhere:** deletes every session of the person. **Removed from a team:** the same, from `changeTeamMember`, before it
  returns.
- **CSRF:** server actions are POST only, and Next compares the `Origin` header with the host and aborts a mismatch
  (`node_modules/next/dist/docs/01-app/02-guides/data-security.md`, "Allowed origins"). That is what protects us from the other
  `checkwork.ie` sites: they are the same *site* as the dashboard, so SameSite=Lax sends the cookie on their POSTs. Every sign-in step is a
  server action, not a route handler, because route handlers get no such check. The sign-in actions run for signed-out people, so they
  also check `Origin` themselves (it must equal `APP_URL`'s origin): I have not confirmed what Next does with a POST that has no `Origin`
  header, and this costs one line. `serverActions.allowedOrigins` stays unset.

## 5. Abuse

| Limit | Where | Value |
|---|---|---|
| Sign-in requests per IP | New `SIGN_IN_LIMITER` rate limit binding (namespace 2005 dev, 1005 production), keyed by an HMAC of the IP | 10 a minute, all sign-in actions together |
| Emails per address | D1, counted from `sign_in_attempts` | 3 in 15 minutes, 10 a day |
| Tries per code | D1, on the code's row | 5, then the code is dead |
| Lockout | D1 | 3 codes run out by wrong tries in a day: no codes for that email for 24 hours, and one email to the person: "Someone tried to sign in to Checkwork as you. If it was not you, tell your manager." |

- The binding's period can only be 10 or 60 seconds, and Cloudflare counts it per location, so it is a brake on bursts, not an exact
  limit. Anything longer is counted in D1.
- **A lockout never blocks a passkey.** Passkey sign-in needs no email, so an attacker who types someone's address over and over can at
  worst stop their emailed codes for a day.
- **Guessing codes:** with the lockout, one email gets at most 15 wrong tries a day (three dead codes of 5 tries), against a million
  values: about 1 in 67,000 a day, or about 1 in 180 for someone who keeps it up every day for a year. Every code needs a fresh email to the real person, who is told after the third. The link cannot be
  guessed (256 bits).
- **Never saying whether an email exists:** the same page, the same words ("If that email is on a team, we have sent a code to it") and
  the same timing for a known email, an unknown one, a locked one and one over its limit. The email is sent after the answer. A code typed
  for an unknown email fails as a wrong code does.
- **Logs:** one function, `logSignIn({ step, outcome })`, builds the line from fixed words by name, as `logSite` does in `src/lib/log.ts`:
  `{"signIn":"code","outcome":"wrong-code"}`. Never an email, IP, code, token, cookie, credential id or user agent. Steps: `passkey`,
  `register`, `email`, `code`, `link`, `session`. Outcomes are fixed codes (`ok`, `wrong-code`, `expired`, `used`, `rate`, `locked`,
  `bad-origin`, `bad-signature`, `counter`, `unknown-credential`, `no-dealer`). Errors from D1 are rethrown without their values (the
  `quiet` rule in `src/lib/tenancy/directory.ts`).
- **Activity log:** the activity log is per dealer and records changes, so it gets the changes: "Added a passkey (iPhone)", "Removed a
  passkey", "Signed out everywhere", and an owner's "Signed Conor Byrne out on all devices", written to each dealer the person is at. A plain
  sign-in is not a change and is not written there; the person sees their own signed-in devices in Settings, Your sign-in.

## 6. Data

### New tables, all in the directory (`drizzle-directory/`, additive)

| Table | Columns | Notes |
|---|---|---|
| `staff` | `id` (the user handle, 32 random bytes base64url, primary key), `email` (unique, lower case), `created_at` | One row per person, made at their first sign-in. `members` stays keyed by email |
| `passkeys` | `id` (credential id, base64url, primary key), `staff_id`, `public_key` (COSE bytes), `alg`, `sign_count`, `backup_eligible`, `backed_up`, `transports`, `label`, `created_at`, `last_used_at` | Index on `staff_id`. At most 10 per person |
| `sessions` | `id_hash` (hex SHA-256 of the cookie value, primary key), `staff_id`, `method` (`passkey` or `email`), `label` (device kind), `created_at`, `last_seen_at`, `expires_at` | Index on `staff_id` |
| `sign_in_attempts` | `id`, `kind` (`passkey-sign-in`, `passkey-register`, `email`), `email` (email attempts only), `staff_id` (registration only), `challenge` (passkeys), `code_hmac`, `token_hmac` (unique), `browser_hash` (the attempt cookie's hash), `tries`, `created_at`, `expires_at`, `used_at` | Rows are written only for an email that is on a team; the counts in section 5 come from here |

No IP addresses and no user agents are stored: only the device kind ("iPhone").

With no D1 (`next dev`, the E2E run, unit tests) the same live in the in-memory directory, as members and site keys do now.

### Retention (the nightly job in `worker.mjs`)

| What | Deleted |
|---|---|
| `sign_in_attempts` | 24 hours after they were made (the daily counts need a day) |
| `sessions` | when they end (sign-out, sign out everywhere, removal), and nightly once past either lifetime |
| `passkeys`, `staff` | when the person is at no dealer any more (at removal), and nightly for any `staff` row with no membership |

The nightly job gains one directory step, `purge-sign-in`, which logs counts only, as the other purges do.

### A data request from a staff member

Staff are not in the dealers' Data requests screen today (customers are), and this keeps that. A staff member who asks what we hold gets,
from a script we run on the directory: their `staff` row, their passkeys (device label and dates; the public key too if they ask, it is
not secret), their sessions (device kind and dates) and any pending sign-in attempts. Erasure is removal from every team, which deletes all
of it. The activity log entries that name them as the person who made a change are the dealer's records and follow the dealer's 12-month
retention.

### GDPR notes

- Kept to the minimum: an email (already in `members`), a random id, public keys, dates and a device kind. No IPs, no user agents, no
  passwords, nothing biometric (user verification happens on the device; WebAuthn sends us only a flag).
- The purpose is security of the service, and the retention above is short.
- Who is the controller for staff sign-in data is open question 4.

## 7. Moving off Access

A new var, `SIGN_IN`, per environment in `wrangler.jsonc`:

| Value | Who is let in |
|---|---|
| `access` | As today: the Access token only. The default, so merging the code changes nothing |
| `both` | Access stays in front at Cloudflare and its token is still required. Our sign-in pages work behind it. Where our session cookie is there, its email must equal the Access token's |
| `own` | Our session only. Access's token is not checked |

`NEXT_PUBLIC_ADMIN_OPEN` and `next dev` keep their open shortcut, unchanged and still refused wherever the directory is bound.

### Dev first

1. Merge the build plan's steps 1 to 6 (each changes nothing while `SIGN_IN` is `access`).
2. Owner: `npx wrangler secret put SIGN_IN_SECRET` (dev), a random 32-byte value. Set up `sign-in@checkwork.ie` as a sending address
   (open question 3). Dev's `EMAIL` binding can only send to `contact@checkwork.ie` today: add our own team's addresses to its
   `allowed_destination_addresses`.
3. PR: dev's `SIGN_IN` to `both`. Deploy. Each of us signs in through Access, then through our sign-in (email code, then add a passkey) on
   a laptop, an iPhone (Safari and the home screen app) and an Android phone.
4. PR: dev's `SIGN_IN` to `own`. Owner: on dev's Access application, add a policy **Bypass, Everyone** at the top (Access then stops
   checking, and the application and its other policies stay for rollback). Do the same on dev's two Bypass applications for `/api/owner/*`
   and `/api/site/*` (nothing changes for them).
5. Run for a week: sign in and out on each device, a lost phone drill (sign out everywhere from a laptop), a removal from a team, the
   lockout, and a push notification tap while signed out (it must reach sign-in and then the lead).

### Then production

6. Owner: `SIGN_IN_SECRET` for production.
7. PR: production's `SIGN_IN` to `both`. Every real person signs in once through our sign-in and adds a passkey while Access still guards
   the app. We check in the directory that each has one.
8. PR: production's `SIGN_IN` to `own`. Owner: Bypass, Everyone on production's Access application.
9. Two weeks later, if nothing went wrong: the owner deletes the Access applications (dev and production, and the four Bypass ones), and a
   last PR removes `src/lib/access.ts`, the `CF_ACCESS_*` vars, the `access` and `both` modes, and the Access sections of
   `docs/dealer-admin.md` and `docs/new-dealer.md` (step 5 there becomes "they get an invitation email").

### Rollback

- From `own`: set `SIGN_IN` back to `both` or `access` (a one-line PR, or a manual Deploy of the previous commit from the Actions tab), and
  remove the Bypass, Everyone policy. Access is back in front within a minute. The new tables stay; they hurt nothing.
- From `both`: set it to `access`.
- After step 9 rollback means building Access again from `docs/dealer-admin.md` in git history; that is why step 9 waits two weeks.

### What the owner does in Cloudflare

| When | What |
|---|---|
| Step 2 and 6 | `SIGN_IN_SECRET` per environment |
| Step 2 | The sending address `sign-in@checkwork.ie`, and dev's allowed addresses |
| Step 4 and 8 | Bypass, Everyone on the Access application (dev, then production) |
| Step 9 | Delete the Access applications |

The rate limit namespaces are config in `wrangler.jsonc`, in a PR, not a dashboard step.

## 8. Threats and answers

| Threat | Answer | What is left |
|---|---|---|
| Phishing (a fake sign-in page) | A passkey only signs for our real origin; the browser puts the origin in what it signs and we check it. A fake site gets nothing it can use | The emailed code can be relayed in real time by a fake site that started its own sign-in. The email says where to type it. Open question 2 can close this for people with a passkey |
| Stolen session cookie | HttpOnly (no script reads it), Secure, `__Host-`, 12 hours idle and 7 days at most, ended by sign out everywhere or by removal from the team | Someone with the cookie is the person until one of those happens. No binding to the device (a user agent is easy to copy, so it would add little) |
| Stolen phone | The passkey needs the phone's Face ID or passcode. Sign out everywhere (or the owner's "Sign out on all devices") ends its session and its notifications | An unlocked phone with the app open is signed in until then. Email on the phone can get a code |
| Email account takeover | Codes and links need the mailbox; the lockout email and the activity log entries show changes | Whoever holds the mailbox can sign in by email. Open question 2 |
| An insider at dealer A reaching dealer B | Sign-in says only who someone is. Which dealer is the directory's, checked on every request and action (`dealerAccess`, `requireStaff`); a cookie, form or header naming dealer B opens nothing. Unchanged by this work, and `e2e/dealers.spec.ts` keeps proving it | None new |
| Brute force | Codes: 5 tries each, 3 emails in 15 minutes, 10 a day, a 24-hour lockout after 3 dead codes, per-IP limits. Links: 256 bits. Passkeys: nothing to guess | Rate limit bindings count per location, so a spread-out attack gets a little more; the D1 counts are exact |
| Replay | Challenges, codes and links are single use, marked used in the same statement that checks them, and expire (5 and 15 minutes). The passkey's signature covers our challenge and origin. The counter catches a cloned hardware key | Synced passkeys send no counter, so cloning one is not detectable; that is the platform's (Apple's, Google's) to protect |
| The service worker caching a signed-in page | `public/sw.js` caches only the offline screen and the icon; page loads always go to the network. That rule stays, and a unit test pins the worker's cache list. Signed-in pages are dynamic, which Next sends with `no-store` (step 3 adds a test that pins it). Sign out sends `Clear-Site-Data: "cache"` | `"storage"` is not sent: it would also remove the service worker and with it the device's notifications |
| An XSS in the app | HttpOnly keeps the cookie from script. React escapes output. The CSP allows scripts from our own origin only (`next.config.ts`). Adding a passkey needs a recent sign-in and the device's own prompt, so script cannot add one quietly | The CSP allows `'unsafe-inline'` scripts (no nonce, for static pages), so an injected inline script would run and could act as the person while the page is open. Removing `'unsafe-inline'` is separate work |
| A subdomain cookie leak (`demo.checkwork.ie`, `www.checkwork.ie`, dev) | `__Host-` cookies have no `Domain`, so they go to their own host only and no other host can set one. Server actions check `Origin`, which stops a POST from another `checkwork.ie` host even though browsers count it as the same site. Separate RP ids and origins per environment | The dealer choice cookie (`checkwork-dealer`) is not `__Host-`; a sibling host could set it, but it is only a preference checked against memberships. It moves to `__Host-` in step 3 anyway |

## 9. Build plan

Each step is one PR, ready for review, with the house checks (`docs`-only steps excepted). Steps 1 to 6 change nothing on a deploy while
`SIGN_IN` is `access`.

| # | PR | Tests |
|---|---|---|
| 1 | **Tables.** The four directory tables and their migration; the in-memory copies; `purge-sign-in` in the nightly job | Integration test on SQLite with the real migrations (`*.int.test.ts`); purge deletes only what is due; `bash scripts/check-migrations.sh main` |
| 2 | **The WebAuthn verifier.** `src/lib/auth/cbor.ts` and `webauthn.ts`: CBOR, COSE to JWK, DER to raw, both ceremonies | RFC 8949 Appendix A vectors; one failing test per check in section 2; recorded fixtures from Chrome's virtual authenticator, an iPhone, an Android phone and Windows Hello (RS256); a test authenticator made with `node:crypto` for the negative cases |
| 3 | **Sessions and the switch.** `src/lib/auth/session.ts`; `SIGN_IN` modes in `staffIdentity()` and `src/proxy.ts`; sign out; the dealer cookie to `__Host-` | Each mode against each of: no cookie, a good one, an idle one, an expired one, an ended one, a mismatched Access email in `both`; the open shortcut still refused with a directory bound; the cookie's attributes |
| 4 | **Email code and link.** The request, code and link screens; HMACs; the limits and lockout; the email; the attempt cookie; an outbox in memory for the E2E run (only with `E2E_FAKE_BACKENDS=1` and no directory bound, like the in-memory directory) | Same answer for known, unknown, locked and limited emails; single use under two posts at once; expiry; 5 tries; the caps; the log lines hold no email (a test watches `console`) |
| 5 | **Passkeys in the app.** "Sign in with a passkey" with autofill; "Sign in faster next time"; Settings, Your sign-in (passkeys, devices, sign out everywhere); the recent sign-in check | E2E with Playwright's CDP virtual authenticator (`WebAuthn.enable`, then `WebAuthn.addVirtualAuthenticator` with `protocol: "ctap2"`, `transport: "internal"`, `hasResidentKey`, `hasUserVerification`, `isUserVerified`, `automaticPresenceSimulation`): add a passkey after an email sign-in, sign out, sign in with it, remove it. A manual check on a real iPhone (Safari and the home screen app) and Android phone |
| 6 | **The team.** The invitation email; removal ends sessions (and passkeys when at no dealer); the owner's "Sign out on all devices"; sign out everywhere turns notifications off; activity entries | `src/lib/admin/team.test.ts` grows; E2E: someone removed is signed out at their next click |
| 7 | **Dev cut-over** (section 7, steps 2 to 5): `SIGN_IN` to `both`, then `own` | The E2E suite and the week of checks |
| 8 | **Production cut-over** (steps 6 to 8) | The same, on production, by us |
| 9 | **Access removed** (step 9): code, vars and docs | The whole suite with `access.ts` gone |

The E2E run today is open (`NEXT_PUBLIC_ADMIN_OPEN=1`, the one person `DEV_EMAIL`). Sign-in tests need a server that is closed: a third
`webServer` of the same build in `playwright.config.ts`, on the next free port, with a server-only `E2E_SIGN_IN=1` that turns the open
shortcut off. That switch can only close the app, never open it. The virtual authenticator is Chromium only, which is what the suite runs
(`devices["Pixel 7"]`).

## 10. Open questions for the owner

1. **How long a session lasts.** Recommended: 12 hours idle, 7 days at most. On the phone app that means Face ID about once a working day,
   one tap. Longer (say 30 days) is friendlier and weaker on a lost phone.
2. **Email sign-in once someone has a passkey.** Recommended for now: keep it for everyone, so a lost phone never locks anyone out, and email
   the person when a new device signs in by email. Later, once everyone has a passkey on two devices, we can require passkeys for owners
   and managers, which closes code relaying and mailbox takeover for them.
3. **Sending sign-in email to any address.** Production must email any staff member. I have not confirmed that our `EMAIL` binding on
   production can send to addresses that are not verified in Email Routing (dev's cannot, by design). Lead emails to dealers suggest it can,
   but this must be checked on dev with an unverified address before step 4 ships. If it cannot, the choice is Cloudflare's email sending
   service (if it is available to the account) or an email API called with `fetch` (a service, not a library). Recommended: Cloudflare's,
   so nothing new is added. Also: is `sign-in@checkwork.ie` the address you want?
4. **Who controls staff sign-in data.** Recommended: say in the agreement with each dealer that Checkwork keeps staff sign-in records
   (section 6) as the dealer's processor, for security only, with the retention above. This wants your solicitor's or the DPA's wording, not
   ours.
