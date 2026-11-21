# Dealer dashboard

This app is the dealer dashboard, at the root of https://www.dash.checkwork.ie (`/` is the overview, `/leads` the leads and so on). It came out of checkwork-demo, where it lived under `/dashboard` (history). The dealer's website (Showroom) is a separate app made from checkwork-demo: where the dashboard links to a car or a page there it uses the full address (the dealer's website, `siteUrl` in their profile) in a new tab. Parts below that describe the website's pages (`/contact`, `/reviews`, `/warranty` and so on) are kept because the dashboard works on what they send. The demo bar at the foot of every page holds the theme switch, and for a demo dealer the role, plan and DoneDeal switches. There is no login of our own: on a deployed app Cloudflare Access is the login (see below). One app serves every dealer, each in a store of its own (see "Dealers kept apart"). There is no superuser role and no platform area.

## Modules

A dealer has the base site plus the modules they pay for (#173, `src/lib/modules-rules.ts`): their plan, `modules` in their profile
(see "Each dealer's profile"). A module that is off has its pages show the not-in-plan screen (each module's folder has a `layout.tsx`
with `PlanGate`, checked on the server on every load), its links leave the menus and pages (`IfModule`), and its server actions refuse
(`requireModule`, a 404). Without the dashboard module every page is the not found screen (the root layout). The proxy only checks the
Access token: it reads no directory. On a demo dealer the bar's Plan switch chooses them instead (a cookie); for any other dealer a cookie
never can. Data is never deleted when a module goes off. Stock kept in the dashboard is not a module switch: it follows where the stock
comes from.

## Usage billed per use

Registration lookups, AI actions and WhatsApp messages cost the dealer per use, on top of the plan, past the plan's monthly allowance
(#181, #223). The code that makes a paid use
counts it with `recordUsage` and asks `usageAllowed` first (`src/lib/billing/usage.ts`): past a monthly cap (the dealer's, set by the Owner
or Manager on Billing, or our ceiling) the service stops for the month and falls back (a lookup gives the plate's own facts, AI leaves the
text alone, a WhatsApp reply or alert goes by email, or nothing if the buyer gave none, and a marketing message is not sent; an alert the
plan still includes always goes). Our default limits are `DEFAULT_CEILINGS`, WhatsApp's times the branches on Group (`withBranchCeilings`). Alerts at 80% of a cap, at the cap and at amounts the dealer chose go to the owners and managers in
the bell, once a month each. Counts are one record per month per line of the bill. Prices are in `src/lib/billing/rules.ts`.

## Roles and permissions

Everyone the dashboard lets in works the everyday dashboard (leads, test drives, stock, customers, reviews, marketing). A role adds
permissions, each checked on the server in every page and action that needs it (`src/lib/permissions.ts`, rules in `permission-rules.ts`):

| Role | Margins (costs, prep and profit) | Reports | Team | Business settings | Activity history | Data requests and lead exports | Billing |
|---|---|---|---|---|---|---|---|
| Owner | Yes | The dealership's | Yes | Yes | Yes | Yes | Yes |
| Manager | Yes | The dealership's | Yes, except an owner | Yes | Yes | Yes | Yes |
| Finance | Yes | The dealership's | No | No | No | No | No |
| Sales | No | Their own, counts only | No | No | No | No | No |

- **Margins:** a Margins screen, a margin column on the stock list, a Stock margin stat on the overview and a cost price box on the car
  form. Without it none of those are in the page, and the Margins page and the cost field answer as if they were not there. Costs are kept
  in the admin store (`car-costs`), never in the public car data.
- **Team:** add people, change roles, remove people. A manager cannot add, change or remove an owner, or make anyone one. A team with an
  owner always keeps one, and the last person cannot be removed.
- **Business settings:** targets, lead emails, notifications, marketing voice and the demo reset. Others see them read only.

- **Activity history** (`/activity`): every change made in the dashboard, newest first, with who made it, filtered by area,
  person and period. Changes only, never page views. See below.

Who the person is:
- **At a demo dealer** (the directory's `demo` flag) the bar's role buttons (Owner, Manager, Sales, Finance) set a cookie the server
  reads, and the demo acts as the first team member with that role. It opens as the owner, so every feature shows. What reaches past
  the dashboard still goes by the role the directory gives the signed-in email (`realCan` in `src/lib/permissions.ts`): changing the
  team, website keys, the lead emails and the test email, the lead and customer exports and data requests. The bar's role shows those
  screens but cannot use them.
- **At any other dealer** the signed-in Access email, which the Worker verifies itself, and the role the directory gives that email at
  the dealer that is open. The bar shows the theme switch only. A new dealer's first owner is added to the directory by
  `scripts/add-dealer.mjs` (`docs/new-dealer.md`); everyone else is added in Settings, Team. A cookie never grants anything there.

## Each dealer's profile

What differs between dealers beyond their records is in their profile (#5): one JSON value per dealer in the directory
(`dealers.profile`, `src/lib/tenancy/profile.ts`), read with the dealer in the same query, once a request (`dealerAccess`) or once a job
(`runAsDealer`). Nothing about a dealer is a build setting.

- **Facts:** website (`siteUrl`, for "View your website" and car links), phone, email, address, opening hours (also the test drive
  slots), social links, and the logo (`logo.onLight`, `logo.onDark`) and square mark (`mark`) as paths on this app (`public/brand/`,
  since images load from here only). The name is the directory's `name` column. Owners and managers change the name, website, phone,
  email, address and hours in Settings, Your business (`saveBusinessAction`, in the activity history); it merges into the profile, never
  over what is ours.
- **Ours to set** (shown read only in Settings, Your plan): `modules` (the plan), `stock` (`source` "checkwork" or "donedeal",
  `listingSite`, `listingUrl`), `rules` (`oldStockDays`, `slowDropEur`, `soldVisibleDays`, `saleNudgeDays`), `placeId` (Google reviews)
  and `leadEmail` (where leads go when Settings has no address). How to set them: `docs/new-dealer.md`.
- **Defaults:** a dealer with nothing set has the dashboard alone, stock kept here, the usual rules, no website and no logo (the menu
  shows the name). A demo dealer's base is the made-up demo business (`DEMO_PROFILE`: every module, its facts and logo); the demo reset
  puts its profile back to that.
- **Billing settings** (term, branches, brands, ceilings, caps) were already per dealer: the settings record in the dealer's own store.
- **Not per dealer yet:** the time zone (Europe/Dublin for all), the finance terms (`src/lib/finance/`) and the services' keys (Worker
  secrets, ours). A lead from the site API is checked against the dealer's own opening hours (`leadSchemaFor`, docs/site-api.md).

## Dealers kept apart

One app at www.dash.checkwork.ie serves every dealer. Each dealer's leads, stock, records, activity history and photos are its own, and no
code path reaches another dealer's (#3, #4, #6; `src/lib/tenancy/`).

- **Stores.** Each dealer has a D1 database of its own (EU jurisdiction), bound in `wrangler.jsonc` as `DB_<DEALER>`. The directory
  (`DIRECTORY`, its own D1 database, `src/lib/db/directory-schema.ts`, migrations in `drizzle-directory/`) lists the dealers (id, name,
  binding, demo, active or paused) and their members (email, role). Adding one: `docs/new-dealer.md`.
- **The current dealer** (`currentDealer()` in `src/lib/tenancy/current.ts`) is the only way to a store: `getDb()` gives the current
  dealer's database, `dealerBucket()` its part of the bucket, and the record store, stock and the activity log go through them. No current
  dealer, or a dealer whose binding is missing, throws: never another dealer's store, never a shared one.
- **In a request** it comes from the signed-in person (`staffIdentity()` in `src/lib/staff.ts`, the one function our own sign-in, #10,
  replaces) and their memberships in the directory (`dealerAccess()` in `src/lib/tenancy/membership.ts`, once a request). Someone at one
  dealer gets it. Someone at several chooses (the chooser, and Switch dealer in the menu, `/dealers`); the choice is a cookie that is only a
  preference, checked against their memberships on every request and action, so a cookie, form, query or header naming another dealer opens
  nothing. An email at no dealer sees "No access" and nothing else, and every action refuses (`requireStaff()`).
- **Who is on the team and as what** is the directory's. The rest of what the dealer knows about a person (name, WhatsApp phone, alerts)
  stays in the dealer's own store, by email. Settings, Team changes both together (`changeTeamMember` in `src/lib/admin/collections.ts`):
  the directory first, so a failure there changes nothing; if the dealer's own record then fails, the directory is put back.
- **Outside a request** (the Worker's jobs, the site API) code runs inside `runAsDealer(id, fn)`, and everything in it uses that
  dealer. A job's route takes the dealer's id from the request only behind `CRON_KEY` (`dealerJob` in `src/lib/tenancy/jobs.ts`).
- **Jobs** (`worker.mjs`): each cron runs each job once per active dealer in the directory (the nightly retention purges for every dealer, paused ones too), in that dealer's database and photo prefix. One
  dealer's failure never stops the next; the run fails if any failed. Logs carry the job, the dealer's id and counts only. The demo reset
  runs for demo dealers only.
- **Photos and media** are kept in the one bucket under `dealers/<id>/` (`prefixedBucket`, `src/lib/tenancy/bucket.ts`). `/car-photos`
  and `/media-files` read under the current dealer's prefix only, so they serve a dealer's files to its own members and
  nothing to anyone else. Serving car photos to the dealer's own website is not built yet (`docs/site-api.md`).
- **The site API** (`/api/site/v1`, `docs/site-api.md`): a dealer's website sends leads and reads its cars with a key made in Settings.
  The key decides the dealer, and the work runs inside `runAsDealer`; nothing in a request can name another dealer.
- **A demo dealer** (the directory's `demo` flag) behaves as the demo on any deploy, the one shared production deploy included: its
  made-up records are seeded (`demoRecordsFor` in `src/lib/admin/docs.ts`), its outward services are simulated (`src/lib/integrations.ts`),
  its reviews are the made-up ones, its lead emails say DEMO, and the morning cron and Settings put it back to its seed. A dealer that is
  not a demo starts empty, never simulates, and never gets the reset (`resetDemoRecords` refuses). No deploy setting changes either.
- **Without D1** (`next dev`, the E2E run, unit tests) the directory and every store are in memory, kept per dealer. The directory then has
  two dealers: Checkwork Motors (the demo, with its made-up team) and Test Motors (empty, not a demo). The open app's person
  (`dev@checkwork.invalid`, `DEV_EMAIL`) is at both and opens the demo by default, with the role the demo bar picks.
- **Tests** that prove it: `src/lib/tenancy/*.test.ts` (in memory and on a SQLite database per dealer with the real migrations, through
  the real `getDb()`), `src/lib/admin/team.test.ts` and `e2e/dealers.spec.ts`.
- **Caches** that remember anything (which collections are seeded, the stock snapshot, the owner API's answers) are kept per dealer.

## Rules

- **Every dashboard action checks the login itself.** Next runs a server action on a POST to any page, so the proxy's gate on `/`
  paths is not enough: each action starts with `requireStaff()` (`src/lib/staff.ts`), which verifies the Access token and that the person
  has a dealer open (the directory), and who the person is comes from that token, never from a header. Open where the dashboard is open (development, `NEXT_PUBLIC_ADMIN_OPEN=1`).
- **Real visitor records only appear behind Cloudflare Access.** The admin shows seeded records plus what visitors send (leads, test drives, stock alerts). That is personal data, so on a deployed site the admin only answers with a valid Access token (checked in `src/proxy.ts`). `NEXT_PUBLIC_ADMIN_OPEN=1` skips the check and is for CI only: never set it on a deploy (where the directory is bound it counts for nothing, `src/lib/staff.ts` and `src/proxy.ts`). Only `next dev` is open without it. Any build, even one that forgot `APP_ENV`, is closed, and the demo bar's cookies (role, plan, stock sync) only count for a demo dealer (`demoCookie` in `src/lib/tenancy/current.ts`).
- **A demo dealer simulates the outward services and sends nothing outside, keys or not.** Posts, ads, newsletters, review replies, WhatsApp, the registration lookup, DoneDeal stock and AI writing go through `modeOf` (`src/lib/integrations.ts`; posting through `src/lib/admin/publishers.ts`). For a demo dealer each is simulated: it reports success marked `simulated`, and the admin records made-up figures so the flow can be shown. For any other dealer, with no keys they say "not connected"; with keys they say "not switched on" until the real adapter replaces the marked line. Lead email, the bot check and reviews are never simulated: Settings shows their true state. Unit tests pin all three modes.
- **What visitors send reaches the admin.** A test drive booking and a stock alert are lead types in the one lead pipeline (consent, bot check, rate limit, retention). After a lead is stored, `src/lib/admin/real-leads.ts` copies it into the admin's collections (ids start `real-`) so the dealer can work it. The daily purge deletes the copies with the lead.
- **Lead emails are a setting.** Settings, Lead emails: up to five addresses, a test button, and the dealer's profile `leadEmail` as the fallback.
- **The bell is in the app only** (`src/lib/admin/notifications.ts`). A new website request, test drive booking, warranty or order request,
  a DoneDeal ad taken down, a sync outage (once, as it starts), a lead given to you by someone else, a buyer's WhatsApp reply, a usage
  limit or spend alert (owners and managers), and Checkwork getting your help request. Each has a heading, what happened ("Test drive
  request", "Monthly limit reached"), and a line under it, what it is about: for a lead the contact form's topic and answers as the leads
  list tags them ("Buying, this week, trade-in"), the car, and for a test drive the day and time asked for. The heading of a lead is its
  kind (`LEAD_TYPE_LABELS`), the same words as the leads list. Never a customer's name, email or phone, so they are not personal data. Read per person; kept 60 days. No email: the lead emails above are the email. Three of them also go to the phone, for those who turned that on
  (below, "The app on the phone").
- **No demo, draft or placeholder labels on the public site.** The demo bar and the dev-only data toggle are the only chrome that says "demo".
- All names, emails, numbers and figures in the admin are made up. Emails use `example.com`.

## Activity history

Every dashboard action records what it changed through `logActivity` (`src/lib/admin/activity.ts`), in the `activity` table (memory
with no D1). The actor is the signed-in person (`currentMember`), or a named one such as the stock sync.
- **Changes only:** a price from and to, a lead moved from New to Contacted, a role changed, a post published. Never page views, and never
  what a customer wrote (a note is "Added a note", not its text).
- **No names of customers kept:** an entry about a lead, a test drive, an alert, a subscriber or a review keeps only its kind and id. The
  page reads the name from the live record, so once the record is deleted (the lead purge, an erasure request) the entry says "A deleted
  lead". Cars, posts, newsletters and team members keep their label.
- **Best effort:** a log that cannot be written never stops the change; the failure is logged without the entry.
- **Kept 12 months** (`ACTIVITY_RETENTION_MONTHS`), then deleted by the daily job in `worker.mjs`, which logs `{"job":"purge-activity"}`.
- **The demo** seeds a history of the made-up team on the seeded records; Reset demo data puts it back.

## On the website or not (our version)

- **Every car is Shown, Hidden or a Draft** (`listing` on the car). Hidden cars and drafts are left out by the stock engine itself
  (`src/lib/stock/engine.ts`), so no list, count, page or sitemap has them and their link is not found. A new car can be saved as a draft;
  its listing date (days in stock) is set when it first goes on the website. Anyone on the team can hide, show or publish, from the
  stock list or the car's page (with Undo); Save changes on the car form never changes it. Deleting is for owners and managers.
- **"For sale"** in the dashboard (`forSale`) means on the website and not sold: posts, test drives and the overview use it. Margins and
  stock age still count a hidden car, since it is stock the dealer owns.
- **Several cars at once** (#104): tick cars on Stock, then drop their price (euros or up to 50%), mark them sold, or delete them
  (owners and managers). One confirm for the lot; each car is recorded in Activity as if changed on its own. Sold cars keep their
  price, and a car with a deposit held is neither sold nor deleted until its reservation is ended. Marked sold this way, each car keeps
  its Record sale button.
- **Photos** (#21): on the car's page, add several at once, choose the main one, remove one. The browser shrinks each to a 1,600px
  JPEG (dropping its location data) and the server checks the bytes. On the Worker they are stored in R2 under `dealers/<dealer>/cars/{id}/`
  in the `LEAD_PHOTOS` bucket and served by `/car-photos`, which serves that
  prefix only, the current dealer's, to its members. With no
  bucket (dev, E2E) a photo stays in the car as a `data:` URL, in memory. Deleting a car deletes its stored photos. The demo's deploy
  still reseeds the stock, so photos added on the demo go at the next deploy.

## Confirm and Undo

- Anything that cannot be taken back asks first (`ActButton` with `confirm`): delete a car, a post, an ad or a newsletter, send a
  newsletter, publish a post or start an ad, remove or pause a stock alert, unsubscribe, remove a team member or a prep cost, reset the demo.
- What can be taken back runs at once and offers Undo in the toast: hide, show and publish a car, a test drive's status.

## Sales and follow-ups

- **A sale** (`salesStore`, one per car): the price it sold for, the day, who sold it and the buyer, a customer on file or a new one made
  on the form. In our version Mark sold opens the form and marks the car sold on the sale's day. In the DoneDeal version the dealer
  answers for a car whose ad came down, and the Sold view on Stock (Record sale) asks for a sold car with none. Margins use the sale price
  for a sold car. After six years the daily job removes the buyer from sales, deposits, warranty claims and factory orders (a claim or order
  also loses its lead, notes and fault text, as an erasure does) (`src/lib/admin/sales-purge.ts`,
  `{"job":"anonymise-sales"}`); the figures stay. /privacy says so.
- **A deposit** (`reservationsStore`, our version only): Reserve on a car for sale takes the amount, how it was paid, the day, the buyer
  and the last day it is held. The car shows as Reserved on the website, listed after the cars for sale, with no enquiry or test drive
  buttons. Mark sold turns it into the sale (the sale keeps the deposit). Owners and managers end it with the deposit refunded (all or
  part) or kept, under the dealer's own terms. Overview flags one past its date.
- **Change the sale** (owners and managers): a sale already recorded is changed from the car's page; anyone else is refused.
- **Undo sale** (owners and managers): the sale fell through before handover, or the buyer brought the car back (with the refund and the
  reason; the page says when it is within the 30-day short-term right to reject). The record is kept under its own id with
  `returnedOn` and `kind`, and reports count it under Returns, not sales. In our version a car brought back is hidden for a look over; one
  that fell through goes back on sale. With DoneDeal stock only the record changes. The car's page lists its deposits and undone sales.
  Back on sale stays only for a sold car with no sale recorded.
- **More on a sale:** the warranty (12 months included, or 24 or 36 with extended cover), a trade-in (its reg and allowance; Stock then
  offers to add it, starting the car form from the reg), and the lead it came from (one on that car, marked won).
- **A lost lead** asks why, from a fixed list, and Reports shows "Why leads were lost".
- **Test drives** still to happen can move to another time, by the same rules as a new booking.
- **A follow-up** (`followUpOn` on a lead): Tomorrow, In 3 days, Next week or a day, on the lead. Cleared when the lead is won or lost.
  Overview counts the ones due (today and overdue); the leads list filters by them. The morning email (Settings, Notifications, off by
  default) sends each salesperson theirs, and the unassigned ones to owners and managers, at 07:00 UTC (`/api/follow-ups/digest`).

## Customers and aftersales

A warranty message sent from the website is aftersales work, not a sale: it waits in Aftersales under Requests (left out of Leads, its counts,
the overview and the reports) until a claim is opened from it or it is set aside. Aftersales opens on Requests while any wait.

Customers has three lists: the customers (the Sales module) and the stock alerts and newsletter subscribers (the Newsletter module, where
visitors sign up). Each list, its actions and its export answer only with its module on; the page answers with either.


- **A customer's page** (`/customers/[id]`): how to reach them, what they bought with the warranty on each (in cover or not),
  their deposits and warranty claims, and the leads and test drives that carry their email or phone.
- **Warranty claims** (`claimsStore`, Aftersales in the menu): opened on a purchase, from the customer's page or from a warranty lead
  (the buyer is found by the lead's email or phone). In cover or not is worked out from the sale's day and cover, never typed. Open,
  Booked in, Approved, Declined, Repaired, Closed, with notes. What the repair cost the dealer is for the margins roles, and counts in the
  car's cost (`src/lib/admin/costs.ts`), so margins and the reports' profit include it.
- **From the website:** the Warranty page has a claim form (a general message from /warranty), and a message from /service is filed as
  Service. The dashboard tells them apart by the page (`src/lib/admin/real-leads.ts`); the email to the dealer is the general one.
- **Personal data:** claims are in data requests; erasure keeps the claim and its cost without the buyer, the fault or the notes. The
  six-year purge removes the buyer from old claims, as from sales and deposits.

## Factory orders (our version only)

- **Orders** (`ordersStore`, in the menu only for stock kept here): a new car ordered from the maker for a customer, with its spec, price,
  deposit, the registration period it is for (271 is January to June 2027, `src/lib/leads/reg-periods.ts`) and the month it is due. No
  maker's system is connected: the dealer moves it from Ordered to Built, On its way and Arrived as the maker says.
- **Arrived** adds the car to stock, hidden (it is sold) and reserved for the buyer with their deposit. Hand over opens Mark sold on it,
  which takes the deposit and the buyer, and marks the order Handed over. Overview counts cars arrived and waiting.
- **Cancel** (owners and managers): the deposit refunded or kept. A car that already arrived stays in stock, hidden, for the dealer to
  decide.
- **From the website:** /new-cars/order (linked from New cars) takes the make, model, spec and period as an order request (lead type
  `order`). The lead's "Place the order" starts the form, and marks the lead won. With DoneDeal stock the page is not there.
- **Personal data:** orders are in data requests and the six-year purge, like sales: the figures stay without the buyer.

## Reports and prep costs

- **Reports** (`/reports`, figures in `src/lib/admin/reports.ts`): the last 3, 6 or 12 months by month. Owners, managers and
  finance see sales, profit (sale price less cost and prep), days to sell, each salesperson, which lead sources win, stock by age and prep
  spend by kind. A salesperson sees "Your report": their cars sold, leads, leads won and follow-ups due. Counts only, no money, nobody else.
- **Prep costs** (`prepStore`, kinds in `src/lib/admin/prep.ts`): lines on a car's dashboard page (Valet, Tyres, NCT, Service, Repairs,
  Bodywork, Transport, Other), folded away until used. Margins permission only. A car's whole cost is its cost price plus its prep
  (`src/lib/admin/costs.ts`), and every margin uses it.

## Data requests and exports

- **Data requests** (`/data-requests`, `src/lib/admin/data-requests.ts`): when someone asks what we hold about them, or for it
  to be deleted (GDPR articles 15 and 17, answer within a month). Search by the email or phone they gave; the search then widens once by
  the other details their customer record and leads hold. It finds the website form submissions (D1, with their photos in R2), leads,
  test drives, stock alerts, the newsletter, the customer record and purchases. Download a copy (JSON) or erase, after ticking that it is
  the person asking. Erasure deletes the photos, then the rows and records; a purchase stays for the books without the buyer. The email or
  phone is never in an address. Each request is in the activity history, without the person.
- **CSV exports**: Leads (with the list's filters) and Customers (the open tab) for owners and managers, each recorded in Activity;
  Stock (view and search) for everyone, with cost, prep and margin only for the margins roles. A cell that starts like a formula is
  prefixed with ' so a spreadsheet never runs it (`src/lib/admin/csv.ts`).

## Reviews

- **On the site** (`/reviews`, and the strip on the home page): the reviews Google's Places API gives (up to five, most relevant first),
  as Google gives them, with the rating, the count and the way to every review on Google Maps. None are chosen or hidden by us (owner's
  decision, 2026-11-11): selecting reviews would mislead, and Irish consumer law asks traders to be open about how reviews are shown.
- **Without the dashboard** (#224) the site still shows them: the Reviews module needs nothing else, and only the dashboard page (the
  replies) also needs the dashboard. Showing needs the dealer's `placeId` (their profile) and our `GOOGLE_PLACES_API_KEY` (a Places API key from Google
  Cloud: the dealer's public listing, no sign-in by the dealer). Replying and the full list need `GOOGLE_BUSINESS_LOCATION` and
  `GOOGLE_BUSINESS_REFRESH_TOKEN` (the Business Profile API, signed in once as the profile's owner or a manager).
- **In the dashboard** a reply goes to Google first, through the Business Profile API (`postReviewReply` in `publishers.ts`, simulated on
  the demo), and is kept only once Google has it. There is no flag: Google offers no way to take one. The list itself comes from the
  Business Profile once it is connected; on the demo it is the seeded reviews.
- **Questions** (`/faq`) answers only from what the site already says (warranty, finance wording, selling, hours), so it promises nothing new.

## Listing site stock (DoneDeal or CarsIreland)

Both DoneDeal and CarsIreland offer a dealer API for the dealer's own site, and the site reads either the same way (`src/lib/donedeal/`,
named for the first). The dealer's profile names it (`stock.listingSite`, DoneDeal by default) with their page there (`stock.listingUrl`).
Below, "DoneDeal" stands for either.

A dealer whose stock is on DoneDeal (`stock.source` "donedeal" in their profile, or the demo bar's sync switch at a demo dealer) keeps one
source of truth:
cars are added, changed and sold on DoneDeal only. The dashboard never edits them; it holds only the dealer's own figures (cost).
- **The sync** (`src/lib/donedeal/sync.ts`, rules in `plan.ts`): every 15 minutes the Worker's cron calls `/api/donedeal/sync` with the
  `CRON_KEY` secret; Sync now on Stock or Overview runs the same. New ads are added and changed ones updated. A car DoneDeal no longer
  lists is hidden (its link is not found), because DoneDeal does not say why an ad came down: Stock and Overview ask the dealer whether it
  sold (the sale form, which marks it sold so its page shows Sold for a while) or did not (it stays hidden). If the ad goes up again the car
  comes back. Each change is in the activity history as "DoneDeal sync".
- **Improve this description** (#225, with the AI module): a car opens on its dashboard page, where AI rewrites the feed's description
  from the car's facts (an AI action like any draft: the monthly cap and usage) and "Copy for DoneDeal" copies it to paste into the ad.
  The site's text changes only when the ad does, at the next sync.
- **It never empties the site:** an answer with no cars, or with more than half the cars for sale gone, is held and changes nothing.
  Owners and managers can Apply anyway.
- **When it fails** the site keeps the stock from the last good sync, Stock, Overview and Settings say so, and after an hour the owners and
  managers get one email (not again until a sync works).
- **The demo** cannot use a real dealer's account (DoneDeal's API is for one dealer's own site, with written consent). Its feed is the
  stock itself, so a sync shows working and finds nothing to change.
- **Still to write:** the adapter that reads DoneDeal's API (`src/lib/donedeal/feed.ts`), once DoneDeal sends its docs and the full usage
  policy (what may be stored, photos, call limits).

## Cloudflare Access (owner set-up, once per environment)

Dev (`dev.dash.checkwork.ie`) and production (`www.dash.checkwork.ie`, `dash.checkwork.ie`) each get the same set-up, as applications of
their own, so each has its own audience tag and its own list of people.

1. Zero Trust, Access, Applications, Add, Self-hosted, with the one-time PIN login:
   - production: the whole of `www.dash.checkwork.ie` and `dash.checkwork.ie`;
   - dev: the whole of `dev.dash.checkwork.ie`.

   The policy is **Allow** for **named emails only** (an Emails include, or an Access group of them): never Everyone, never a
   whole email domain. The dashboard is private: sign-in only, with no sign-up and no public demo (owner, 2026-11-22). Which dealer a
   person opens, and as what, is still the app's decision, from the directory (#4).
   On each host, give `/api/owner/*` and `/api/site/*` their own applications with a **Bypass** policy (each brings its own token or key,
   `docs/owner-api.md`, `docs/site-api.md`): four Bypass applications in all.
2. **Adding a person** takes both, until our own sign-in replaces Access (#10): they are added in Settings, Team (the directory), and their
   email is added to the Access policy (ours to do). Removing someone: take them off both. Dev has its own directory and policy.
3. Copy each application's Audience tag. Your team domain is `<team>.cloudflareaccess.com` (the same for both).
4. Put them in `wrangler.jsonc` `vars` (not secrets): `CF_ACCESS_TEAM_DOMAIN` in both places, `CF_ACCESS_AUD` the dev application's at the
   top level and production's in `env.production`. A deploy sets them on the Worker; one set by hand in the dashboard is replaced by the
   next deploy.

Until both are set every page answers 404 for everyone. The Worker checks Access's signed token itself (`src/lib/access.ts`), so a missing policy fails closed instead of open.

## Billing and Help

The plans (#223, `TIERS` in `src/lib/billing/rules.ts`, from `docs/sales/pricing-strategy.md`), a month before VAT. Only these three tiers
and their add-ons are sold:

| Tier | Modules | Monthly | Setup | Included each month |
|---|---|---|---|---|
| Showroom | Trade-in, finance, car finder, lookup on the website, reviews shown | EUR 249 | EUR 950 | 25 lookups |
| Dealer | Showroom plus the dashboard, test drives, sales, analytics, WhatsApp, AI writing, lookup in the dashboard | EUR 449 | EUR 950 | 100 lookups, 500 WhatsApp alerts and confirmations, 100 AI actions |
| Group | Dealer plus margins, social, newsletter, new cars, commercial | EUR 749, plus EUR 149 per extra branch | EUR 1,950 | 100 lookups and 500 WhatsApp alerts per branch, 300 AI actions |

- **Add-ons** at module prices (`MODULE_EUR`): any module the tier lacks, such as commercial EUR 29, service EUR 49, margins EUR 49, social EUR 99 (with 200 more AI actions a month),
  newsletter EUR 59, new cars EUR 99. New cars covers 2 brands; each more brand is EUR 29 a month and EUR 100 at setup, in a tier or not
  (setup EUR 400 as an add-on). A plan is the cheapest tier for the dealer's modules plus add-ons; no modules is Showroom. Showroom takes
  no add-on that is or needs the dashboard, and more than one branch is Group. The demo bar names the plan as the Billing page does, and each switch shows what turning it on adds.
- **Over the allowance** each use is billed: lookup EUR 0.30, WhatsApp alert EUR 0.05, reply EUR 0.03, marketing message EUR 0.12, AI
  action EUR 0.04 (Standard) or EUR 0.08 (Premium). Replies and marketing messages are never included.
- **Payment terms** (`term`): monthly at list price, a year upfront for 11 months' price, or a 2-year contract with no setup fee.
- `term`, `branches` (default 1) and `brands` (default 1) are billing settings set from the owner's program, as the ceilings are. Branches
  only change Group's price and allowance until multi-branch is built (#226).

`/billing` is for the Owner and Manager (`can("billing")`; anyone else gets a 404, and so does every action). It has three sections:
the plan and this month's usage (with the payment term, what
the allowance covers, and an "Estimate" for the month end), the setup fees (the tier's, and those of add-ons set up with
outside accounts (Social, New cars), none on a 2-year contract;
`setupLines` in `src/lib/billing/rules.ts`, also totalled in the demo bar's plans panel), the limits and alerts (a euro limit per service
and for all usage, never above ours (by default EUR 15 of lookups, EUR 20 of WhatsApp (EUR 20 per branch on Group: a WhatsApp ceiling the owner's program sets is per branch too) and EUR 50 of AI past the allowance, `DEFAULT_CEILINGS`); the 80% alert; "tell me when X passes EUR N"; AI writing's quality, Premium (Claude Opus) at EUR 0.08
an action or Standard (Claude Sonnet) at EUR 0.04, each action counted under the model that wrote it; the dealer never sees the model
or provider's name), and the bills. With `SHOW_PRICING` false the page shows only the plan's name, its modules, the payment
term, the writing quality and the billing details, with no euro. On a year paid upfront the month's estimated bill is the usage only. Every change is written to the activity log. Rules and maths: `src/lib/billing/bills-rules.ts`
(unit tested); the bills are a seeded collection, `src/lib/billing/bills.ts`. There is no PDF and no download: invoices come from the
payment provider chosen at clone time and are emailed when issued. Billing details (company, VAT number, address, email) are the
Owner's, stored in settings as `billingDetails`. "Ask us to add" sends a Help request of type "Add to my plan"; it switches nothing on.

`/help` is for every team member: our phone, email and WhatsApp, a message form (Question, Something isn't working with steps
and an optional screenshot, Request a change, Feedback or an idea, Billing and Add to my plan for the Owner and Manager), their own requests
with our status and reply, and a quarterly one-question feedback. The "Need help?" link in the menu foot passes `?from=<page>`, which is
saved with the request (a dashboard path only, `safeFrom`). Requests are the `help-requests` collection (`src/lib/admin/help.ts`). On
the demo nothing is sent outside (`ADAPTER GOES HERE`: the email to support and the owner's program, #174). Screenshots are checked by
their bytes and kept in the private bucket under `help/`, or as a data URL with no bucket.

## Monthly report and the owner API

- **Analytics** (`/analytics`, the Site analytics module): on the demo, generated sample figures (`src/lib/admin/analytics.ts`). On a real site, the site's own anonymous counts (`src/lib/admin/visitor-figures.ts`): visits by channel and the website leads each brought, searches with no cars to show by make, price bands and filters used, calculator use against finance applications, and active alerts per car. A visit's channel (Google, Facebook, DoneDeal, a tagged link's `utm_source` and so on, `src/lib/visit-rules.ts`) is worked out on its first page and kept in the tab's sessionStorage for that visit only, so a lead form can send it: the lead shows "Website, from Facebook", and the dealer's email shows "Came from". No cookie, no visitor id, and what a buyer types in the search box is never stored, only a make from the fixed list.
- **Monthly report** (`/monthly-report`): last month by default, any of the twelve before it from the picker. Each section shows only for the modules on (Leads and Stock always, Visitors with Site analytics: sample figures on the demo, the site's own visit counts on a real site, Sales, Reviews). Each figure says how it compares with the month before, or "Too few to compare" under 5. Sales value and profit show only to staff with the margins permission. As on Reports, staff without it (Sales) see their own leads and sales only, with no stock, visitors or reviews. One "What to do" line comes from fixed rules. "Print or save as PDF" uses the browser's print, with the menu left out.
- **Email**: `/api/reports/monthly` (CRON_KEY, scheduled `0 7 1 * *` in `worker.mjs` and `wrangler.jsonc`) emails last month's summary to the owners and managers: counts only. On the demo it goes to the lead inbox like the follow-up digest.
- **Owner API** and the anonymous feature counters: see `docs/owner-api.md`. The figures for the report and the API are one module, `src/lib/reports/monthly.ts`.

## The contact form (guided)

The public `/contact` form asks what the buyer needs, then a few taps, then how to reach them (#176). The topics, their tap answers and
the words for them are in `src/lib/leads/contact-topics.ts`; the steps and cards in `src/components/leads/GeneralFields.tsx`.

- Cards follow the modules: no Service card without `service`, no Selling card without `tradeIn`, no Finance card without `finance`. That
  need goes to "Something else".
- The server (`general` in `src/lib/leads/schema.ts`) takes the topic and answers as optional fields. With no topic, or with "Something
  else", the message is still required, so the old free-text path stays valid.
- A lead keeps `topic` and `answers`. The leads list shows them as tags ("Buying · this week · trade-in"), filters by topic, and puts
  new leads answered "can't be driven" or "this week" first until a column is chosen. The dealer's email subject says the same
  ("Service: warning light, this week"), built from fixed words only, never the registration.
- A "A car I bought from you" message is filed as a warranty request (Aftersales), and "Service or repair" as a Service lead, like the
  pages they come from. `/service` and `/warranty` open the same form on their topic.
- The optional "Send me updates on WhatsApp" switch (with the `whatsapp` module) is stored on the lead as `whatsappOptIn`.

## WhatsApp (#178)

The `whatsapp` module. On the demo it is simulated (integration `whatsapp`): `/whatsapp` shows the dealer's WhatsApp as a phone, and a smaller buyer's phone, and nothing leaves the site.

- Each alert is answered once for everyone it went to: one offer, one decline, one confirm ("Already done." after). Asking for more
  photos keeps it open for the offer. A closed lead takes no more buyer messages, and a question expires after an hour.
- Messages are kept 30 days (the daily purge), and go with their lead or an erasure. Removing someone from the team removes their phone.
- Each new website request is added to the conversation of every team member who has that alert on and a linked number, outside their quiet hours (`alertStaffOnWhatsApp`, called once from `real-leads.ts`). The template is the request's own module's, or the plain enquiry when the dealer lacks that module (`eventOfLead`). A buyer who ticked the WhatsApp box (`whatsappOptIn` on the lead, read from the form's detail of the same name) gets a confirmation.
- The other alerts go the same way (`alertStaff`, also checking the alert's own module): Deposit taken from Reserve (`reserveAction`), A new car in stock when a car first goes on the website (added live, or a draft published), and from the morning cron (`/api/whatsapp/daily`, after the follow-up digest in `worker.mjs`) each car old stock (`DEALER_RULES.oldStockDays`, 120 days by default), each review from the last two days (each once while its alert is kept), and on a Monday last week's leads, test drives taken and cars sold, from the report's own sums. The demo's seeded alerts use the seed's own figures.
- A tap or a typed reply goes through `src/lib/whatsapp/handle.ts`: it writes the lead (status, note), the activity log (never a name), and the buyer's message. Notes and replies say how the buyer was told (WhatsApp or email). Reply with a price reads "8,500", "€8.5k", "8500" (`parsePrice`), sends the offer, and the buyer's simulated answer lands six seconds later on both phones and the lead.
- Call back is not a reply: it sets the follow-up to today and gives the lead to whoever tapped, and leaves the status. Its note and a buyer's answer are marked `auto`, so the report's first reply skips them. Confirm on a deposit records it in the activity log against the car. Suggest another time sends the buyer the time and leaves the alert open: the booking moves in Test drives once they agree. A test drive confirmed with its booking tells the buyer the day and time.
- Only a team member with a linked phone can act, in their own conversation (an unlinked one is told to link it). With an alert's module off, its alert and questions are hidden and acting on them is refused. Margins are never in a message.
- The lead page shows "WhatsApp updates: on" for a buyer who ticked the box, with Stop WhatsApp, which clears `whatsappOptIn` (logged, without the buyer): nothing more goes to them on WhatsApp. Their own STOP reply comes with the adapter.
- Every message to a phone or a buyer checks `usageAllowed("whatsapp")` and records `alert`, `reply` or `marketing`. Past the cap an alert or reply is stored as "Sent by email instead" and not counted, unless the plan's alerts still cover it (`inAllowance`); marketing is not sent. A buyer without the opt-in gets email, also uncounted. The site's acknowledgements to the dealer inside a conversation are free replies and not counted.
- Messages about a lead are removed once the lead is gone (purge, data request), on the next read of the page.
- The real Cloud API goes where `ADAPTER GOES HERE` is, in `src/lib/whatsapp/send.ts`: approved templates outside the 24 hour window, and a webhook that checks Meta's signature and ignores unknown numbers.

## The app on the phone (#11)

The dashboard installs on a phone's home screen as "Checkwork" and can send notifications. Standard web features only, nothing from an
app store and no outside service.

- **Installing.** `public/manifest.webmanifest` (name, start at `/`, standalone, the icons), the Apple tags and the manifest link in
  `src/app/layout.tsx`. The icons are made from the mark by `node scripts/app-icons.mjs` and kept in `public/brand/`. The manifest is a
  static file, not `app/manifest.ts`: a browser fetches a manifest without cookies unless its link says `use-credentials`, Access turns that
  request away, and Next's own link cannot say it.
- **The service worker** (`public/sw.js`, registered by `src/components/admin/ServiceWorker.tsx` in a build only) caches the offline
  screen (`public/offline.html`) and the icon, nothing else: pages and data always come from the network, since everything a dealer sees
  is live and personal. With no network a page shows the offline screen. It shows a push and opens the app at its link when tapped.
- **Behind Access.** The manifest, the worker, the offline screen and the icons are behind Access like everything else, and the browser
  sends its Access cookie with them. On an installed iPhone app Access's login can be awkward: the app keeps its cookies apart from
  Safari's, so a sign-in in Safari does not carry over, and the one-time PIN login may be needed again inside the app. We do not work around it: our own sign-in (#10) fixes it.
- **Notifications** (`src/lib/push`): Web Push with VAPID, encrypted and signed with WebCrypto on the Worker (RFC 8291 and 8292, tested
  against the RFC's own example). Three of the bell's notices also go to the phone, to the same people the bell shows them to:
  | What happened | Title | Text | Opens |
  |---|---|---|---|
  | A new website request (any lead in Leads, an order request too) | Its kind ("Car enquiry", "Message") | Its topic and answers, and the car | The lead |
  | A test drive request | Test drive request | The car, and the day and time asked for | The booking |
  | A lead given to you by someone else | "Ciara Walsh gave you a lead" | Its kind, topic and car | The lead |
  | A test drive given to you by someone else | "Ciara Walsh gave you a test drive" | The car | The booking |

  The title and text are the bell's own heading and line (`PUSH_KINDS` in `src/lib/admin/notifications.ts`), and the text starts with the
  dealer's name ("Checkwork Motors: Buying, this week, trade-in · 2020 Audi A3"). A tap opens `/dealers/open?dealer=<id>&to=<path>`, which
  switches to that dealer if the person is still a member (the same check as Switch dealer) and then opens the page; otherwise it opens the
  overview and leaves the dealer as it was. `to` is only ever a path on this site. Pushes are sent after the answer (`after()`), each with a
  5 second limit, so a slow push service never holds up a website's form or the page that gave a lead.
  Never the customer's name, email or phone: a lock screen is not private. Warranty requests, ads taken down, sync outages, WhatsApp
  replies and the rest stay in the bell. Each goes to everyone still on the team (a lead given to someone: that person only) who turned
  notifications on, on each of their devices. A demo dealer sends them too: they go only to its own team's devices and cost nothing.
- **Turning them on** is per person and per device: Settings, Notifications, "Notifications on this device". The panel lists your own devices
  with Turn off on each. Each turn on and turn off is in the activity history, with the device's kind (iPhone, Android phone, Mac), never its
  address. On an iPhone push needs iOS 16.4 or later and the app on the home screen; the panel says "Add this to your home screen first".
- **Kept** in the dealer's own store (`push-subscriptions`): the person's email, the device's push address and keys, its kind and when it
  was added, one record per device. The push address is never logged. A device the push service says is gone (404 or 410) is removed; any
  other failure is logged by its status only and never stops what caused it. Removing someone from the team removes their devices. Staff
  are not covered by data requests (customers are), the same as their WhatsApp phone: each person removes their own devices here, and
  leaving the team removes the rest.
- **Keys.** A VAPID key pair per environment: `VAPID_PUBLIC_KEY` a var in `wrangler.jsonc`, `VAPID_PRIVATE_KEY` a Worker secret, made
  by `node scripts/vapid-keys.mjs` (README, "Going live"). With either missing, Settings says notifications are not set up yet and nothing
  is sent. A new pair turns notifications off on every device until each person turns them on again. The push services allowed are
  Google's, Apple's, Mozilla's and Microsoft's (`validSub`), so the Worker never posts to any other address.
- **Not tested here:** real delivery to a phone. The unit tests open what was sent with the phone's own keys; the E2E suite stubs the
  browser's push subscription.

## Marketing formats, media and AI writing

- **Formats** (#177): a post is a Post, Story (9:16 with a ready layout: Just in or Price drop, drawn over the car photo), Reel or video, or Carousel (2 to 10 photos). The composer previews each at phone size. Limits live in `src/lib/admin/networks.ts` (`FORMAT_LIMITS`, `FORMATS_FOR`) and the server checks the same numbers. `PUBLISH_MODE` there says which formats a network's API can publish ("auto") and which are prepared here and posted from the phone ("prepare": Facebook and Instagram stories, all TikTok). Publishing stays simulated.
- **Media library** (`mediaStore`, tab Media): photos (JPEG, PNG, WebP; shrunk to 1,600px on the device) and videos (MP4, MOV, up to 15 MB and 90 seconds on the demo; length read in the browser and checked loosely on the server), optionally tagged to a car. Stored in R2 under `media/` in the `LEAD_PHOTOS` bucket and served by `/media-files`; with no bucket a data URL is kept in memory. Rules in `src/lib/admin/media-rules.ts`. No range requests yet, so add them before real video use.
- **Calendar**: a week of scheduled and posted posts and started ads (`calendarWeek`); drafts are not on it.
- **Modules**: posts, calendar and media need Social and ads, newsletters need Newsletter and alerts; the page needs one of them.
- **AI writing** (#179): `writeAction` (`src/lib/ai/actions.ts`) checks the `ai` module, then the monthly cap, builds the facts from the records (the browser sends ids only), writes with the model chosen on Billing, then counts the action under that model. On the demo `writeWithAI` is the mock in `src/lib/ai/mock.ts` (deterministic, facts only, dashes stripped, 700 ms pause). With `ANTHROPIC_API_KEY` set as a Worker secret (`npx wrangler secret put ANTHROPIC_API_KEY`) it is real Claude instead (`src/lib/ai/claude.ts`, every prompt in one place): a refusal, a cut-off answer or an error is a failed write, not billed, and the facts and text are never logged. Limits: the monthly AI cap (demo €25), our AI ceiling that a cap can never go past (`AI_CEILING_EUR`, €50 on every site unless the owner's program sets another; €25 on a freshly seeded demo), `AI_LIMITER` of 10 calls a minute per dealer (wrangler.jsonc, namespace 1003, 2003 on dev; Cloudflare counts it per location), short prompts (a message or review is cut to 600 characters; phone numbers and emails are taken out of the facts and the draft, and the dealer's own are put back in the answer) and `max_tokens` 2048. Set a spend limit on the Claude Console workspace too. `AIWriter` / `AITextarea` show the button, adjust chips, Undo and an "AI draft" label, and hide with the module off. Used in the post composer, newsletters, the car description, the lead page (Draft a reply) and review replies.

## Where things are

| What | Where |
|---|---|
| AI writing (Claude with a key, the mock without), media library | `src/lib/ai/`, `src/lib/admin/media.ts` |
| Dealers kept apart: the directory, the current dealer, `runAsDealer`, the bucket prefix, jobs | `src/lib/tenancy/`, `src/lib/db/directory-schema.ts`, `docs/new-dealer.md` |
| Each dealer's profile (facts, plan, stock source, rules), the demo switches' cookies | `src/lib/tenancy/profile.ts`, `current.ts` (`dealerProfile`, `demoCookie`), `src/components/DealerFacts.tsx` (the browser's copy) |
| Record store (one D1 table, `admin_docs`, in the dealer's database; memory with no D1) | `src/lib/admin/docs.ts` |
| The dealer's collections, types and seeds | `src/lib/admin/collections.ts`, `seed-data.ts` |
| WhatsApp: templates, price parser, sender, handlers, conversation | `src/lib/whatsapp/`, `src/app/whatsapp/` |
| Roles and permissions | `src/lib/permissions.ts`, `permission-rules.ts` |
| DoneDeal sync (feed, plan, run, route) | `src/lib/donedeal/`, `src/app/api/donedeal/sync/route.ts` |
| Activity history (write, list, purge) | `src/lib/admin/activity.ts`, `activity-refs.ts`, `activity-purge.ts` |
| Cost prices and margin maths | `costsStore` in `collections.ts`, `src/lib/admin/margins.ts` |
| Outside services and the settings each needs | `src/lib/integrations.ts` |
| Admin kit (tables, stat cards, forms, charts) | `src/components/admin/` |
| Stock the admin edits (the table the site reads) | `src/lib/admin/stock-admin.ts` |
| Navigation of each area | `src/lib/admin/nav.ts` |
| Billing page, bills and their maths | `src/app/billing/`, `src/lib/billing/bills.ts`, `bills-rules.ts` |
| Help requests | `src/app/help/`, `src/lib/admin/help.ts`, `help-rules.ts` |
| Monthly report maths, page and email; owner API and counters | `src/lib/reports/`, `src/app/monthly-report/`, `src/lib/owner-api/`, `docs/owner-api.md` |
| The app on the phone: manifest, service worker, push | `public/manifest.webmanifest`, `public/sw.js`, `src/lib/push/`, `src/components/admin/PushPanel.tsx` |
| Contact form topics, tags and subject | `src/lib/leads/contact-topics.ts`, `src/components/leads/GeneralFields.tsx` |

## Connecting a service

Each service in `integrations.ts` lists the Cloudflare variables it needs. Settings, Connected services shows which are missing. When they are set, the matching feature unlocks on the next request. The sending and publishing code for Meta, Google Ads and the newsletter provider is not written: the place for it is marked in `publishers.ts`.

## Testing notes

- Playwright specs run in parallel against one server. A spec that adds or edits cars (`admin-stock.spec.ts`) changes what the others see, so it runs alone, after the rest (see `playwright.config.ts`).
- Specs that change records (leads, bookings, settings) use values that cannot clash on a retry (a different day or name each run).
- The record store and the stock writes have SQLite-backed tests (`*.int.test.ts`) that run the real migrations.
