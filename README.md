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
`wrangler.jsonc`, whose ids marked REPLACE the owner fills in before the first deploy.
