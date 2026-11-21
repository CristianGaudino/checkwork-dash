# Adding a dealer

Their website, if it is ours, connects with a key the dealer's owner or manager makes in Settings (`docs/site-api.md`).

One app serves every dealer. Each dealer has a D1 database of its own (EU jurisdiction), and the directory (`DIRECTORY`) says which dealers
there are and who works at each. How they are kept apart: `docs/dealer-admin.md`, "Dealers kept apart".

Run these from the repo with a logged-in wrangler (`npx wrangler login`). The id is a slug (`example-motors`); its binding is the id in
capitals with underscores (`DB_EXAMPLE_MOTORS`).

## Once, for the app

```sh
npx wrangler d1 create checkwork-directory --jurisdiction eu
npm run directory:migrate
```

Put the id it prints into the `DIRECTORY` entry of `wrangler.jsonc` at deploy time. The repo is public: no real database id goes into it
until the owner says so.

## For each dealer

1. Create its database:

   ```sh
   npx wrangler d1 create checkwork-dealer-example-motors --jurisdiction eu
   ```

2. Bind it: add an entry to `d1_databases` in `wrangler.jsonc`, with `migrations_dir` `drizzle`:

   ```jsonc
   { "binding": "DB_EXAMPLE_MOTORS", "database_name": "checkwork-dealer-example-motors", "database_id": "REPLACE_WITH_ID", "migrations_dir": "drizzle" }
   ```

   The id stays a placeholder in the repo, as above. Deploy, so the Worker has the binding.

3. Write the dealer's profile, a JSON file kept out of the repo (it is the dealer's): their facts, their plan, where their stock comes
   from and their rules (every field: `src/lib/tenancy/profile.ts`; "Each dealer's profile" in `docs/dealer-admin.md`). Leave out what
   they do not have; anything left out is the default (the dashboard alone, stock kept here, the usual rules, no website, no logo):

   ```json
   {
     "siteUrl": "https://www.example.com",
     "phone": "+353 45 000 000",
     "email": "sales@example.com",
     "address": { "street": "Main Street", "town": "Naas", "county": "Co. Kildare", "eircode": "W91 XXXX" },
     "hours": [{ "day": "Monday", "opens": "09:00", "closes": "18:00" }, { "day": "Tuesday", "opens": "09:00", "closes": "18:00" }, { "day": "Wednesday", "opens": "09:00", "closes": "18:00" }, { "day": "Thursday", "opens": "09:00", "closes": "18:00" }, { "day": "Friday", "opens": "09:00", "closes": "18:00" }, { "day": "Saturday", "opens": "10:00", "closes": "16:00" }, { "day": "Sunday" }],
     "logo": { "onLight": "/brand/example-motors/logo-on-light.svg", "onDark": "/brand/example-motors/logo.svg" },
     "modules": "dashboard,testDrives,sales,reviews",
     "stock": { "source": "checkwork" },
     "rules": { "oldStockDays": 90 },
     "leadEmail": "sales@example.com"
   }
   ```

   - `logo` and `mark` (a square crest for the folded menu) are paths on this app: put the files in `public/brand/<dealer-id>/` and
     deploy (the app loads images from its own address only). Without a logo the menu shows the name; without a mark, the initials.
   - `modules`: ids from `src/lib/modules-rules.ts`, comma separated, or `all`. `stock.source` is `checkwork` (kept here) or `donedeal`
     (synced from `stock.listingSite`, `DoneDeal` or `CarsIreland`, with `stock.listingUrl` their page there).
   - `placeId`: their Google place, for their reviews.

4. Apply the dealer migrations to its database and add the dealer, with its profile and first owner, to the directory:

   ```sh
   node scripts/add-dealer.mjs example-motors "Example Motors" owner@example.com --remote --profile=example-motors.json
   ```

   `--demo` makes it a demo dealer (made-up records, the morning reset, the demo bar's switches, and the made-up team so the bar's roles
   have people); without `--profile` it is then the demo business. An existing dealer or member is left as it is, so it is safe to run
   again (change an existing dealer's profile as below).

5. Add the owner's email to the Cloudflare Access policy (named emails only, never Everyone: `docs/dealer-admin.md`, "Cloudflare
   Access"). The owner signs in, checks their details in Settings, Your business, adds the team in Settings, Team (which writes the
   directory), then Lead emails. Each person they add needs their email added to the Access policy too, until our own sign-in (#10).

## Every deploy

`npm run db:migrate` applies the dealer migrations to every dealer database bound in `wrangler.jsonc` (`scripts/migrate-dealers.mjs`; one
that fails is reported and the rest still run). `npm run directory:migrate` applies the directory's. Both folders are additive only
(`scripts/check-migrations.sh`).

## Changing a dealer's profile

Their name, website, phone, email, address and hours: the owner or a manager, in Settings, Your business. Everything else is ours: write
the fields to change in a JSON file and merge it in. A field given replaces that field, a group (`stock`, `rules`, `address`) is merged
one level down, `null` removes a field; the rest stays. Each page and job reads it on its next request.

```sh
node scripts/dealer-profile.mjs example-motors plan.json --remote
```

with, for example, `plan.json` holding `{ "modules": "all" }` for the Group plan, or `{ "stock": { "source": "donedeal" } }` once
their DoneDeal sync is connected.

## Pausing a dealer

Set its `status` to `paused` in the directory. Nobody can open it and no job runs for it; its database is kept.

```sh
npx wrangler d1 execute DIRECTORY --remote --command "UPDATE dealers SET status = 'paused' WHERE id = 'example-motors'"
```
