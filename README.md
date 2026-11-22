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

Checks before a pull request (`.claude/CLAUDE.md`; CI and E2E run the same on the pull request):

```sh
npm run lint
npm run typecheck
npm test
bash scripts/check-migrations.sh main
npm run stock:redate   # sold cars back inside the 30 day window; restore the two JSON files afterwards
APP_ENV=production NEXT_PUBLIC_ADMIN_OPEN=1 NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB npm run build
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

### GitHub Actions: CI, releases and deploys

| Workflow | Runs | What it does |
|---|---|---|
| `ci.yml` | every pull request | lint, typecheck, unit tests, `scripts/check-migrations.sh` against the base branch |
| `e2e.yml` | every pull request | `stock:redate`, a production build (`APP_ENV=production NEXT_PUBLIC_ADMIN_OPEN=1 NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB`), Playwright; the report is kept if it fails |
| `deploy.yml` | a merge to `main` (dev), a manual run, `release.yml`, `preview.yml` | lint and unit tests, then `npm run deploy` (dev) or `deploy:prod`, then checks the site answers |
| `release.yml` | by hand, from `main` | next version, pre-release with notes, deploy that tag to production, then mark it latest |
| `preview.yml` | by hand | deploys a chosen branch to dev |

The flow: a pull request runs CI and E2E. A merge deploys **dev**. A **release** puts `main` into production: Actions,
Release, Run workflow, pick major, minor or patch (the first is `v1.0.0`). The release stays a pre-release until its deploy and the check
pass, then becomes the latest. **Roll back** with Actions, Deploy, Run workflow, environment `production`, ref an older tag. Production
deploys only a release tag from there, and the workflow (and `scripts/deploy.mjs`) refuse a commit that is not on `main`. After a rollback, mark the older release as the latest: `gh release edit vX.Y.Z --latest`. If a release's deploy fails, fix the cause and use "Re-run failed jobs" on that Release run (the tag stays, so the next version is not skipped); the release becomes the latest when it passes. Deploys to one environment
queue, never overlap. The Cloudflare secrets reach only the migrate and deploy step and the live-version check: never install, lint, the tests or the build. The check reads the Worker's live deployment and fails unless one version has 100% and is tagged with the deployed commit. By hand, `npm run deploy:prod` from a laptop with a logged-in wrangler does the same steps, for when Actions is down.

Owner checklist, once (Settings of the repo on GitHub):
1. Secrets and variables, Actions, New repository secret: `CLOUDFLARE_ACCOUNT_ID` = `bae1b8428c712c6a44a214e2b25b674c` (not secret, kept
   as one like the other repos), and `CLOUDFLARE_API_TOKEN` (below). Nothing else is needed: the E2E run uses no Cloudflare account, and
   the Worker's own secrets (`CRON_KEY` and so on) live on the Workers.
2. The token: Cloudflare dashboard, My Profile, API Tokens, Create Token, template **Edit Cloudflare Workers**, then change it. Add:
   Account D1 Edit. Keep: Workers Scripts Edit, Account Settings Read, Workers R2 Storage Edit. Zone `checkwork.ie`: Workers Routes Edit
   (plus Zone Read if wrangler fails looking up the zone). Remove from the template: KV, Pages, Tail, User Details, Memberships. Set
   Account Resources to this account and Zone Resources to `checkwork.ie`. If a deploy fails with an error naming a permission, add that one.
3. Optional: Branches, add a rule for `main`: require a pull request and the status checks `check` (CI) and `e2e` (E2E). Under
   Environments nothing is needed (the workflows use none).
4. Settings, Rules, Rulesets, New tag ruleset: target tags `v*`, restrict updates and deletions (so a release tag cannot be moved), and
   let only repository admins bypass. Restricting creations too would block the Release workflow's own `GITHUB_TOKEN`, so leave that
   off. The deploy checks that a production tag is a commit on `main`, but a ruleset also keeps a release tag where it was made. Remember that anyone with write access can run Deploy by hand, so they can put any branch
   on dev (Preview) and any release tag on production: give write access only to people you trust with both.
5. First check: Actions, Deploy, Run workflow, environment dev. Then, when ready, Release, minor (`v1.0.0`).

### Going live (#9)

- [x] D1 databases in each environment, EU: `checkwork-directory` and `checkwork-dealer-checkwork-motors`; `checkwork-dev-directory` and
  `checkwork-dev-dealer-checkwork-motors`. Their ids are in `wrangler.jsonc`.
- [x] R2 buckets, EU: `checkwork-dash-files` and `checkwork-dash-dev-files`.
- [x] Workers `checkwork-dash` (custom domains `www.dash.checkwork.ie`, `dash.checkwork.ie`) and `checkwork-dash-dev`
  (`dev.dash.checkwork.ie`).
- [ ] Cloudflare Access for each host, named emails only, with the Bypass applications for `/api/site/*` and `/api/owner/*` on each
  (`docs/dealer-admin.md`, "Cloudflare Access"); each application's audience tag and the team domain into `wrangler.jsonc` `vars`.
- [ ] Secrets in each environment: `CRON_KEY` and the others in `.env.example` (`wrangler secret put <NAME>`, add `--env production`).
  `SITE_PHOTO_SECRET` is needed before a dealer's website can show photos added in the dashboard (`docs/site-api.md`, "Car photos").
- [ ] Push notifications in each environment (#11, a key pair of its own each): `node scripts/vapid-keys.mjs` for dev, or
  `node scripts/vapid-keys.mjs --env production`. It prints the two steps: `VAPID_PUBLIC_KEY` into that environment's `vars` in
  `wrangler.jsonc` or as a secret (never both), and `npx wrangler secret put VAPID_PRIVATE_KEY` (add `--env production`). Until both are set,
  Settings says notifications are not set up yet and nothing is sent.
- [ ] The GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for the deploy workflow (checklist above).
- [ ] The first deploy and migrations of each: `npm run deploy`, then `npm run deploy:prod`.
- [ ] The demo dealer in each directory: `node scripts/add-dealer.mjs checkwork-motors "Checkwork Motors" <owner email> --remote --demo`
  (add `--env production`), then its stock: `npm run stock:seed && npm run db:seed` (`db:seed:prod`).
