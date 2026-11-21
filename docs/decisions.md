# Decisions

What the owner has decided about the dashboard as its own product, and what is still open. New decisions go here and on an issue labelled `decision`.

## Made (owner, 2026-11-21)

| Decision | What it means |
|---|---|
| The dashboard is its own product, in this repo | The dashboard in `checkwork-demo` is archived: no new work there, and it is not deleted until the owner says so (checkwork-demo#243). |
| One shared app at `www.dash.checkwork.ie` | Every dealer signs in at the same address and sees the same design, with their own logo and name. `www.checkwork.ie` stays our own public site. |
| Hosted on Cloudflare | Workers (through OpenNext) for the app and its API, D1 for data, R2 for photos and media, cron triggers for scheduled jobs. Data in the EU jurisdiction. |
| Each dealer's records in a store of their own | One D1 database per dealer, plus a directory database that lists the dealers and who works at each (#3). |
| Sign-in: our own, Cloudflare Access for now | Access stands in front of the whole app until our own sign-in is built (#4, #10). Never Clerk or a similar service. |
| The dashboard is private (2026-11-22) | Sign-in only, no sign-up. Access lets in named emails only. No public demo of the dashboard for now: the demo dealer is for our own people. |
| The showroom demo is public and view-only (2026-11-22) | `demo.checkwork.ie` has no demo bar, dealer controls or links to a dashboard (checkwork-demo#246). |
| Dealer websites stay one repo and site per dealer | Showroom sites are made from `checkwork-demo` for each paying dealer and talk to this app through its site API (#7). |
| Name | Checkwork, for now. |
| Repo visibility | Public for now; the owner makes it private when ready (#13). |

## Open (#14)

### App Store and Play Store
Recommended: start with the installable web app (#11), and list in the stores only if dealers ask, by wrapping the same app rather than writing a second one.

### Pricing
A proposal, not decided. Prices a month before VAT. It keeps the bundle prices agreed on 2026-11-20 and adds the dashboard on its own.

| | Monthly | Setup |
|---|---|---|
| Showroom (website only) | EUR 249 | EUR 950 |
| Dashboard (on its own) | EUR 249 | EUR 250 |
| Dashboard Pro (margins, social, newsletter, branches) | EUR 549, plus EUR 149 per extra branch | EUR 500 |
| Dealer = Showroom + Dashboard | EUR 449 | EUR 950 |
| Group = Showroom + Dashboard Pro, with commercial and new cars | EUR 749, plus EUR 149 per extra branch | EUR 1,950 |

- Why: of the 112 tier A and B prospects, 25 sit on a manufacturer's template or NetDirector/mtc and cannot change site, and 65 on HappyDealer or CarsIreland can start with the dashboard and move their site later.
- The dashboard on its own needs leads from websites that are not ours first (#12).
- Usage prices, allowances and limits stay as they are. Staff logins stay unlimited.

### Dealer websites in one shared app
Today one repo and site per dealer. Revisit at about 10 live dealers.

### Own sign-in
Passkeys first, an emailed link as the fallback (#10). Design and security review before code.
