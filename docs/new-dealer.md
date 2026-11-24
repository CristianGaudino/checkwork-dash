# Adding a dealer

Their website, if it is ours, connects with a website key Checkwork makes through the owner API (`docs/owner-api.md`, "Dealer website keys"; `docs/site-api.md`). The dealer never sees it.

One app serves every dealer. Each dealer has a D1 database of its own (EU jurisdiction), and the directory (`DIRECTORY`) says which dealers
there are and who works at each. How they are kept apart: `docs/dealer-admin.md`, "Dealers kept apart".

Run these from the repo with a logged-in wrangler (`npx wrangler login`). The id is a slug (`example-motors`); its binding is the id in
capitals with underscores (`DB_EXAMPLE_MOTORS`).

## Two environments

The app runs twice, fully apart: **dev** (`dev.dash.checkwork.ie`, Worker `checkwork-dash-dev`) and **production**
(`www.dash.checkwork.ie`, Worker `checkwork-dash`). Each has its own databases, photo bucket, rate limit counters, secrets and Access
application (`wrangler.jsonc`).

- **Dev is the default.** Every command and script below, and plain `wrangler`, acts on dev.
- **Production only with `--env production`** (or an npm script ending in `:prod`). The scripts print which environment and database
  they are about to touch (`production: checkwork-directory`), refuse any other `--env` value or an unknown flag, and refuse to run while
  `CLOUDFLARE_ENV` is set in the shell, so nothing reaches production by default or by a typo.

| | dev | production |
|---|---|---|
| Directory | `checkwork-dev-directory` | `checkwork-directory` |
| A dealer | `checkwork-dev-dealer-<id>` | `checkwork-dealer-<id>` |
| Photos (R2) | `checkwork-dash-dev-files` | `checkwork-dash-files` |

Adding a dealer means a database in each environment, bound in each (below), and adding it to each directory.

## Once, for the app

