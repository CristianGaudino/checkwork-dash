# Dashboard and site polish: spec and plan

Issues #67 to #82. Owner feedback, 2026-11-11. This is the spec for all of them and the order they are built in. Method: the unslop checklist
(unslop by Damir Sokolovsky, CC BY 4.0) over the whole site, a pass for the same faults the owner named, then build in phases with a ponytail
audit at the end of each.

## Direction (unslop, five lines)
- **Product:** a used and new car dealer's website, and the dashboard its staff use to run stock, leads and posts.
- **Character:** calm, exact, practical. A dealer's office on the yard, not a launch page.
- **World:** a lit showroom floor and the office behind it. Neutrals are tinted stone in light and graphite-teal in dark.
- **Moments:** the car photo on its lit plinth on the public site; on the dashboard, the lead list and the post preview. Everything else is quiet.
- **Signature:** the plinth under every car photo. Nothing else is decorative.

## Rules every phase follows
1. **Quiet chrome, one accent.** Indigo marks the primary action and the selection. Nothing else carries color except status.
2. **Type:** Sora, weights 400, 500 and 600 only. Sentence case. No tracked uppercase, no italic emphasis, no eyebrow labels above titles.
3. **Surfaces:** solid. No tinted overlays (`bg-x/15`), no inner highlight (the sheen), no hue gradients, no glow. Depth in dark is surface steps and a hairline; in light a small neutral shadow.
4. **Status** (badges, chips): five solid tones (neutral, ok, warn, bad, info), each a background and a text color that meet 4.5:1, defined once per theme.
5. **Radius** on one scale and nested: control 12px, card 20px, tile 24px, chip full. An inner radius is the outer minus the padding.
6. **Spacing** on the 4px grid; equal things equal sizes.
7. **Icons:** one line set (the existing one), 16 or 20px, 1.5 stroke, text color. No emoji anywhere.
8. **Copy:** short. Labels, buttons and subheads end without a period. No helper sentence where the label already says it. One primary action per page.
9. **Motion:** color, background, opacity and transform only (and clip-path for a chart drawing in, so rounded bar ends do not squash), one easing, no looping, nothing that moves on hover by more than a few pixels.
10. **Clickable means clickable:** a number, a badge or a row that looks like a link is one.
11. **Round what is read at a glance** (#206): tiles, chart labels and headline totals use `fmtCompact` / `fmtCompactEur` (`src/lib/admin/format.ts`): under 1,000 in full, then "12.4k", "118k", "€1.2m", one decimal below 100 of the unit, never ".0". Prices, costs, margins and profit, deposits, bills, finance and every table keep the full figure; a rounded money tile carries the exact one in its `title`.

## Spec by issue
| # | What |
|---|---|
| 67 | `VehicleListPage` for New and Commercial becomes the same `StockShell` as Used: filter rail, sheet, search, sort, grid and list, scoped to the kind. The make chips stay as a shortcut above it. |
| 68 | `MakeLogo` renders initials in the same box when there is no SVG (`LR`, `GN`, `GMC`, `DG`, `BK`). A `standalone` prop (the make page heading) renders nothing instead. |
| 69 | `/test-drive` gets a full page: title, intro, Call and WhatsApp, how it works, what to bring, then Select a car. Title and description written for search. |
| 70 | Every label that says Admin or Dealer admin says Dashboard or Dealer dashboard, and the URL moves to `/dashboard` (owner decision; history: in this app the dashboard is the root, `/`), and `/admin` is gone (no redirect). The Cloudflare Access application path must change to `/dashboard*` when it deploys; until then the Worker answers 404 (it fails closed). |
| 71 | The warranty is 12 months in `WARRANTY`, the trust strip, the buy box, the warranty page and the tests. The Warranty page gets: what is covered, what is not, how to claim, extended cover, contact. |
| 72, 73 | Overview: a short heading, five figures that are links to their pages, a needs-attention list, recent leads as whole-row links, three quick actions. No chart. |
| 74 | One `Select` (the Combobox) in all 12 places; typable on desktop at any length; the chevron has padding on the right. |
| 75 | Lead status as quick-action buttons with line icons (Contacted, Appointment, Won, Lost) and type as filter chips with counts. |
| 76 | Assign with team profile chips (initials and name), one click, including Nobody. |
| 77 | Marketing is one composer: car, text with a suggestion, photos, a live preview, an optional ad toggle, publish now or schedule (owner decision: post and ad in the composer, newsletters in a list). |
| 78 | The hero image fades into the page background at the bottom edge in both themes (a mask, not a hard cut). |
| 79 | The tokens above: weights, radius scale, status tones, no sheen, no tinted overlays, in light and dark. |
| 80 | Dealer tools on the car page: a labelled strip (Dealer) above the gallery with two buttons and icons: Edit car, Post to social. Visible, not loud. Removed 2026-11-20: the public site is customer-only (docs/dashboard-usability.md). |
| 81, 82 | The unslop pass and the copy and button cut over every page, applying rules 1 to 10. |

Owner decisions (2026-11-11): sentence case across the public site and the dashboard; the dashboard URL becomes `/`; marketing keeps post and ad in one composer, newsletters in a list.

## Plan
1. **Foundations (PR 1):** tokens (weights, radius, status tones, shadows, no sheen), the Select and its 12 replacements, hero fade, make initials, eyebrow removal. Audit.
2. **Public site (PR 2):** filters on New and Commercial, the Test Drive page, 12 month warranty and page, dealer tools strip. Audit.
3. **Dashboard (PR 3):** rename, overview, clickable rows, leads quick actions and assignee profiles, marketing composer, text and button cut. Audit.
4. **Whole-site pass (PR 4):** sentence case across the public site, trailing periods, copy cuts, spacing and motion review. Audit.

Each PR keeps lint, `tsc`, unit and E2E green, shows screenshots at 390px and 1280px in both themes, and is audited before it is opened.

## Found in the pass over the site (beyond what was reported)
- 12 native selects (admin leads, lead detail, marketing x4, car form x2, add drive, team role, the shared form field).
- 150 uses of weight 600 or 700; headings at 700 read heavy and generic.
- Tinted status colors (`bg-better/15`, `bg-accent/15`, `bg-warning/15`, `bg-destructive/15`) and 8 other opacity overlays: the sheen in dark.
- The panel shadow has an inner highlight, and the page background has a warm radial glow in dark.
- Eyebrow labels above page titles (Our Stock, New, Commercial), and Title Case on most headings and buttons.
- Strays in the radius scale (`rounded-lg`, `rounded-md`, `rounded`).
- Helper sentences on most dashboard pages that repeat the page title.

## What was built (one branch, `feat/dashboard-polish`)
- The dashboard lived at `/dashboard` in checkwork-demo (history); in this app it is the root, `/`, and Access covers the whole domain. `/admin` no longer exists.
- Overview: five figures that link to their pages, latest leads and the needs-attention list as whole-row links, three quick actions. No chart.
- Leads: type as filter chips, whole-row links in the list, status as icon buttons and the owner as profile chips on a lead.
- Marketing: one composer (`PostComposer`) for a post and its ad, with suggested text per network, photo choice, a live preview, publish now or later,
  or save a draft. Newsletters are a list. The ad switch adds a platform and a budget; with simulation on, publishing starts the ad too.
- The post stores the photos chosen (`SocialPost.photos`); the publisher adapters will use them when a real service is connected.
- Sentence case across the public site and the dashboard. Proper nouns keep their capitals.

## Buttons: an order of importance (2026-11-21)
Owner feedback: too many flat, same-coloured, outline-only buttons; nothing says which one matters. Every dashboard button is one of
these levels, from the kit (`src/components/admin/kit.tsx`). No outline-only buttons.

| Level | Kit | Look | Use |
|---|---|---|---|
| Primary | `adminButton` | Filled indigo, white text | The main thing to do in a panel or screen area. At most one per area. |
| Secondary | `adminButtonQuiet` | Tonal: a soft indigo fill (`accent-soft`), indigo text, no border | Other actions beside the primary: Cancel, Save draft, Call and Email on a lead. |
| Row, strong | `rowButtonStrong` | Tonal, row size | A row's or task's next step: Confirm, Record sale, Call on a follow-up. One per row. |
| Tertiary | `rowButton` | Text only, indigo, a soft fill on hover | See all, the row menu's icon, menu items (neutral text inside a menu). |
| Destructive | `dangerButton`, `rowDanger` | Red tonal fill, or red text in a row | Delete, Remove, Revoke, Clear. Never filled solid red, never the primary. |
| Choice | `choicePill` | Neutral chip; the chosen one filled ink | One of two or three, side by side. A choice, not an action. A lead's stage, why it was lost and who has it, a claim's stage and every person picker (who takes a test drive out, sold or taken by) are drop-downs (`ActSelect`, `PersonPicker`), never a block of chips (#135, #136, #141). |

- **Icons** sit before the words where they help recognition (Call, WhatsApp, Email, Edit, Post, Confirm). The words stay: never an icon alone, but for a row's menu (`RowMenu`), three dots with an accessible name, 44px to press.
- **Contrast:** indigo text on `accent-soft` is 5:1 or more in light and dark, and 4.5:1 on hover. Red on `bad-soft` is the status tone pair.
- **Focus:** the global 2px indigo ring (`:focus-visible`) on every level. **Size:** 44px tall on a phone.
- **AI writing** (`AIWriter`): Write with AI is a secondary button with the sparkle in a filled indigo dot, so it reads as its own thing. Then
  the "AI draft" tag and Undo on the same line, and the changes (Shorter, Friendlier) as a quieter group of small neutral chips under a
  "Change it" label, tied to the box by an indigo rule.

New tokens: `--color-accent-soft` and `--color-accent-soft-hover` (light and dark), the tonal fill.

## Dialogs and button rows (#133, 2026-11-23)
Owner feedback (#131): a value is read first and edited on demand, and the edit happens in one house dialog; buttons sit on the right.

**Button rows.** In a form's footer, a dialog and a panel's own actions, the buttons sit on the right, the main one right-most and Cancel
(quiet) just before it: the order of macOS, iOS and Material dialogs (Apple HIG, Material 3). `FormActions` in the kit draws the row. On a phone, when
the buttons do not fit one line, the main one wraps to the right of the line below, in thumb reach. A status beside them ("Saved") takes
`mr-auto` and sits on the left. A destructive confirm (`ConfirmDialog`) follows the same order.

**The dialog.** `Dialog` (`src/components/admin/Dialog.tsx`) on the native modal `<dialog>`: a sheet from the foot of the screen on a
phone (the iOS sheet, in thumb reach), a centred card, 32rem wide, from 640px (the Material and macOS modal). Title, an optional line,
the body, then `FormActions`. On a short phone the body scrolls and the actions stay at the foot, above the home bar.
- **Read first.** The page shows the values (`Facts`, a line of text); an Edit button (`rowButton`, pencil icon, the panel's `action`)
  opens the dialog with the form. Never an always-open form for a value that rarely changes.
- **Focus** goes to the field marked `data-autofocus`, else to the dialog itself, so a phone's keyboard does not cover it unasked, and
  back to the Edit button on close.
- **Closing.** Escape, the scrim, the close button and Cancel (`DialogCancel`) all close it. With changes not saved it asks first
  (`LEAVE_QUESTION`, the question a page with changes asks), as an iOS sheet does; an edit put back counts as none.
- **Saving.** The form inside is the usual `useKeptForm` server action form. A refused save keeps the dialog open with the errors by their
  fields and what was typed; a save that works closes it from the caller (`open` false) and says so in the toast. Each opening starts from
  the saved values.
- **Motion.** It slides up on a phone and fades in, growing a little, from 640px, both ways, with the scrim; a fade only under reduced motion.
  The page behind does not scroll while it is open.
- First used for Settings, Timings, then a car's prep costs and a synced car's description. Notes, the car form's description, follow-ups and
  staff details move to it as their pages are reworked.
- **`EditDialog`** (`src/components/admin/EditDialog.tsx`) is the Edit (or Add) button and its dialog in one, with `useDoneOnSave` to close
  it on a save. The #141 pass put it on Settings (business details, how posts sound), Billing (limits, alerts, billing details), a cost
  (a claim's repair cost, a synced car's cost price) and a test drive's time (Change time). Ending a reservation and a
  review's reply open the same dialog, which is then the asking: no second confirm. A booking's steps sit bottom right, the next one
  right-most and Cancel far left.
