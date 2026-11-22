# Site API (v1)

How a dealer's website (a Showroom site made from `checkwork-demo`) talks to the dashboard (#7). The website's side is
`src/lib/leads/dash.ts` in `checkwork-demo`. Code here: `src/app/api/site/v1/`, `src/lib/site-api/`, the keys in
`src/lib/tenancy/directory.ts`.

## Keys

- Each website has its own key: `cw_site_` and 32 random bytes in base64url. An owner or manager makes one in Settings, Connected services, For your web developer,
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
  numbers within their caps. The website keeps a note to at most 4 KB as JSON; the caps keep the largest valid v1 near 2 KB, so the app
  checks the schema only.
- **A bad note is dropped, never the lead.** A note that is malformed, over a cap or of a `v` this app does not know (a later version) is
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

## `POST /api/site/v1/counts`

A day's anonymous visitor counts from the website (#71), so a real dealer's Analytics, Where visits come from, the Overview strip and the
monthly report show their website's figures. Same key, auth, 64 KB cap and rate limit as the leads POST. Code: `src/lib/site-api/counts.ts`.

```json
{ "day": "2026-11-21", "counts": { "visit:google": 12, "saved": 3, "filter:make": 5 } }
```

- `day` is an Irish calendar day, not in the future and not older than 35 days.
- Names are only the buyer's events, from a fixed list (`BUYER_EVENTS` in `src/lib/owner-api/counter-rules.ts`, the same list the website
  records): `saved`, `compare`, `finance`, `units`, `no-results`, `contact-topic`, `filter:make|model|body|fuel|price|year|km|gearbox`, and
  the visit events `visit:<channel>`, `band:<price band>`, `missed:<make slug or other>` (`VISIT_EVENTS` in `src/lib/visit-rules.ts`). Any
  other name, the dashboard's own `dash:` ones included, is refused. At most 200 names, each a whole number from 0 to 1,000,000. No visitor
  id, IP or anything else is accepted.
- **It replaces that day's website counts for the dealer**, so the website can send a day again as its numbers grow. A name left out of a
  resend is cleared, and a 0 stores nothing. Other days and the dashboard's own counts are untouched.
- Kept in the dealer's store, in the `feature-counts` records that `countsBetween` reads (one per day per name, purged after 13 months).

| Status | When | Body |
|---|---|---|
| 204 | Stored (or replaced) | none |
| 400 | Not JSON, not the contract, a bad day, a name off the list or a count out of range. Nothing is stored and no detail is given | none |
| 401, 413, 429, 500 | As for leads | none |

## `GET /api/site/v1/stock`

Same key. For a dealer whose stock is kept here (`stock.source` `checkwork` in their profile): `{ "cars": Car[] }`, the cars on their
website (live, plus sold cars inside their sold window, `onPublicSite`), with the public fields only (`PUBLIC_FIELDS` in
`src/lib/site-api/stock.ts`: never cost, prep, margins, notes, a deposit's buyer, or whether a car is hidden or a draft). `Cache-Control:
private, max-age=60` and `Vary: Authorization`: the address is the same for every dealer, so no shared cache may keep it. A synced
dealer (DoneDeal or CarsIreland) gets 404: their website reads the listing site. 401 and 429 as above.

Each car's `photos` are links the website can put straight in an `<img>` (next section). A photo it could not open is left out.

## Car photos (`GET /api/site/v1/photos/<dealer>/<key>?sig=<signature>`)

An `<img>` cannot send the site key, so the stock answer gives every photo as a link that needs no key
(`src/lib/site-api/photos.ts`):

- **A photo added in the dashboard** (stored in R2 under `dealers/<id>/cars/...`):
  `https://www.dash.checkwork.ie/api/site/v1/photos/<dealer id>/cars/<car id>/<uuid>.jpg?sig=<signature>`. The signature is an
  HMAC-SHA256 of the dealer's id and the key, with `SITE_PHOTO_SECRET` (a Worker secret, one per environment), in base64url.
- **The demo's own photos** (static files): `/stock/<car id>/<n>.webp`, given as they are. Only the demo dealer has these, and the demo
  website serves its own copies (`public/stock/`), so they need nothing from this app.
- **With no bucket** (next dev, the E2E run) a photo added in the dashboard is a `data:` URL, given as it is.

The host is the deploy's own (`APP_URL`). The photo route answers the photo only when all of these hold, and otherwise the same bare 404:

- the signature is right for that dealer and that key: one dealer's link never opens another dealer's photo, and a changed dealer, key or
  signature opens nothing;
- the key is a car photo's (`CAR_PHOTO_KEY`), read under that dealer's prefix only, and the dealer is active;
- the car is on the dealer's website now (`onPublicSite`, stock kept here) and the photo is still on the car (one row of the dealer's D1).

After the signature check, and before any D1 read, the Workers cache (`caches.default`, keyed by the checked dealer, key and signature, so extra query parameters cannot skip it) answers for up to 10
minutes. So hiding a car, making it a draft, removing a photo or pausing the dealer stops its links within 10 minutes, without changing
the secret. A browser that already has the photo keeps its copy. A bad signature never reaches the cache.

A photo is `image/jpeg`, `Cache-Control: public, max-age=31536000, immutable` and `nosniff`: a key is new for every upload, so a photo
never changes. The cache's own copy is kept `max-age=600`; the browser always gets the year. A failure is logged as one line with the
dealer's id (`logSite`, route `photos`), never the key or the signature.

With no `SITE_PHOTO_SECRET` nothing is signed: the stock answer leaves the stored photos out (the demo's static ones stay) and every photo
link answers 404. There is no fallback key, on any deploy. Changing the secret ends every link given before; the website gets new ones with
its next stock read.

## Limits and logs

- `SITE_LIMITER` (`wrangler.jsonc`): 60 requests a minute per key. With no binding (next dev, the E2E run) there is no limit.
- One log line per request: the route, the dealer's id, the outcome and the status (`logSite` in `src/lib/log.ts`). Never the key, the
  lead, its visit note, a name, an email or a phone.

## What the owner sets up

- **Cloudflare Access:** the staff application covers the whole host, so add an application for `www.dash.checkwork.ie/api/site/*` (and `dev.dash.checkwork.ie/api/site/*` on dev) with
  a **Bypass** policy (as for `/api/owner/*`), or a website calling over the internet is turned away by Access. A website Worker in the
  same Cloudflare account that calls through a service binding (`DASH` in `checkwork-demo`) does not pass through Access at all.
- **Rate limit:** `SITE_LIMITER` uses namespace `3004` in production and `4004` in dev (`wrangler.jsonc`); change one if that id is taken in the account.
- **Photo secret:** set `SITE_PHOTO_SECRET` in each environment, a long random value of its own (`openssl rand -base64 32 | npx wrangler
  secret put SITE_PHOTO_SECRET`, and again with `--env production`). Until it is set, a website shows no photo added in
  the dashboard, and Settings, Website connection says so to owners and managers.
- **Access and photos:** the photos load in the visitor's browser, over the internet, so they pass through Access even when the website's
  Worker reads the API through the service binding. The `/api/site/*` Bypass above covers the photo route.
- **Directory:** apply the new migration (`npm run directory:migrate`, and `directory:migrate:prod`), which adds `site_keys`.
- **Each website:** make its key in that dealer's Settings and set it as `DASH_SITE_KEY` on the website's Worker (`wrangler secret put
  DASH_SITE_KEY`). The demo website takes the demo dealer's key, made the same way.
