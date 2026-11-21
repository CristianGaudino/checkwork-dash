# Adding a dealer

One app serves every dealer. Each dealer has a D1 database of its own (EU jurisdiction), and the directory (`DIRECTORY`) says which dealers
there are and who works at each. How they are kept apart: `docs/dealer-admin.md`, "Dealers kept apart".

Run these from the repo with a logged-in wrangler (`npx wrangler login`). The id is a slug (`murphy-motors`); its binding is the id in
capitals with underscores (`DB_MURPHY_MOTORS`).

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
   npx wrangler d1 create checkwork-dealer-murphy-motors --jurisdiction eu
   ```

2. Bind it: add an entry to `d1_databases` in `wrangler.jsonc`, with `migrations_dir` `drizzle`:

   ```jsonc
   { "binding": "DB_MURPHY_MOTORS", "database_name": "checkwork-dealer-murphy-motors", "database_id": "REPLACE_WITH_ID", "migrations_dir": "drizzle" }
   ```

   The id stays a placeholder in the repo, as above. Deploy, so the Worker has the binding.

3. Apply the dealer migrations to it and add the dealer with its first owner to the directory:

   ```sh
   node scripts/add-dealer.mjs murphy-motors "Murphy Motors" owner@example.com --remote
   ```

   `--demo` makes it a demo dealer (made-up records, the morning reset, and the made-up team so the demo bar's roles have people). An
   existing dealer or member is left as it is, so it is safe to run again.

4. The photo bucket's lifecycle rule is per dealer (a backstop for trade-in photos with no lead, `docs/lead-retention.md`):

   ```sh
   npx wrangler r2 bucket lifecycle add <bucket> delete-trade-in-photos-murphy-motors dealers/murphy-motors/trade-in/ --expire-days 365 --jurisdiction eu
   ```

5. Nothing to change in Cloudflare Access: it only proves the email (#4), and the app lets in whoever the directory has. The owner signs in,
   adds the team in Settings, Team (which writes the directory), then Lead emails.

## Every deploy

`npm run db:migrate` applies the dealer migrations to every dealer database bound in `wrangler.jsonc` (`scripts/migrate-dealers.mjs`; one
that fails is reported and the rest still run). `npm run directory:migrate` applies the directory's. Both folders are additive only
(`scripts/check-migrations.sh`).

## Pausing a dealer

Set its `status` to `paused` in the directory. Nobody can open it and no job runs for it; its database is kept.

```sh
npx wrangler d1 execute DIRECTORY --remote --command "UPDATE dealers SET status = 'paused' WHERE id = 'murphy-motors'"
```
