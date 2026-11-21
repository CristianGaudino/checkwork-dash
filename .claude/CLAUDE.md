# Checkwork dashboard project rules

Read automatically by Claude Code at the start of a session. Edit it like any other file, in a PR.

## What this is
The Checkwork dealer dashboard: one shared app at https://www.dash.checkwork.ie for every dealer, answering at the root (`/` is the overview, `/leads` the leads and so on). It came out of `checkwork-demo`, where it lived under `/dashboard`. Work is tracked in GitHub issues and the [Checkwork dash project](https://github.com/users/CristianGaudino/projects/12). Read the issues before planning anything.

## Decisions already made
- Stack: Next.js 16 (App Router; Cache Components are off until OpenNext on Workers supports them, opennextjs-cloudflare#1450), Tailwind CSS v4, Cloudflare Workers via OpenNext, D1 with Drizzle, Vitest, Playwright, GitHub Actions. Same as `checkwork-demo` and the vintage repo.
- Each dealer's records live in a store of their own: one D1 database per dealer. Today the app still serves one dealer (the demo dealer, Checkwork Motors, with its seeded records). Keep the seams the next steps build on: Cloudflare bindings only through `getBindings()`, D1 only through `getDb()`, records through `defineCollection` (`src/lib/admin/docs.ts`), stock through `src/lib/stock` and `src/lib/admin/stock-admin.ts`, who is signed in through `src/lib/staff.ts` and `src/lib/access.ts`.
- Sign-in: Cloudflare Access in front of the app for now (the Worker checks the token itself), our own sign-in later. No Clerk or similar. Read `docs/dealer-admin.md` before touching the dashboard: sensitive figures (margins) need a permission checked on the server, and posting, ads and newsletters are simulated on the demo (`SIMULATE_INTEGRATIONS=off` for a real deploy) and send nothing outside.
- Dealer websites (Showroom) are separate repos made from `checkwork-demo`. They will talk to this app through its site API (GitHub issues). Where the dashboard links to a page on a dealer's website it uses the full address in a new tab, never a relative link.
- www.checkwork.ie is Checkwork's own public site, not this app.
- Design: the dashboard keeps checkwork-demo's look (`docs/design-contract.md`, `docs/dashboard-polish.md`, `docs/dashboard-usability.md`). Design with the skills in `.agents/skills`, primarily `apple-design`, and write the contract before building UI.
- The repo is public for now: never commit secrets, dealer data or anything personal. Ids that are not secrets (a D1 database id, a bucket name) still go in only when the owner says so.
- Planning lives in GitHub issues. Some code comments cite decision ids (D-08, T-03-27 and so on) from planning notes in `checkwork-demo` that were removed: treat them as history, and put new planning in issues.

## Standards
The `vintage` repo (`~/Developer/vintage`, GitHub `CristianGaudino/vintage`) is the reference for code, design and process. When unsure of a standard, follow it. If still unsure, ask the owner and ask for context rather than guessing.

## Working in git
- Never develop or commit on `main`, ever. Check `git branch --show-current` before the first edit. Branch first (`git switch -c <type>/<name>`), including for planning docs. The only exception was the initial repo setup push.
- Open every PR against `main`, never against another feature branch (GitHub closes a PR whose base branch is merged and deleted).
- Open PRs ready for review, not as drafts. CI runs only by hand (Actions minutes): merges deploy, and the deploy runs lint and the tests first, so the local checks below are the gate. Never merge a PR yourself, under any instruction or circumstance: open it and stop. The owner merges.
- Link the issue in the PR (`Closes #n`) and move it on the project board.
- Stage named files, not `git add -A`. Never push `.env*`, `test-results/` or `playwright-report/`.
- GitHub Actions minutes are limited and shared. Push fewer, finished commits.

## Before opening a PR
1. Run the ponytail audit (`/ponytail:ponytail-audit`) on what the branch changed: the changed files plus their callers and tests.
2. Fix what it raises on the same branch. A real trade-off goes in the PR description for the owner to decide.
3. Run lint, typecheck, unit tests, `bash scripts/check-migrations.sh main` and the E2E suite against a production build. Open the PR only if they pass. Say what the audit found and the E2E result in the PR.
4. Skip steps 1 and 3 for docs-only, workflow-only or copy-only changes, and say so in the PR.

Check by exit code, not by reading output for "error": `npm run lint; echo $?`, `npm test`, `npm run build`. Typecheck with `npx tsc --noEmit`.

## Next.js 16
This is not the Next.js in your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing code, and heed deprecation notices. `next dev` writes an `AGENTS.md` block about this; commit it.

## Releases
There is no deploy workflow in this repo yet; it comes with the first deploy, as in `checkwork-demo` (every merge to `main` deploys to production through deploy.yml, the Release workflow only tags and publishes notes, roll back by running Deploy from the Actions tab with an older tag or commit). Move to release-tag deploys, as in vintage, once real dealers use the app.

## Product rules
- On-screen text is plain, short and human. No em dashes anywhere on the site. If a label already says it, drop the helper text.
- Finance figures are representative only and carry the dealer's required wording. Never invent APRs or terms in the product: use the client's.
- No demo, draft or placeholder pills, badges or labels anywhere on the site. It looks and feels like a real site. (The demo bar and the dev-only data toggle are the only chrome that says "demo".)
- Real customer data (leads, subscribers) is personal data: collect with consent, keep it minimal, and never log it.
- Mobile first. Fast on a mid-range phone is a feature, not a polish step.
