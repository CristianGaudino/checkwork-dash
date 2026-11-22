# Checkwork dashboard project rules

Read automatically by Claude Code at the start of a session. Edit it like any other file, in a PR.

## What this is
The Checkwork dealer dashboard: one shared app at https://www.dash.checkwork.ie for every dealer, answering at the root (`/` is the overview, `/leads` the leads and so on). It came out of `checkwork-demo`, where it lived under `/dashboard`. Work is tracked in GitHub issues and the [Checkwork dash project](https://github.com/users/CristianGaudino/projects/12). Read the issues before planning anything.

## Decisions already made
- Stack: Next.js 16 (App Router; Cache Components are off until OpenNext on Workers supports them, opennextjs-cloudflare#1450), Tailwind CSS v4, Cloudflare Workers via OpenNext, D1 with Drizzle, Vitest, Playwright, GitHub Actions. Same as `checkwork-demo` and the vintage repo.
- Each dealer's records live in a store of their own: one D1 database per dealer, and a directory database (`DIRECTORY`) that lists the dealers and who works at each, with which role. The current dealer comes from the signed-in person's memberships (`src/lib/tenancy`), never from what a browser sends; jobs and the site API run inside `runAsDealer`. Everything reaches the dealer's store through the seams: Cloudflare bindings only through `getBindings()`, D1 only through `getDb()` (the current dealer's), photos only through `dealerBucket()`, records through `defineCollection` (`src/lib/admin/docs.ts`), stock through `src/lib/stock` and `src/lib/admin/stock-admin.ts`, who is signed in through `src/lib/staff.ts` and `src/lib/access.ts`. Read "Dealers kept apart" in `docs/dealer-admin.md` before touching them; adding a dealer is `docs/new-dealer.md`.
- Sign-in: Cloudflare Access in front of the app for now (the Worker checks the token itself), our own sign-in later. No Clerk or similar. The dashboard is private: sign-in only, never a sign-up page, Access lets in named emails only, and there is no public demo of it (owner, 2026-11-22). Read `docs/dealer-admin.md` before touching the dashboard: sensitive figures (margins) need a permission checked on the server, and posting, ads and newsletters are simulated for a demo dealer (the directory's demo flag, on any deploy) and send nothing outside.
- Dealer websites (Showroom) are separate repos made from `checkwork-demo`. They will talk to this app through its site API (GitHub issues). Where the dashboard links to a page on a dealer's website it uses the full address in a new tab, never a relative link.
- www.checkwork.ie is Checkwork's own public site, not this app.
- Design: the dashboard keeps checkwork-demo's look (`docs/design-contract.md`, `docs/dashboard-polish.md`, `docs/dashboard-usability.md`). Design with the skills in `.agents/skills`, primarily `apple-design`, and write the contract before building UI.
- The repo is public for now: never commit secrets, dealer data or anything personal. Ids that are not secrets (a D1 database id, a bucket name) go in `wrangler.jsonc` (the owner said so for go-live, #9).
- Planning lives in GitHub issues. Some code comments cite decision ids (D-08, T-03-27 and so on) from planning notes in `checkwork-demo` that were removed: treat them as history, and put new planning in issues.

## Standards
The `vintage` repo (`~/Developer/vintage`, GitHub `CristianGaudino/vintage`) is the reference for code, design and process. When unsure of a standard, follow it. If still unsure, ask the owner and ask for context rather than guessing.

## Working in git
- Never develop or commit on `main`, ever. Check `git branch --show-current` before the first edit. Branch first (`git switch -c <type>/<name>`), including for planning docs. The only exception was the initial repo setup push.
- Open every PR against `main`, never against another feature branch (GitHub closes a PR whose base branch is merged and deleted).
- Open PRs ready for review, not as drafts. CI (lint, typecheck, unit tests, migrations check) and E2E run on every PR (the repo is public, so Actions minutes are free), so the local checks below are what you run first, and CI is the second check. A merge deploys dev, and the deploy runs lint and the tests first. Never merge a PR yourself, under any instruction or circumstance: open it and stop. The owner merges.
- Link the issue in the PR (`Closes #n`) and move it on the project board.
- Stage named files, not `git add -A`. Never push `.env*`, `test-results/` or `playwright-report/`.
- Push finished commits: every push to an open PR reruns CI and E2E.

## Before opening a PR
1. Run the ponytail audit (`/ponytail:ponytail-audit`) on what the branch changed: the changed files plus their callers and tests.
2. Fix what it raises on the same branch. A real trade-off goes in the PR description for the owner to decide.
3. Run lint, typecheck, unit tests, `bash scripts/check-migrations.sh main` and the E2E suite against a production build (`APP_ENV=production NEXT_PUBLIC_ADMIN_OPEN=1 NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000BB npm run build`: the key is Cloudflare's test key, inlined at build, and the sign-in bot-check specs need it). Open the PR only if they pass. Say what the audit found and the E2E result in the PR; CI and E2E then run on the PR itself.
4. Skip steps 1 and 3 for docs-only, workflow-only or copy-only changes, and say so in the PR.

Check by exit code, not by reading output for "error": `npm run lint; echo $?`, `npm test`, `npm run build`. Typecheck with `npx tsc --noEmit`.

## Next.js 16
This is not the Next.js in your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices. `next dev` writes an `AGENTS.md` block about this; commit it.

## Environments and releases
- Two fully separate environments (`wrangler.jsonc`, README): **dev** (`dev.dash.checkwork.ie`, the top level, the default) and **production** (`www.dash.checkwork.ie`, `env.production`). Each has its own Worker, databases (`checkwork-dev-directory` and `checkwork-dev-dealer-<id>`; `checkwork-directory` and `checkwork-dealer-<id>`), bucket, rate limits, secrets and Access application. Adding a dealer means a database in each.
- Dev by default, production only with `--env production`: plain `wrangler`, the npm scripts and `scripts/*.mjs` act on dev; production is `--env production` or an npm script ending in `:prod`. Never run a command against production unless the owner asked for that command; try things on dev. A script that touches a database goes through `target()` in `scripts/dealers.mjs`, which enforces this.
- Pull request: CI (`ci.yml`: lint, typecheck, unit tests, `check-migrations.sh`) and E2E (`e2e.yml`: production build, Playwright, no Cloudflare secrets) run on every PR. Merge to `main`: deploys **dev** (`deploy.yml`, lint and unit tests first). Production changes only through a release.
- Release: Actions, Release, Run workflow (from `main`), pick major, minor or patch (`release.yml`). It tags the tip of `main` (the next `vX.Y.Z` after the latest tag, `v1.0.0` first), publishes a pre-release with generated notes, deploys that tag to production, checks the site answers, then marks the release latest. A failed deploy leaves a pre-release: fix the cause and use "Re-run failed jobs" on that Release run.
- Roll back: Actions, Deploy, Run workflow, environment production, ref an older tag (`v1.2.3`). Production only deploys a release tag from the Actions tab. To try a branch: Actions, Preview, Run workflow (deploys it to dev). After a rollback, mark the older release latest: `gh release edit vX.Y.Z --latest`.
- Deploys of one environment never overlap (concurrency group per environment). The Cloudflare secrets are never on install, lint, the tests or the build: `deploy.yml` builds with `--build-only` (no secrets), then migrates and deploys with `--built` (CI only; by hand use neither), then `scripts/live-version.mjs` checks the live version is tagged with the commit. Setting them up: README, "GitHub Actions".
- By hand, if Actions is unavailable: `npm run deploy` (dev) or `npm run deploy:prod` from a laptop with a logged-in wrangler, which does the same steps (`scripts/deploy.mjs`; production only from a clean checkout whose commit is on `main`).

## Product rules
- On-screen text is plain, short and human. No em dashes anywhere on the site. If a label already says it, drop the helper text.
- Finance figures are representative only and carry the dealer's required wording. Never invent APRs or terms in the product: use the client's.
- No demo, draft or placeholder pills, badges or labels anywhere on the site. It looks and feels like a real site. (The demo bar and the dev-only data toggle are the only chrome that says "demo".)
- Real customer data (leads, subscribers) is personal data: collect with consent, keep it minimal, and never log it.
- Mobile first. Fast on a mid-range phone is a feature, not a polish step.