The directories exist (#9). How they were made, and their migrations (`npm run deploy` and `deploy:prod` run these too):

```sh
npx wrangler d1 create checkwork-dev-directory --jurisdiction eu
npx wrangler d1 create checkwork-directory --jurisdiction eu
npm run directory:migrate            # dev
npm run directory:migrate:prod       # production
```

Each id goes into its `DIRECTORY` entry in `wrangler.jsonc`: the top level for dev, `env.production` for production. Database ids are not
secrets.

## For each dealer

1. Create its database in each environment:

   ```sh
   npx wrangler d1 create checkwork-dev-dealer-example-motors --jurisdiction eu
   npx wrangler d1 create checkwork-dealer-example-motors --jurisdiction eu
   ```

2. Bind each: add an entry to `d1_databases` in `wrangler.jsonc`, with `migrations_dir` `drizzle`, at the top level (dev) and in
   `env.production` (wrangler does not pass bindings down to an environment):

   ```jsonc
   // top level (dev)
   { "binding": "DB_EXAMPLE_MOTORS", "database_name": "checkwork-dev-dealer-example-motors", "database_id": "<dev id>", "migrations_dir": "drizzle" }
   // env.production
   { "binding": "DB_EXAMPLE_MOTORS", "database_name": "checkwork-dealer-example-motors", "database_id": "<production id>", "migrations_dir": "drizzle" }
   ```

   `src/lib/environments.test.ts` checks the two stay apart (dev names start `checkwork-dev-`, no id or name shared). Deploy, so each
   Worker has the binding.

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

   - `logo` is paths on this app: put the files in `public/brand/<dealer-id>/` and deploy (the app loads images from its own address
     only). Without a logo the menu shows the name.
   - `modules`: ids from `src/lib/modules-rules.ts`, comma separated, or `all`. `stock.source` is `checkwork` (kept here) or `donedeal`
     (synced from `stock.listingSite`, `DoneDeal` or `CarsIreland`, with `stock.listingUrl` their page there).
   - `placeId`: their Google place, for their reviews.

4. Apply the dealer migrations to its database and add the dealer, with its profile and first owner, to the directory. Once in each
   environment:

   ```sh
   node scripts/add-dealer.mjs example-motors "Example Motors" owner@example.com --remote --profile=example-motors.json                    # dev
   node scripts/add-dealer.mjs example-motors "Example Motors" owner@example.com --remote --profile=example-motors.json --env production   # production
   ```

   `--demo` makes it a demo dealer (made-up records, the morning reset, the demo bar's switches, and the made-up team so the bar's roles
   have people); without `--profile` it is then the demo business. An existing dealer or member is left as it is, so it is safe to run
   again (change an existing dealer's profile as below).

5. Add the owner's email to the Cloudflare Access policy of each host they use (named emails only, never Everyone: `docs/dealer-admin.md`, "Cloudflare
   Access"). The owner signs in, checks their details in Settings, Your business, adds the team in Settings, Team (which writes the
   directory), then Lead emails. Each person they add needs their email added to the Access policy too, until our own sign-in (#10).

6. If their website is ours: make its key with the owner API in each environment (`POST /api/owner/v1/dealers/<id>/site-keys`,
   `docs/owner-api.md`) and set it on the website. The answer is the only time the key is shown.

## A dealer whose stock is synced (DoneDeal or CarsIreland)

DoneDeal's API is for the dealer's own site, with their written consent, and its key is given per dealer (CarsIreland works the same way).
In this order:

1. The dealer gives Checkwork written consent to read their ads through the API and show them on their dashboard and website (keep it
   with the contract, out of the repo).
2. The dealer confirms the relationship to DoneDeal (or CarsIreland) themselves, so the listing site knows Checkwork acts for them.
3. DoneDeal issues the key. Set it with the owner API in each environment that uses it (`PUT /api/owner/v1/dealers/<id>/keys/donedeal`
   with `{"DONEDEAL_API_KEY": "..."}`, `docs/owner-api.md`), then set `{ "stock": { "source": "donedeal" } }` in their profile (below).

If DoneDeal later refuses the key on two syncs in a row, the sync removes the synced cars by itself (`docs/dealer-admin.md`, "Listing site stock").

## A dealer leaving

When a synced dealer leaves Checkwork or withdraws consent, their synced data goes at once. In each environment:

1. Remove the listing site key: `DELETE /api/owner/v1/dealers/<id>/keys/donedeal` (`docs/owner-api.md`). For a dealer whose stock is
   synced, this also removes every synced car and any photos stored for it, recorded in Activity as by Checkwork. Do this before changing
   `stock.source`: a dealer whose stock is kept here never has cars removed this way.
2. Tell DoneDeal (or CarsIreland) that access has ended, so they revoke the key.
3. Pause the dealer (below). The dealer's own records (sales, leads and so on) stay in its database until the contract says otherwise.

## Every deploy

`npm run deploy` (dev) and `npm run deploy:prod` (production) run them for you (`scripts/deploy.mjs`). By hand: `npm run db:migrate` applies
the dealer migrations to every dealer database bound in that environment (`scripts/migrate-dealers.mjs`; one that fails is reported and
the rest still run), `npm run directory:migrate` the directory's; add `:prod` for production. Both folders are additive only
(`scripts/check-migrations.sh`).

## Changing a dealer's profile

Their name, website, phone, email, address and hours: the owner or a manager, in Settings, Your business. Everything else is ours: write
the fields to change in a JSON file and merge it in. A field given replaces that field, a group (`stock`, `rules`, `address`) is merged
one level down, `null` removes a field; the rest stays. Each page and job reads it on its next request.

```sh
node scripts/dealer-profile.mjs example-motors plan.json --remote                    # dev
node scripts/dealer-profile.mjs example-motors plan.json --remote --env production   # production
```

with, for example, `plan.json` holding `{ "modules": "all" }` for Website + Dashboard with Social and ads, or `{ "stock": { "source": "donedeal" } }` once
their DoneDeal sync is connected.

## Pausing a dealer

Set its `status` to `paused` in the directory. Nobody can open it and no job runs for it; its database is kept.

```sh
npx wrangler d1 execute DIRECTORY --remote --env production --command "UPDATE dealers SET status = 'paused' WHERE id = 'example-motors'"
```

Without `--env production` this pauses it in dev.
