# Dashboard usability pass: contract

Owner feedback, 2026-11-20: the dashboard looks flat and empty, behaviour is convoluted, the most wanted information and tools are not
clear, and it is not built for someone who is not technical. This is the contract every page in this pass follows. It adds to
`docs/dashboard-polish.md` (tokens, type, radius, status tones, copy rules), which still holds.

## Who it is for
A salesperson or owner at a small car dealer, on a phone out on the yard or a laptop in the office, who has never had training. They open
a page to do one of a few jobs. They should know within five seconds what needs doing, what the main job here is, and how to do it.

## Rules
1. **Start with what needs doing.** A page that has work waiting opens with it, as a task list (`TaskList` and `Task` in the kit): what it is,
   why now, and the button that does it in the row (Reply, Call, Confirm, Record sale). Never a count that only links somewhere else.
2. **One main job, obvious.** One filled accent button per page, for the job people come for (Add a car, Book a test drive, New post). Other
   actions are quiet buttons. On the Overview, the main jobs are `ActionTiles`: an icon, a verb and one short line each.
3. **Actions where the thing is.** A row shows only its next step, as a labelled button, and a menu (`RowMenu`: three dots, named "More
   for <name>") with the rest: Call, Open, Cancel, Delete (#95). With no step due, only the menu. A
   phone gets the same actions on the record's own page, at the top.
4. **Hierarchy, not a wall of equal cards.** The work of the page is raised; supporting detail is `quiet` or plain text with no frame.
   Important numbers are large; secondary ones are small. Not every block needs a panel.
5. **No dead space, no half-empty cards.** Use the width: two columns on a laptop where the content suits it. A card holds enough to
   earn its frame, or it is merged into another. Empty states say what to do next and carry the button that does it.
6. **Plain words.** Say what a button does ("Mark as sold", "Post to Facebook and Instagram"). No internal terms (SLA, module, sync, CSV
   on its own, lead type codes). Short helper text only where a label cannot say it. No em dashes. Sentence case.
7. **Every figure goes somewhere.** A number, a badge or a row that looks clickable is a link to the list behind it.
8. **Fewer steps.** If a job takes several pages or a hidden menu, bring it forward. Confirm only what cannot be undone; anything that can
   be undone happens at once with Undo in the toast.
9. **Phone first.** The main content is on the first screen of a 390px phone, under the title (`feedback: mobile-first-screen`). Tap
   targets 44px.
10. **Keep what works.** Server permission checks, module gates (`hasModule`, `enabledModules`), the DoneDeal synced mode, simulated
    integrations and every feature stay. This is presentation and flow, not a rewrite of the data layer.

## Kit
`src/components/admin/kit.tsx`: PageHeader, Panel (raised or `quiet`), StatCard and StatGrid, Badge, EmptyState, DataTable, SummaryTabs,
Segmented, Notice, Facts, Avatar, and new in this pass `TaskList`/`Task` (urgency marker, icon, detail, inline action) and
`ActionTiles`/`ActionTile` (the main jobs as big buttons). Button classes: `adminButton` (primary), `adminButtonQuiet`, `rowButton`,
`dangerButton`.

Form controls (#130), as checkwork-demo builds them: every drop-down is `Select` (the site's Combobox: typable on a desktop, a list on a
phone, a hidden input so the form still posts its `name`), never the browser's select. The one exception is the role select in the demo
bar, which is fixed to the screen (`DemoBar.tsx` says why). Text, email, phone and number boxes use `adminInput` (44px, the control radius
and border, the focus ring from `globals.css`); a whole number asks for the digits keypad (`inputMode="numeric"`), a decimal for the one
with a point. Dates and times stay the browser's own picker (a sold date, opening hours, a follow-up day, when a post goes out): any day or
minute can be right, and a phone's wheel beats a long list. Checkboxes and radios are native, `size-5 shrink-0 accent-accent`, in a row at
least 44px tall. A file is picked with a quiet button holding a hidden input, never the browser's grey one.

## Public site
The public site is the customer's only. No dealer tools on car pages and no Dashboard link in its header or menu. The demo bar's Dealer
link opens the dashboard. Posting a car to social starts from the stock list or the car's page in the dashboard.
