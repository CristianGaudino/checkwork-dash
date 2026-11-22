# Site API (v1)

How a dealer's website (a Showroom site made from `checkwork-demo`) talks to the dashboard (#7). The website's side is
`src/lib/leads/dash.ts` in `checkwork-demo`. Code here: `src/app/api/site/v1/`, `src/lib/site-api/`, the keys in
`src/lib/tenancy/directory.ts`.

## Keys

- Each website has its own key: `cw_site_` and 32 random bytes in base64url. An owner or manager makes one in Settings, Connected services,
  Website connection. The key is shown once, with a copy button; only its SHA-256 is kept, in the directory (`site_keys`, with the dealer,
  a name, when it was made, when it was last used and when it was revoked). Last used is written at most once an hour per key.
- The key decides the dealer. Nothing in a request names one, and the work runs inside that dealer's store (`runAsDealer`).
- A request carries it as `Authorization: Bearer <key>`. It is looked up by its hash, and the hash compared in constant time. A revoked
  key, or a key of a paused dealer, gets 401.
- Making and revoking a key goes in the activity history with the key's name, never the key.
- On the website, the key is the `DASH_SITE_KEY` Worker secret.

### The demo key (next dev and the E2E run only)

With no `DIRECTORY` binding (next dev, the E2E run) the directory is in memory, and it has one key for the demo dealer (Checkwork Motors):
`cw_site_demo-key-for-next-dev-and-e2e-not-a-secret0` (`DEMO_SITE_KEY`). It is not a secret: the memory directory never runs on a deploy
(it throws there). On a deploy, make the demo dealer's key in Settings like any other and set it as `DASH_SITE_KEY` on the demo website.

## `POST /api/site/v1/leads`

A lead the website already stored and emailed (or tried to). Headers `Authorization: Bearer <key>` and `Content-Type: application/json`.

```json
{ "lead": { "id", "clientRef", "type", "carId", "carSlug", "carTitle", "carPriceEur", "sourcePath", "name", "phone", "email", "message",
            "details", "consentAt", "consentVersion", "createdAt" },
  "emailed": true, "photoCount": 0 }
```

and, optionally, `"journey": { ... }`, the visit note (below). Exactly these fields; times are epoch milliseconds. No photos in v1: `photoCount` only, and the lead says in the inbox that photos came
with it on the website.

The lead is checked by the website's own rules (`src/lib/leads/schema.ts`, a booking against the dealer's opening hours), consent
included (`consentAt` and `consentVersion`). The bot check and the per-visitor limit are the website's and are not run again. A stored
lead lands in the dealer's `leads` table (kept and purged by the same rules, `docs/lead-retention.md`) and in their inbox as a website
lead: the bell, the staff WhatsApp alert, and, when `emailed` is false and the dealer has a lead email, the lead email.

### The visit note (`journey`, #34)

What the person did on the website during the visit they sent the enquiry from, sent only when they turned the switch on the form on
(checkwork-demo#249). The website keeps it for that visit only, in the tab's `sessionStorage`. Fixed values only: no free text, no URLs, no
IP address, nothing about the device.

```ts
{ v: 1,
  minutes: number,                              // whole minutes from the first page to sending, 0 to 240
  cars: { id: string; views: number }[],        // car pages opened, most viewed first, at most 12; id as lead.carId (digits); views 1 to 99
  searches: { make?, model?, body?: string;     // slugs, lowercase a-z0-9-, at most 40 characters
              fuel?: Fuel; gearbox?: "manual" | "automatic"; condition?: "used" | "new" | "commercial";
              priceBand?: "under-10k" | "10k-20k" | "20k-30k" | "30k-50k" | "over-50k" }[],   // at most 8, most recent first
  tools: { finance?: { monthlyEur?: number };   // 0 to 5000
           tradeIn?: boolean; saved?: number; compared?: number } }  // counts 0 to 99
```

- Checked by a strict schema (`journeySchema` in `src/lib/leads/journey.ts`): no unknown keys, strings to their patterns or lists, whole
  numbers within their caps, and at most 4 KB as JSON (the largest valid v1 is about 2 KB).
- **A bad note is dropped, never the lead.** A note that is malformed, too big or of a `v` this app does not know (a later version) is
  dropped and the lead is stored and answered 201 as if it came without one. Losing an enquiry over its history would be the worse failure,
  and the person already sent it. Nothing says it was dropped: the answer is the lead's.
- Kept on the lead in the dealer's inbox (the leads collection, `real-` records), not in the `leads` table, so it goes with the lead: the
  daily purge, an erasure and the data request export (`docs/lead-retention.md`). An alert sign-up has no lead, so its note is dropped. If the
  copy into the inbox fails (`mirror_failed`), the note is lost with it; the lead is still in the `leads` table.
- Never logged.
- Shown on the lead as This visit, and used by the Prepare me AI brief (`leadBrief` in `src/lib/ai/`).

| Status | When | Body |
|---|---|---|
| 201 | Stored | `{ "id": "<the dashboard's id>" }` |
| 200 | That `clientRef` was already received for this dealer (a retry) | `{ "id": "<the same id>" }` |
| 400 | Not JSON, not the contract, or the lead breaks a rule (consent missing included). A bad `journey` alone never causes it | none |
| 401 | No key, a malformed, unknown or revoked key | none |
| 413 | Body over 64 KB, by its Content-Length or as it is read | none |
| 429 | Over the key's rate limit | none |
| 500 | Something failed here; the website may retry with the same `clientRef` | none |

## `GET /api/site/v1/stock`

Same key. For a dealer whose stock is kept here (`stock.source` `checkwork` in their profile): `{ "cars": Car[] }`, the cars on their
website (live, plus sold cars inside their sold window, `onPublicSite`), with the public fields only (`PUBLIC_FIELDS` in
`src/lib/site-api/stock.ts`: never cost, prep, margins, notes, a deposit's buyer, or whether a car is hidden or a draft). `Cache-Control:
private, max-age=60` and `Vary: Authorization`: the address is the same for every dealer, so no shared cache may keep it. A synced
dealer (DoneDeal or CarsIreland) gets 404: their website reads the listing site. 401 and 429 as above.

Photos a dealer uploads in the dashboard are `/car-photos/...` paths that only the dealer's own staff can open. Serving them to the
website is not built yet.

## Limits and logs

- `SITE_LIMITER` (`wrangler.jsonc`): 60 requests a minute per key. With no binding (next dev, the E2E run) there is no limit.
- One log line per request: the route, the dealer's id, the outcome and the status (`logSite` in `src/lib/log.ts`). Never the key, the
  lead, its visit note, a name, an email or a phone.

## What the owner sets up

- **Cloudflare Access:** the staff application covers the whole host, so add an application for `www.dash.checkwork.ie/api/site/*` (and `dev.dash.checkwork.ie/api/site/*` on dev) with
  a **Bypass** policy (as for `/api/owner/*`), or a website calling over the internet is turned away by Access. A website Worker in the
  same Cloudflare account that calls through a service binding (`DASH` in `checkwork-demo`) does not pass through Access at all.
- **Rate limit:** `SITE_LIMITER` uses namespace `1004` in production and `2004` in dev (`wrangler.jsonc`); change one if that id is taken in the account.
- **Directory:** apply the new migration (`npm run directory:migrate`, and `directory:migrate:prod`), which adds `site_keys`.
- **Each website:** make its key in that dealer's Settings and set it as `DASH_SITE_KEY` on the website's Worker (`wrangler secret put
  DASH_SITE_KEY`). The demo website takes the demo dealer's key, made the same way.
