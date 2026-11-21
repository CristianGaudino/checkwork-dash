# Lead retention and erasure

Since one app serves every dealer (`docs/new-dealer.md`), each dealer's leads are in that dealer's own database (`DB_<DEALER>` below where
this page says `DB`).

Leads are personal data. Deleting old leads is automatic (see "Automatic purge"). Until the admin area (#20) ships, the owner does the rest by hand (erasure on request, leads that were not emailed) with `npx wrangler d1 execute DB_<DEALER> --remote --env production --command "<SQL>"` (without `--env production` it is dev) (or the Cloudflare dashboard, Storage & Databases, D1, the database, Console). Times are stored as epoch milliseconds and `photo_keys` as JSON text.

## How long leads are kept

Leads are kept for **12 months** from when they were sent, then deleted. The period is the constant `LEAD_RETENTION_MONTHS` in `src/lib/leads/constants.ts`, and the `/privacy` page (added in 03-10) states it. The dealer must confirm the period. If it changes, change the constant, `/privacy` and this page together.

The dashboard's copies go on the same day, and so does every test drive, including one staff booked on the dashboard (a phone booking holds the same name and contact).

## Sale records

A sale recorded in the dashboard names its buyer (a customer, by id). It is kept **6 years** (`SALE_KEEP_YEARS`, Irish business records),
then the same daily job removes the buyer from it and keeps the figures (`src/lib/admin/sales-purge.ts`, `{"job":"anonymise-sales"}`).
`/privacy` states it; change both together.

## Automatic purge

A Cloudflare cron trigger (wrangler.jsonc `triggers`, daily at 03:17 UTC) runs `purgeOldLeads` (src/lib/leads/purge.ts) from `worker.mjs`. It deletes the trade-in photos of every lead older than `LEAD_RETENTION_MONTHS` from R2, then deletes those lead rows. Photos go first: if R2 fails, the rows stay and the next run tries again. Each run logs one line, `{"job":"purge-leads","deleted":<count>}`, and nothing else. A run that throws shows as a failed cron in the Cloudflare dashboard (Workers, the Worker, Cron Triggers) and in Workers Logs.

Check it once after the first deploy, then when Workers Logs show a failed run: Workers Logs should show one `purge-leads` line a day. To run it by hand, or if the cron ever stops, the same deletion as SQL (photos first, see "Erasing one person's photos"):

```sql
DELETE FROM leads WHERE created_at < unixepoch('now', '-12 months') * 1000;
```

## Erasure on request

When someone asks for their data to be deleted, find their rows by the email or phone they give:

```sql
SELECT id, type, datetime(created_at / 1000, 'unixepoch') AS created FROM leads WHERE email = 'their@email.example' OR phone = '083 000 0000';
```

Check the rows are theirs. If any is a trade-in with photos, delete the photos first ("Erasing one person's photos" below). Then delete the rows by id:

```sql
DELETE FROM leads WHERE id IN ('<id>', '<id>');
```

Phone numbers are stored as typed, so try the common spellings (with and without spaces, with `+353`). Delete the dealer's copies of the lead emails too, and reply to say it is done.

## Photos

The site API carries no photos (`docs/site-api.md`): a dealer's website keeps the photos sent with a request, under its own retention, and
sends only how many there were. The `photo_keys` column is from when this app took the forms itself and is empty on every lead the site API
stores; the daily purge and an erasure on request still delete any keys a row holds, so nothing to do by hand here.

## What deletes what

- Lead rows: the daily purge (`worker.mjs`), once a lead is older than `LEAD_RETENTION_MONTHS` (12 months).

## Leads that were not emailed

The lead row is the record; the email to the dealer is a notification. If that email fails, the buyer is asked to call or try again, the row keeps `notified_at` empty, and the Worker writes one error-level `notify_failed` log line with only the lead id, type and outcome. No contact details are ever logged.

The lead still reaches the dashboard, with a note on it that the email didn't go, so the team sees it without this query. If the buyer tries again, it arrives a second time.

If the copy into the dashboard fails, the Worker writes one error-level `mirror_failed` line (the lead id, type and outcome only). The lead is still in the `leads` table and, if it went, in the dealer's email.

To find them from the database, when Workers Logs show a `notify_failed` line, run:

```sql
SELECT id, type, created_at FROM leads WHERE notified_at IS NULL ORDER BY created_at DESC;
```

Open each lead with `SELECT * FROM leads WHERE id = '<id>';` and follow it up by hand. Once handled, mark it so it drops off the list:

```sql
UPDATE leads SET notified_at = unixepoch('now') * 1000 WHERE id = '<id>';
```
