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

## One system, three all-inclusive plans (owner, 2026-11-27 and 2026-11-28, #212)

This replaces the plans below. Every dealer gets every part of the dashboard: no modules, no plan picker, no add-ons. "It's meant to be 1
price for the website, 1 price for dash, and 1 price for both" (owner, 2026-11-28).

- Three plans, a month before VAT, for one dealership, each all-inclusive within itself, no setup fee: Website EUR 149, Dashboard EUR 149,
  Website + Dashboard EUR 249 (`PLANS` in `src/lib/billing/rules.ts`). Social and ads, AI writing and every dashboard part are in any
  plan with the dashboard. The plan is a billing fact only (`plan` in the dealer's profile), never a switch on what they see.
- Usage and lookups are paid by the dealer, with the allowance each plan had: 100 registration lookups and 500 WhatsApp alerts and
  confirmations a month with the dashboard, none on the website alone. Past that, pay as you go, as before: lookups, history checks
  and WhatsApp messages. AI writing stays fair use, never billed.
- The dealer sets a monthly limit per paid service in Settings, Monthly limits; Billing links there. Our ceilings stay as safety caps.
- Role permissions stay as they are. A service that needs the dealer's own keys says "Not connected" until it is.
- The owner API's `/api/owner/v1/modules` and `modules` in `/summary` are removed (nothing read them); `/summary` has `plan` (its id, label and price).
- A stored `modules` value in a dealer's profile is read once for the plan when `plan` is not set (the dashboard with a website part is
  both, the dashboard alone dashboard, no dashboard website, unset dashboard); nothing is deleted. Bills already issued keep their lines.

## Pricing (owner, 2026-11-24, #147; replaced by #212 above)

Prices a month before VAT, for one dealership. No dealer had been quoted, so nobody keeps an old price.

| Plan | Monthly | Setup |
|---|---|---|
| Website | EUR 149 | EUR 500, none on a 2-year term |
| Dashboard | EUR 149 | none |
| Website + Dashboard | EUR 249 | EUR 500, none on a 2-year term |

- Flat plans: the price does not grow with the number of cars. One dealership only; a price per extra dealership comes back with
  multi-dealership (#16).
- Everything is included in its plan: the website plan has the site's modules (trade-in, finance, car finder, commercial vehicles,
  reviews; no lookup, #182), the dashboard plan every dashboard module (test drives, sales and customers, margins, service,
  reviews, analytics, WhatsApp, AI writing, the lookup in the dashboard, stock alerts). Commercial vehicles and car finder are not paid
  modules. Marketing (Social and ads) keeps its add-on price until #148 decides it.
- Paid per use past a monthly allowance: registration lookups and WhatsApp messages. AI writing is fair use: counted, never billed, up
  to our ceiling. One limit per paid service, set by the owner or a manager, with one notice when a limit is reached.
- The contract is 1 or 2 years.
- First dealers: the first month free (a line on that month's bill), and the price locked for 12 months. The lock is a contract term:
  nothing in the app enforces it.

## Open (#14)

### App Store and Play Store
Recommended: start with the installable web app (#11), and list in the stores only if dealers ask, by wrapping the same app rather than writing a second one.

### Dealer websites in one shared app
Today one repo and site per dealer. Revisit at about 10 live dealers.

### Own sign-in
Passkeys first, an emailed code and link as the fallback (#10). Design and security review before code: `docs/sign-in.md`, approved by
the owner on 2026-11-22 (below).

## Approved by the owner, 2026-11-22: our own sign-in (#10)

Proposed in `docs/sign-in.md` and approved by the owner on 2026-11-22; it is built in the steps of section 9 there, and the answers to its questions are in section 11. Revised after a second security review.

| Decision | What it means |
|---|---|
| Passkeys first, an emailed code and link as the fallback | A passkey is one tap and Face ID. The email carries a 6-digit code (works only in the browser that asked, so it works inside the installed iPhone app) and a link (works on any device). Both single use, 15 minutes, stored as an HMAC |
| Invite only | Being added in Settings, Team is the invitation, with an email that holds no token. Sign-in is refused for anyone at no active dealer, with the same answer as for a stranger |
| Our own WebAuthn code, no library | A small, strict CBOR and COSE reader and the spec's checks, with WebCrypto doing the cryptography (Ed25519, ES256, RS256), as Web Push already is. Attestation `none`, or `packed` self attestation. `@simplewebauthn/server` would add ten dependencies for attestation we do not use |
| One relying party id per environment | `dash.checkwork.ie` for production, `dev.dash.checkwork.ie` for dev, each accepting its own origin only |
| Sessions in the directory | An opaque id in a `__Host-` cookie (Secure, HttpOnly, SameSite=Lax), its hash in the directory D1. 12 hours idle, 7 days at most (owner, 2026-11-22). Adding or removing a passkey needs a confirmation within 10 minutes. Sign out everywhere; removal from a team (not a role change, and only once the removal has saved) ends every session, at every dealer |
| Limits | Per IP by a rate limit binding, per email in D1, 5 tries a code, 15 wrong tries a day per email whichever code (then codes locked for 24 hours), 3 emails in 15 minutes and 6 an hour per address and 100 in a row (then codes off until a sign-in), NIST's limit. A lock leaves the link (in an email capped like any other) and passkeys working; a request over the email caps sends and ends nothing. Known and unknown emails answer alike, with the per-email work after the answer. No email, IP or token in any log |
| Moving off Access | A `SIGN_IN` switch (`access`, `both`, `own`; unset or unknown means `access`), dev first then production, Access bypassed and kept two weeks for rollback before it is deleted. Every order of changing the switch and the Access policy fails closed |
| CSRF | Sign-in actions, sign-out and session-reading route handlers require `Origin` equal to the app's own (Next lets a missing one through). No GET changes state |
| Support | No feature to act as another person. We help through an explicit, logged membership, and anything we change by script is written in the dealer's Activity |
