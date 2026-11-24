# Owner API

For the owner's own program (#62): how each dealer uses the app, and, since #80, #118 and #177, the dealers' outside-service keys, website keys and contract terms. One app serves every dealer, so every figure is for the dealer named in the call. Counts only, never personal data (no names, phones, emails, registrations or IPs). Built for #174.

## Set up (once)

- Worker secret `OWNER_API_TOKEN`: a long random string. Without it the routes answer 404 to everyone.
- Optional Worker secret `OWNER_API_MONEY=1`: adds sale values. It is one switch for the whole app until each dealer's own settings exist (#5): set it only when every dealer's contract allows.
- The routes are under `/api/owner/`. The staff Cloudflare Access application covers the whole host, so give `/api/owner/*` its own application with a Bypass policy on each host (`www.dash.checkwork.ie`, and `dev.dash.checkwork.ie` on dev), or the owner's program is turned away by Access.

## Calls

Send `Authorization: Bearer <OWNER_API_TOKEN>`. No token or a wrong one: `404`, as the closed dashboard answers. The token is compared in constant time.

- `GET /api/owner/v1/dealers`: every dealer the app serves, `{"version": 1, "dealers": [{"id", "name", "status", "demo"}]}`. Ids and names only.
- `GET /api/owner/v1/summary?dealer=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/owner/v1/usage?dealer=<id>&from=&to=`: billing counts by month, with costs for the month in progress only (a past month may have been on another plan; its bill is the record)
- `GET /api/owner/v1/modules?dealer=<id>`: the modules on and the monthly plan price (`planEur`: the plan and its add-ons, before VAT)

`dealer` is required: an id from `/dealers`. Missing or malformed: `400`; no such dealer: `404`. The figures are worked out inside that dealer's own store. `from` and `to` are Irish days, inclusive; the default is the last 30 days. More than a year, or a bad day: `400`. Answers are cached for an hour per dealer and range (`Cache-Control: private, max-age=3600`, and in the Worker).

## Dealer service keys (#80)

Checkwork sets and removes each dealer's outside-service keys (Facebook, ads, WhatsApp and so on); the dealer never does. Settings only shows whether each is connected. The same bearer token; no token or a wrong one: `404`. A key is sealed on the Worker (needs the Worker secret `DEALER_SECRETS_KEY`) and is never shown again once saved: no answer carries a value, and the log and activity history name only the dealer, service and outcome ("Connected ...", "Replaced ...", "Removed the keys for ..." by Checkwork).

- `GET /api/owner/v1/dealers/{dealerId}/keys`: `{"version": 1, "services": [{"id", "connected", "names"}]}` for each per-dealer service. Names only.
- `PUT /api/owner/v1/dealers/{dealerId}/keys/{service}`: a JSON object with exactly that service's names (the `names` above, from `perDealer` in `src/lib/integrations.ts`), each a non-empty string up to 4000 characters. `204` saved (replaces any keys it had). `400` wrong names or values, or the demo dealer; `404` no such dealer or service; `503` `DEALER_SECRETS_KEY` is not set.
- `DELETE /api/owner/v1/dealers/{dealerId}/keys/{service}`: removes them. `204`. For `donedeal` at a dealer whose stock is synced, it also
  removes the synced cars and their stored photos (a dealer leaving, `docs/new-dealer.md`).

```sh
curl -H "Authorization: Bearer $OWNER_API_TOKEN" https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/keys
curl -X PUT -H "Authorization: Bearer $OWNER_API_TOKEN" -H "Content-Type: application/json"   -d '{"META_PAGE_ID":"111","META_PAGE_ACCESS_TOKEN":"...","META_INSTAGRAM_ID":"222"}'   https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/keys/social
curl -X DELETE -H "Authorization: Bearer $OWNER_API_TOKEN" https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/keys/social
```

## Dealer website keys (#118)

The key a dealer's website uses for the site API (`docs/site-api.md`). Checkwork makes and revokes them; the dealer's dashboard has none of this. The same bearer token; no token or a wrong one: `404`. Only a key's hash is kept, so the key is in the answer that makes it and never again. The activity history names the key's label only ("Made a website key: Website", by Checkwork).

- `GET /api/owner/v1/dealers/{dealerId}/site-keys`: `{"version": 1, "keys": [{"id", "dealerId", "label", "createdAt", "lastUsedAt", "revokedAt"}]}`, newest first, revoked ones too. Times in ms; `lastUsedAt` is written at most once an hour.
- `POST /api/owner/v1/dealers/{dealerId}/site-keys`: optional JSON `{"label": "Main website"}` (one line, up to 60 characters; no body: "Website"). `201` with the key's fields and `key`. `400` a bad label; `404` no such dealer.
- `DELETE /api/owner/v1/dealers/{dealerId}/site-keys/{keyId}`: revokes it at once. `204`; `404` no such key still on, or another dealer's.

