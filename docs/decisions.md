# Decisions

What the owner has decided about the dashboard as its own product, and what is still open. New decisions go here and on an issue labelled `decision`.

## Made (owner, 2026-11-21)

| Decision | What it means |
|---|---|
| The dashboard is its own product, in this repo | The dashboard in `checkwork-demo` is archived: no new work there, and it is not deleted until the owner says so (checkwork-demo#243). |
| One shared app at `www.dash.checkwork.ie` | Every dealer signs in at the same address and sees the same design, with their own logo and name. `www.checkwork.ie` stays our own public site. |
| Hosted on Cloudflare | Workers (through OpenNext) for the app and its API, D1 for data, R2 for photos and media, cron triggers for scheduled jobs. Data in the EU jurisdiction. |
| Each dealer's records in a store of their own | One D1 database per dealer, plus a directory database that lists the dealers and who works at each (#3). |
| Sign-in: our own, Cloudflare Access for now | Access stands in front of the whole app until our own sign-in is built (#4, #10). Never Clerk or a similar service. |
| The dashboard is private (2026-11-22) | Sign-in only, no sign-up. Access lets in named emails only. No public demo of the dashboard for now: the demo dealer is for our own people. |
| The showroom demo is public and view-only (2026-11-22) | `demo.checkwork.ie` has no demo bar, dealer controls or links to a dashboard (checkwork-demo#246). |
| Dealer websites stay one repo and site per dealer | Showroom sites are made from `checkwork-demo` for each paying dealer and talk to this app through its site API (#7). |
| Name | Checkwork, for now. |
| Repo visibility | Public for now; the owner makes it private when ready (#13). |

## Open (#14)

### App Store and Play Store
Recommended: start with the installable web app (#11), and list in the stores only if dealers ask, by wrapping the same app rather than writing a second one.

### Pricing
A proposal, not decided. Prices a month before VAT. It keeps the bundle prices agreed on 2026-11-20 and adds the dashboard on its own.

| | Monthly | Setup |
|---|---|---|
| Showroom (website only) | EUR 249 | EUR 950 |
| Dashboard (on its own) | EUR 249 | EUR 250 |
| Dashboard Pro (margins, social, newsletter, branches) | EUR 549, plus EUR 149 per extra branch | EUR 500 |
| Dealer = Showroom + Dashboard | EUR 449 | EUR 950 |
| Group = Showroom + Dashboard Pro, with commercial and new cars | EUR 749, plus EUR 149 per extra branch | EUR 1,950 |

- Why: of the 112 tier A and B prospects, 25 sit on a manufacturer's template or NetDirector/mtc and cannot change site, and 65 on HappyDealer or CarsIreland can start with the dashboard and move their site later.
- The dashboard on its own needs leads from websites that are not ours first (#12).
- Usage prices, allowances and limits stay as they are. Staff logins stay unlimited.

### Dealer websites in one shared app
Today one repo and site per dealer. Revisit at about 10 live dealers.

### Own sign-in
Passkeys first, an emailed link as the fallback (#10). Design and security review before code: `docs/sign-in.md`, pending the owner's
approval (below).

## Pending the owner's approval: our own sign-in (#10)

Proposed in `docs/sign-in.md`. None of it is built until the owner approves; its open questions are in section 11 there. Revised after a second security review.

| Decision | What it means |
|---|---|
| Passkeys first, an emailed code and link as the fallback | A passkey is one tap and Face ID. The email carries a 6-digit code (works only in the browser that asked, so it works inside the installed iPhone app) and a link (works on any device). Both single use, 15 minutes, stored as an HMAC |
| Invite only | Being added in Settings, Team is the invitation, with an email that holds no token. Sign-in is refused for anyone at no active dealer, with the same answer as for a stranger |
| Our own WebAuthn code, no library | A small, strict CBOR and COSE reader and the spec's checks, with WebCrypto doing the cryptography (Ed25519, ES256, RS256), as Web Push already is. Attestation `none`, or `packed` self attestation. `@simplewebauthn/server` would add ten dependencies for attestation we do not use |
| One relying party id per environment | `dash.checkwork.ie` for production, `dev.dash.checkwork.ie` for dev, each accepting its own origin only |
| Sessions in the directory | An opaque id in a `__Host-` cookie (Secure, HttpOnly, SameSite=Lax), its hash in the directory D1. 12 hours idle, 7 days at most (to confirm). Adding or removing a passkey needs a confirmation within 10 minutes. Sign out everywhere; removal from a team (not a role change, and only once the removal has saved) ends every session, at every dealer |
| Limits | Per IP by a rate limit binding, per email in D1, 5 tries a code, 15 wrong tries a day per email whichever code (then codes locked for 24 hours) and 100 in a row (then codes off until a sign-in), NIST's limit. A lock leaves the link and passkeys working. Known and unknown emails answer alike, with the per-email work after the answer. No email, IP or token in any log |
| Moving off Access | A `SIGN_IN` switch (`access`, `both`, `own`; unset or unknown means `access`), dev first then production, Access bypassed and kept two weeks for rollback before it is deleted. Every order of changing the switch and the Access policy fails closed |
| CSRF | Sign-in actions, sign-out and session-reading route handlers require `Origin` equal to the app's own (Next lets a missing one through). No GET changes state |
| Support | No feature to act as another person. We help through an explicit, logged membership, and anything we change by script is written in the dealer's Activity |
