# checkwork-dash

The Checkwork dealer dashboard: leads, test drives, stock, customers, sales, marketing, reports and billing for a car dealer. One shared
app at https://www.dash.checkwork.ie, behind Cloudflare Access. Each dealer's website is a separate app made from
[checkwork-demo](https://github.com/CristianGaudino/checkwork-demo). Each dealer's records live in a D1 database of its own, and a
directory lists the dealers and who works at each (`docs/new-dealer.md`). The demo dealer, Checkwork Motors, has made-up records.

Next.js 16 (App Router), Tailwind CSS v4, Cloudflare Workers through OpenNext, D1 with Drizzle, Vitest and Playwright.

## Run it

Node 24 (`.nvmrc`).

```sh
npm ci
npm run dev            # http://localhost:3000, open with no sign-in, demo records and stock from src/lib/stock/demo-cars.json
```

Checks before a pull request (`.claude/CLAUDE.md`):

```sh
npm run lint
npm run typecheck
npm test
bash scripts/check-migrations.sh main
npm run stock:redate   # sold cars back inside the 30 day window; restore the two JSON files afterwards
APP_ENV=production NEXT_PUBLIC_ADMIN_OPEN=1 npm run build
APP_ENV=production NEXT_PUBLIC_ADMIN_OPEN=1 npm run e2e
```

Settings are listed in `.env.example`. How the dashboard works: `docs/dealer-admin.md`. The Worker's set-up (D1, R2, Access, crons):
`wrangler.jsonc`.

## Two environments: dev by default, production only with `--env production`

| | dev (the default) | production |
|---|---|---|
| Address | https://dev.dash.checkwork.ie | https://www.dash.checkwork.ie (and `dash.checkwork.ie`, which redirects) |
| Worker | `checkwork-dash-dev` | `checkwork-dash` |
| Databases | `checkwork-dev-directory`, `checkwork-dev-dealer-<id>` | `checkwork-directory`, `checkwork-dealer-<id>` |
| Photos (R2, EU) | `checkwork-dash-dev-files` | `checkwork-dash-files` |
| In `wrangler.jsonc` | the top level | `env.production` |

Nothing is shared: not a database, bucket, rate limit counter, secret or Access application. Plain `wrangler`, every npm script and
every script in `scripts/` act on dev. Production takes `--env production` on wrangler, or an npm script ending in `:prod`. The scripts
print the environment and database before they touch it, and refuse an unknown flag, any other `--env`, or a shell with `CLOUDFLARE_ENV`
set. `src/lib/environments.test.ts` keeps the two apart in `wrangler.jsonc`.

```sh
npm run deploy                 # dev: OpenNext build, directory and dealer migrations, then the Worker (scripts/deploy.mjs)
npm run deploy:prod            # production, the same steps
npm run db:migrate             # dealer migrations, dev        (db:migrate:prod)
npm run directory:migrate      # directory migrations, dev     (directory:migrate:prod)
npm run stock:seed && npm run db:seed    # the demo stock into checkwork-motors, dev (db:seed:prod); refused for a dealer that is not a demo
npx wrangler secret put CRON_KEY                     # a dev secret
npx wrangler secret put CRON_KEY --env production    # a production secret
```

The migrations run before the new code goes live, so they may only add things (`scripts/check-migrations.sh`). Adding a dealer:
`docs/new-dealer.md`, once in each environment.

A merge to `main` deploys production through `.github/workflows/deploy.yml` (lint and unit tests first), and a run from the Actions tab
deploys dev or production, or an older tag or commit to roll back. The repo's Actions minutes are often used up, so the workflow is
never the only way: `npm run deploy:prod` from a laptop with a logged-in wrangler does the same.

### Going live (#9)

- [x] D1 databases in each environment, EU: `checkwork-directory` and `checkwork-dealer-checkwork-motors`; `checkwork-dev-directory` and
  `checkwork-dev-dealer-checkwork-motors`. Their ids are in `wrangler.jsonc`.
- [x] R2 buckets, EU: `checkwork-dash-files` and `checkwork-dash-dev-files`.
- [x] Workers `checkwork-dash` (custom domains `www.dash.checkwork.ie`, `dash.checkwork.ie`) and `checkwork-dash-dev`
  (`dev.dash.checkwork.ie`).
- [ ] Cloudflare Access for each host, named emails only, with the Bypass applications for `/api/site/*` and `/api/owner/*` on each
  (`docs/dealer-admin.md`, "Cloudflare Access"); each application's audience tag and the team domain into `wrangler.jsonc` `vars`.
- [ ] Secrets in each environment: `CRON_KEY` and the others in `.env.example` (`wrangler secret put <NAME>`, add `--env production`).
- [ ] Push notifications in each environment (#11, a key pair of its own each): `node scripts/vapid-keys.mjs` for dev, or
  `node scripts/vapid-keys.mjs --env production`. It prints the two steps: `VAPID_PUBLIC_KEY` into that environment's `vars` in
  `wrangler.jsonc` or as a secret (never both), and `npx wrangler secret put VAPID_PRIVATE_KEY` (add `--env production`). Until both are set,
  Settings says notifications are not set up yet and nothing is sent.
- [ ] The GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the deploy workflow.
- [ ] The first deploy and migrations of each: `npm run deploy`, then `npm run deploy:prod`.
- [ ] The demo dealer in each directory: `node scripts/add-dealer.mjs checkwork-motors "Checkwork Motors" <owner email> --remote --demo`
  (add `--env production`), then its stock: `npm run stock:seed && npm run db:seed` (`db:seed:prod`).