```sh
curl -X POST -H "Authorization: Bearer $OWNER_API_TOKEN" -H "Content-Type: application/json" -d '{"label":"Main website"}' https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/site-keys
curl -X DELETE -H "Authorization: Bearer $OWNER_API_TOKEN" https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/site-keys/<keyId>
```

## Dealer contract term (#177)

Checkwork sets each dealer's contract term (1 or 2 years; no setup fee on 2) and their free first month; the dealer sees both on Billing
(the term under "This month's bill", the free month under "What we set for you") and never changes them. The same bearer token; no token or a wrong one: `404`. Written to the dealer's
billing settings (the record Billing reads) inside their own store, and the activity history says what changed, by Checkwork ("Set the
contract to 2 years", "Set the first month free to December 2026", "Removed the first month free"). The demo dealer is allowed: it is
its own billing settings and nothing goes outside.

- `GET /api/owner/v1/dealers/{dealerId}/billing`: `{"version": 1, "term": 1, "freeMonth": "2026-12"}` (`freeMonth` is `null` when there is none).
- `PUT /api/owner/v1/dealers/{dealerId}/billing`: `{"term": 1 | 2, "freeMonth": "YYYY-MM" | null}`, nothing else. `term` is required;
  `freeMonth` left out keeps it, `null` removes it. A free month is from this month (Irish time) to 12 months ahead: a past
  month's bill is issued on the 1st and never changed (the demo's bills follow its settings). `200` with the answer `GET` gives; `400` a bad body; `404` no such dealer.

```sh
curl -H "Authorization: Bearer $OWNER_API_TOKEN" https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/billing
curl -X PUT -H "Authorization: Bearer $OWNER_API_TOKEN" -H "Content-Type: application/json" -d '{"term":2,"freeMonth":"2026-12"}' https://www.dash.checkwork.ie/api/owner/v1/dealers/test-motors/billing
```

## Shape of `summary` (version 1)

```json
{
  "version": 1,
  "appVersion": "0.1.0",
  "range": { "from": "2026-10-01", "to": "2026-10-31" },
  "leads": { "total": 42, "byType": { "enquiry": 30, "finance": 4 }, "bySource": { "Website": 35, "Phone": 7 }, "byWeekday": [6, 7, 5, 8, 6, 7, 3], "outOfHours": 15 },
  "replies": { "medianInHoursMin": 35, "medianOutOfHoursMin": 610, "none": 3 },
  "stock": { "inStock": 38, "added": 12, "sold": 9, "avgDaysInStock": 31, "oldStock": 6, "priceDrops": 4 },
  "sales": { "count": 9, "valueEur": 118000 },
  "reviews": { "count": 3, "average": 4.7 },
  "features": { "saved": 120, "compare": 31, "finance": 18, "units": 9, "no-results": 14, "filter:fuel": 52 },
  "dashboard": { "leads": 88, "stock": 40, "monthly-report": 2 },
  "modules": ["dashboard", "sales", "reviews"],
  "listingSync": { "lastRunAt": 1760000000000, "lastOkAt": 1760000000000, "result": { "added": 0, "changed": 0, "takenDown": 0 }, "ok": true },
  "usage": [{ "month": "2026-10", "totalEur": 12.4, "services": { "lookup": { "count": 40, "costEur": 12, "kinds": [{ "kind": "dashboard", "count": 30, "costEur": 9 }] } } }]
}
```

- `leads.byWeekday`: Monday first. `bySource` is the channel (Website, Phone, WhatsApp...). `outOfHours` uses the opening hours in `src/lib/site.ts`, Irish time.
- `replies`: minutes from a lead arriving to the first note on it, by when it arrived. `none`: leads with no note within 24 hours, once those 24 hours have passed. `null` when there are none.
- `stock`: `added` and `sold` are in the range. `inStock`, `avgDaysInStock`, `oldStock` (for sale the dealer's `rules.oldStockDays` or more, 60 by default) and `priceDrops` are the stock now (the site keeps no daily history).
- `sales.valueEur` appears only with `OWNER_API_MONEY=1`. Orders and deposits are not counted yet.
- `features`: anonymous daily counters (`saved`, `compare`, `finance`, `units` for km or miles, `no-results`, `contact-topic`, `filter:<make|model|body|fuel|price|year|km|gearbox>`; `visit:<channel>`, one per visit by where it came from; `band:<price band>`; `missed:<make>` for a search with no cars to show). The lists are in `src/lib/visit-rules.ts`. `dashboard`: page opens per dashboard area, counted by the dashboard itself behind Access. Neither says who.
- Visits are the `visit:*` counts in `features`. Errors in the last 24 hours are not included yet.

## Counters

Only names in `src/lib/owner-api/counter-rules.ts` are stored: one record a day per event, no cookie, no id, no IP. The dashboard counts its own page opens, behind Access (`src/app/count-action.ts`). The website's counters came through `POST /api/count` in `checkwork-demo`; this app has no such endpoint, and the site API v1 does not carry them.

## One set of figures

The API, the monthly report page and its email all read `src/lib/reports/monthly.ts`, so they never disagree.
