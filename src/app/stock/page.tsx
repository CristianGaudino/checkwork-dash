import Link from "next/link";
import { DataTable, EmptyState, FormActions, Notice, PageHeader, Panel, SummaryTabs, TableFooter, TableToolbar, Task, TaskList, adminButton, adminButtonQuiet, pageOf, rowButton, rowButtonStrong, sortRows, type Column, type FilterGroup } from "@/components/admin/kit";
import { CarFlags, ListingButton, PostToSocial, ViewOnSite, daysInStock } from "@/components/admin/CarActions";
import { ActButton } from "@/components/admin/ActButton";
import { RowMenu } from "@/components/admin/RowMenu";
import { CameraIcon, CheckIcon, ExternalIcon, HistoryIcon, PencilIcon, PlusIcon, ReceiptIcon } from "@/components/stock/icons";
import { NEW_TAB } from "@/components/ui";
import { carCosts } from "@/lib/admin/costs";
import { marginOf } from "@/lib/admin/margins";
import { adminCars } from "@/lib/admin/stock-admin";
import { can } from "@/lib/permissions";
import { daysSince, fmtAgoOn, fmtDate, fmtEur, fmtNum } from "@/lib/admin/format";
import { carName, siteCarUrl, priceLabel } from "@/lib/stock/format";
import { FUEL_LABELS, FUELS, GEARBOXES, GEARBOX_LABELS, forSale, isReduced, isSold, type Car, onPublicSite } from "@/lib/stock/types";
import { stockSource } from "@/lib/stock-source";
import { listingHref } from "@/lib/stock-source-rules";
import { listing } from "@/lib/stock-source";
import { dealerProfile } from "@/lib/tenancy/current";
import { counts, syncLine } from "@/components/admin/SyncPanel";
import { RefreshStock } from "@/components/admin/RefreshStock";
import { StockBulk, StockPick, StockPickToggle } from "@/components/admin/StockBulk";
import { CarThumb } from "@/components/admin/CarThumb";
import { AgeBar } from "@/components/admin/charts";
import { FEW_PHOTOS, stockViews, parseStockList, stockList, type StockView } from "@/lib/admin/stock-views";
import { salesStore, type Sale } from "@/lib/admin/collections";
import type { DealerRules } from "@/lib/tenancy/profile";
import { Suspense } from "react";
import { Skeleton, TableBones } from "@/components/admin/Skeleton";
import { syncStatus } from "@/lib/donedeal/sync";
import { dropPriceAction, syncNowAction, toggleSoldAction, undoDropAction, withdrawnAction } from "./actions";
import { suggestedDrop } from "@/lib/admin/overview";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { enabledModules, hasModule } from "@/lib/modules";
import { conditionShown } from "@/lib/modules-rules";

export const metadata = { title: "Stock" };

// The views (src/lib/admin/stock-views.ts) are the summary: each is a tile with its count, and the chosen one filters the table.

type StockParams = { view?: string; status?: string; q?: string; make?: string; fuel?: string; gearbox?: string; sort?: string; dir?: string; per?: string; saved?: string; deleted?: string; sale?: string; reserved?: string; undone?: string; page?: string; synced?: string; review?: string };

export default async function Page({ searchParams }: { searchParams: Promise<StockParams> }) {
  const sp = await searchParams;
  const { view, q, make, fuel, gearbox } = parseStockList(sp);
  const [all, source, deposits, { site: listingSite, url: listingUrl }, { siteUrl, rules }] = await Promise.all([adminCars(), stockSource(), hasModule("sales"), listing(), dealerProfile()]);
  const OLD_DAYS = rules.oldStockDays;
  const STOCK_VIEWS = stockViews(OLD_DAYS);
  const synced = source === "donedeal";
  const sync = synced ? await syncStatus() : null;
  const sales = new Map((await salesStore.list()).map((s) => [s.id, s]));
  const saleFor = sp.sale ? all.find((c) => c.id === sp.sale) : undefined;
  const tradeIn = saleFor && sales.get(saleFor.id)?.tradeIn;
  const reservedNow = sp.reserved ? all.find((c) => c.id === sp.reserved) : undefined;
  const undoneNow = sp.undone ? all.find((c) => c.id === sp.undone) : undefined;
  // The makes in stock, for the make filter.
  const makes = [...new Map(all.map((c) => [c.makeSlug, c.make])).entries()].sort((a, b) => a[1].localeCompare(b[1], "en-IE"));
  const matching = stockList(all, view, q, OLD_DAYS, { make, fuel, gearbox });
  const saved = sp.saved ? all.find((c) => c.id === sp.saved) : undefined;
  // A view keeps the search and the filters; the sort and the page start again.
  const href = (v: StockView) => `/stock?${new URLSearchParams(Object.entries({ view: v, q, make, fuel, gearbox }).filter((e): e is [string, string] => Boolean(e[1])))}`;
  const takenDown = synced ? all.filter((c) => c.takenDownAt) : [];
  const canUndo = await can("settings"); // undoing a sale is money going back: owners and managers
  const social = await hasModule("social");
  // Every filter in one panel: the make (those in stock), the fuel, the gearbox.
  const filters: FilterGroup[] = [
    { name: "make", label: "Make", any: "Every make", options: makes },
    { name: "fuel", label: "Fuel", any: "Any fuel", options: FUELS.filter((f) => all.some((c) => c.fuel === f)).map((f) => [f, FUEL_LABELS[f]] as const) },
    { name: "gearbox", label: "Gearbox", any: "Any gearbox", options: GEARBOXES.map((g) => [g, GEARBOX_LABELS[g]] as const) },
  ];

  // What needs doing about the stock, at the top, each with the button that does it. Every sold car with no sale, as the overview and the
  // Sold view's Record sale buttons count them; photos and price drops for the cars still to sell. Drafts only in our version.
  const toRecord = all.filter((c) => isSold(c) && !sales.has(c.id)).sort((a, b) => a.soldAt!.localeCompare(b.soldAt!));
  const needPhotos = all.filter((c) => !isSold(c) && c.photos.length < FEW_PHOTOS);
  const old = all.filter((c) => STOCK_VIEWS.old.test(c));
  const drafts = synced ? [] : all.filter((c) => c.listing === "draft" && !isSold(c));
  const one = (cars: Car[], many: string, single: string) => (cars.length === 1 ? single : many);
  // The why under each task is for a laptop: on a phone the task and its button, so the cars are on the first screen.
  const phoneless = (text: string) => <span className="max-sm:hidden">{text}</span>;
  const todo = [
    // One at a time, oldest first: the row and its button open the next sale to record, so the count and the page behind it agree.
    toRecord.length > 0 && (
      <Task key="sale" urgency="now" icon={<ReceiptIcon />} count={toRecord.length} title={one(toRecord, "sold cars with no sale recorded", "sold car with no sale recorded")} detail={phoneless("Add the buyer and the price, so your reports are right.")} href={`/stock/${toRecord[0].id}/sale`}
        action={<Link href={`/stock/${toRecord[0].id}/sale`} aria-label={`Record sale: ${carName(toRecord[0])}`} className={rowButtonStrong}>Record sale</Link>} />
    ),
    !synced && needPhotos.length > 0 && (
      <Task key="photos" urgency="soon" icon={<CameraIcon />} count={needPhotos.length} title={one(needPhotos, "cars need more photos", "car needs more photos")} detail={phoneless(`Cars with ${FEW_PHOTOS} or more photos get more enquiries.`)} href={href("photos")}
        action={<Link href={`/stock/${needPhotos[0].id}#photos`} className={rowButtonStrong}>Add photos</Link>} />
    ),
    old.length > 0 && (
      <Task key="old" urgency="soon" icon={<HistoryIcon />} count={old.length} title={one(old, `cars for sale ${OLD_DAYS} days or more`, `car for sale ${OLD_DAYS} days or more`)} detail={phoneless(synced ? `Think about a price drop on ${listingSite}.` : social ? "Tick them below to drop the price, or post them to social." : "Tick them below to drop the price.")} href={href("old")}
        action={<Link href={href("old")} className={rowButton}>See them</Link>} />
    ),
    drafts.length > 0 && (
      <Task key="drafts" icon={<PencilIcon />} count={drafts.length} title={one(drafts, "drafts not on the website yet", "draft not on the website yet")} detail={phoneless("Finish them and publish when ready.")} href={href("drafts")}
        action={<Link href={href("drafts")} className={rowButton}>See drafts</Link>} />
    ),
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Stock"
        text={sync ? (sync.lastOkAt ? `Last updated ${fmtAgoOn(sync.lastOkAt)}` : "Not updated yet") : "Press a car to change its price, photos or details"}
        actions={
          <>
            {synced ? (
              <>
                <RefreshStock />
                <a href={listingUrl} {...NEW_TAB} className={adminButton}>
                  <ExternalIcon className="shrink-0 size-4" />
                  Open {listingSite}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </>
            ) : (
              <Link href="/stock/new" className={adminButton}>
                <PlusIcon className="shrink-0 size-4" />
                Add a car
              </Link>
            )}
          </>
        }
      />
      {/* A failing sync stays in view while it fails. A held one (the answer looked wrong) can be applied by an owner or manager: the alert sends them here. */}
      {sync?.problem && (
        <div className="flex flex-col gap-2">
          <Notice tone="warn">{syncLine(sync)}</Notice>
          {sync.held && canUndo && (
            <form action={syncNowAction.bind(null, true)}>
              <FormActions>
                <SubmitButton className={adminButtonQuiet}>Apply anyway</SubmitButton>
              </FormActions>
            </form>
          )}
        </div>
      )}
      {sync && sp.synced && !sync.problem && <Notice>Stock refreshed. {counts(sync.result ?? { added: 0, changed: 0, takenDown: 0 }, "No changes")}.</Notice>}
      {saved && (
        <Notice>
          Saved {carName(saved)}.
          {!synced && saved.photos.length === 0 && (
            <>
              {" "}
              <Link href={`/stock/${saved.id}#photos`} className="font-semibold underline">Add its photos</Link>
            </>
          )}
        </Notice>
      )}
      {saleFor && (
        <Notice>
          Sale recorded for {carName(saleFor)}.
          {/* The car taken as a trade-in is the next car in stock: start it from its registration. Our version only. */}
          {!synced && tradeIn && (
            <>
              {" "}
              <Link href={`/stock/new?reg=${encodeURIComponent(tradeIn.reg)}`} className="font-semibold underline">Add the trade-in, {tradeIn.reg}, to stock</Link>
            </>
          )}
        </Notice>
      )}
      {saleFor && sp.review === "failed" && <Notice tone="warn">The review request did not go.</Notice>}
      {saleFor && sp.review === "none" && <Notice tone="neutral">No review request went.</Notice>}
      {sp.deleted && <Notice tone="neutral">Car deleted.</Notice>}
      {reservedNow && <Notice>Deposit taken. {carName(reservedNow)} shows as Reserved on the website.</Notice>}
      {undoneNow && <Notice tone="neutral">Sale undone for {carName(undoneNow)}. The record is kept.</Notice>}
      {/* DoneDeal does not say why an ad came down, so the car is hidden until the dealer says. Above the table, so a phone has it too. */}
      {takenDown.length > 0 && (
        <Panel title={`Ads taken down on ${listingSite}`}>
          <p className="max-w-measure text-body text-text-2">These cars are off the website. Did they sell?</p>
          <ul className="divide-y divide-hairline">
            {takenDown.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{carName(c)}</span>
                  <span className="text-meta text-text-2">Ad came down {fmtDate(Date.parse(`${c.takenDownAt}T12:00:00Z`))}</span>
                </span>
                <span className="ml-auto flex flex-wrap justify-end gap-2">
                  <Link href={`/stock/${c.id}/sale`} className={rowButtonStrong}>It sold</Link>
                  <RowMenu label={`More for ${carName(c)}`}>
                    <ActButton act={withdrawnAction.bind(null, c.id)} confirm={{ title: `${carName(c)} did not sell?`, text: `It stays off the website. If the ad goes back up on ${listingSite}, the car comes back too.`, yes: "It did not sell" }} className={rowButton}>
                      It did not sell
                    </ActButton>
                  </RowMenu>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {/* Hidden and Drafts only show when they hold a car (or are open), so a dealer who never uses them never sees them. Need photos and
          the old stock view are reached from To do, so they show only while open. */}
      <SummaryTabs label="Stock views" items={(Object.keys(STOCK_VIEWS) as StockView[])
          .map((v) => [v, all.filter(STOCK_VIEWS[v].test).length] as const)
          .filter(([v, count]) => view === v || (!["photos", "old"].includes(v) && (count > 0 || !["hidden", "drafts", "reserved"].includes(v))))
          .map(([v, count]) => ({ label: STOCK_VIEWS[v].label, count, href: href(v), active: view === v }))} />
      {/* Under the views, so they stay put when one is picked. On the plain list only, as on Leads: its counts are of the whole stock, a search is looking for something else. */}
      {todo.length > 0 && view === "for-sale" && !q && !make && !fuel && !gearbox && (!sp.page || sp.page === "1") && (
        <Panel title="To do" count={todo.length}>
          <TaskList label="To do">{todo}</TaskList>
        </Panel>
      )}
      <TableToolbar search={{ placeholder: "Search", label: "Search stock" }} filters={filters} action={synced ? undefined : <StockPickToggle />} />
      {/* The cars stream in under the views and the search, so a tap on a view works from the first paint (#109).
          Keyed by the view only: a new view shows the bones, a search, sort or page keeps the old rows until the new ones come. */}
      <Suspense key={view} fallback={<Skeleton><TableBones /></Skeleton>}>
        <StockTable sp={sp} matching={matching} sales={sales} view={view} q={q} synced={synced} social={social} canUndo={canUndo} deposits={deposits} siteUrl={siteUrl} rules={rules} listingSite={listingSite} listingUrl={listingUrl} oldDays={OLD_DAYS} />
      </Suspense>
    </>
  );
}

// The table: every row, its buttons and the margin column. Rendering a page of cars with their buttons is the slow part, so it streams in.
async function StockTable({ sp, matching, sales, view, q, synced, social, canUndo, deposits, siteUrl, rules, listingSite, listingUrl, oldDays: OLD_DAYS }: { sp: StockParams; matching: Car[]; sales: Map<string, Sale>; view: StockView; q?: string; synced: boolean; social: boolean; canUndo: boolean; deposits: boolean; siteUrl?: string; rules: DealerRules; listingSite: string; listingUrl: string; oldDays: number }) {
  // A sold car with no sale recorded gets the button: Mark sold in our version records it; after the DoneDeal sync it is asked for here.
  const recordSale = (c: Car) =>
    isSold(c) && !sales.has(c.id) ? (
      <Link href={`/stock/${c.id}/sale`} aria-label={`Record sale: ${carName(c)}`} className={rowButtonStrong}>
        Record sale
      </Link>
    ) : null;
  // The margin column is for staff with the margins permission; without it the costs are not even read.
  const costs = (await can("margins")) ? new Map([...(await carCosts())].map(([id, c]) => [id, c.total])) : null;
  const marginPrice = (c: Car) => (isSold(c) ? sales.get(c.id)?.priceEur : undefined) ?? c.priceEur;
  // Where a row goes: the car's editor here, or, for synced stock, the car on the dealer's website in a new tab (it is changed on DoneDeal).
  // A synced car off the website (its ad came down) has no page there, so it opens here; so does every car with AI, to improve its description.
  const ai = synced && (await hasModule("ai"));
  const mods = await enabledModules();
  const open = (c: Car) => (synced && !ai && siteUrl && onPublicSite(c, rules.soldVisibleDays) && conditionShown(mods, c.condition) ? siteCarUrl(siteUrl, c.slug) : `/stock/${c.id}`);
  const undoSale = (c: Car) =>
    canUndo && isSold(c) && sales.has(c.id) ? (
      <Link href={`/stock/${c.id}/undo-sale`} className={rowButton}>
        Undo sale
      </Link>
    ) : null;
  // Post and View, menu items at every width; anyShareItems mirrors when they show (CarActions), so a synced car's menu is never empty.
  const shareItems = (c: Car) => (
    <>
      {social && <PostToSocial car={c} className={rowButton} />}
      <ViewOnSite car={c} shown={conditionShown(mods, c.condition)} className={rowButton} />
    </>
  );
  // The price drop suggested on old stock (#172), in the old stock view, for owners and managers (the settings permission, as the action
  // checks). Our version applies it here; synced stock is changed on the listing site.
  const drop = (c: Car) => (view === "old" && canUndo ? suggestedDrop(c, rules) : null);
  const dropButton = (c: Car, to: number) => (
    <ActButton act={dropPriceAction.bind(null, c.id, c.priceEur)} undo={undoDropAction.bind(null, c.id, c.priceEur, c.wasPriceEur ?? 0, to)} done={`${carName(c)} is now ${fmtEur(to)}`} label={`Drop ${carName(c)} to ${fmtEur(to)}`} className={rowButton}>
      Drop to {fmtEur(to)}
    </ActButton>
  );
  const editThere = (c: Car) => (
    <a href={listingHref(c, listingUrl)} {...NEW_TAB} className={rowButton} aria-label={`Edit ${carName(c)} on ${listingSite} (opens in a new tab)`}>
      <PencilIcon className="shrink-0 size-4" />
      Edit on {listingSite}
    </a>
  );
  const anyShareItems = (c: Car) => (social && forSale(c)) || (conditionShown(mods, c.condition) && Boolean(siteUrl) && onPublicSite(c, rules.soldVisibleDays));

  const columns: Column<Car>[] = [
    // Tick several cars to change them at once (#104). Our version only: DoneDeal stock is changed on DoneDeal.
    // On a phone only after Select (StockPickToggle): bulk changes are rare there, and the row is for opening the car.
    ...(synced ? [] : [{ key: "pick", header: "Select", quietHeader: true, hide: "picking" as const, className: "w-10 !pr-0", cell: (c: Car) => <StockPick id={c.id} name={carName(c)} /> }]),
    {
      key: "car",
      header: "Car",
      sort: (c) => `${c.make} ${c.model} ${c.variant ?? ""}`,
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* Smaller on a phone under 400px, so the name still fits. */}
          <div className="h-9 w-12 shrink-0 overflow-hidden rounded-control bg-photo-bg min-[25rem]:h-12 min-[25rem]:w-16">
            <CarThumb src={c.photos[0]?.src} />
          </div>
          {/* The name, then the year, variant and registration, then what needs doing about the car (few photos, hidden, in stock too long). */}
          <div className="flex min-w-0 flex-col gap-1 py-1">
            <span className="min-w-0">
              <Link href={open(c)} {...(open(c).startsWith("/") ? {} : NEW_TAB)} title={`${c.make} ${c.model}`} className="line-clamp-2 font-medium after:absolute after:inset-0">
                {c.make} {c.model}
              </Link>
              {/* The reg on a line of its own, never clamped away by a long variant nor split at a dash. */}
              {c.reg && <span className="block whitespace-nowrap text-meta text-text-2">{c.reg}</span>}
              <span title={[c.year, c.variant].filter(Boolean).join(" · ")} className="line-clamp-2 text-meta text-text-2">
                {c.year}
                {/* The days in stock have their own column from 1024px. */}
                {c.listedAt && !isSold(c) && <span className="lg:hidden"> · <span className="whitespace-nowrap">{daysInStock(c.listedAt)}</span></span>}
                {c.variant && ` · ${c.variant}`}
              </span>
            </span>
            {/* Photo warnings only in Need photos: elsewhere To do counts them already. */}
            <CarFlags car={c} status={view === "all"} photos={view === "photos"} />
          </div>
        </div>
      ),
      // On a phone the car takes the room the price leaves (w-full; max-w-0 stops a full-width column stretching the table past its box),
      // with a floor so the name and reg stay readable; from 640px a cap keeps it from crowding the other columns.
      className: "max-sm:w-full max-sm:max-w-0 max-sm:min-w-[8.5rem] max-sm:!pr-2 sm:min-w-[13rem] sm:max-w-[18rem]",
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sort: (c) => c.priceEur,
      // Tight on a phone, and the was-price left to the car's page there, so the car's name has the room for one line. Price on request
      // wraps there, onto two lines.
      className: "max-sm:!pl-1 max-sm:whitespace-normal",
      cell: (c) => (
        <span className="flex flex-col items-end">
          <span className="font-medium">{priceLabel(c)}</span>
          {isSold(c) && sales.has(c.id) ? (
            <span className="text-meta text-text-2">sold for {fmtEur(sales.get(c.id)!.priceEur)}</span>
          ) : drop(c) ? (
            <span className="text-meta text-text-2">suggested {fmtEur(drop(c)!.priceEur)}</span>
          ) : (
            isReduced(c) && <span className="text-meta text-ok max-sm:hidden">was {fmtEur(c.wasPriceEur!)}</span>
          )}
        </span>
      ),
    },
    // A sold car's margin is on what it sold for, as on Margins; a car on request (price 0, no sale) has none.
    ...(costs ? [{ key: "margin", header: "Margin", align: "right" as const, hide: "md" as const, nowrap: true, sort: (c: Car) => (costs.has(c.id) && marginPrice(c) ? marginOf(marginPrice(c), costs.get(c.id)!).eur : undefined), cell: (c: Car) => (!marginPrice(c) ? "" : costs.has(c.id) ? <MarginCell eur={marginOf(marginPrice(c), costs.get(c.id)!).eur} /> : <span className="text-text-2">Not set</span>) }] : []),
    // How long a car has been for sale: what a dealer watches to decide on a price drop.
    // The days, and a bar that turns amber at the dealer's old stock days (the old stock view): which cars are ageing, down the column at a glance.
    {
      key: "age",
      header: "In stock",
      align: "right",
      hide: "lg",
      nowrap: true,
      sort: (c) => (c.listedAt && !isSold(c) ? daysSince(c.listedAt) : undefined),
      cell: (c) =>
        c.listedAt && !isSold(c) ? (
          <span className="inline-flex items-center gap-2">
            {/* The bar turns amber exactly for the cars the old stock view counts (for sale: not reserved or hidden); the days stay plain text. */}
            <span className="hidden 2xl:contents">
              <AgeBar days={daysSince(c.listedAt)} late={forSale(c) ? OLD_DAYS : Infinity} oldDays={OLD_DAYS} />
            </span>
            <span>{daysInStock(c.listedAt)}</span>
          </span>
        ) : (
          <span className="text-text-2">-</span>
        ),
    },
    { key: "km", header: "Mileage", align: "right", hide: "2xl", nowrap: true, sort: (c) => c.mileageKm, cell: (c) => (c.mileageKm !== undefined ? `${fmtNum(c.mileageKm)} km` : "") },
    {
      key: "actions",
      header: "",
      hide: "sm", // on a phone the row opens the car, and its page has these at the top
      cell: (c) => (
        // Above the row's own link, so these buttons are what a press on them hits. A button only for a step that is due (Record sale, a
        // price drop), and the rest under the row's menu, Mark sold first (#95).
        <div className="relative z-10 flex justify-end gap-2">
          {recordSale(c)}
          {synced ? (
            <>
              {/* With a suggested price, Edit on the listing site is the row's button: the price is changed there. */}
              {drop(c) && editThere(c)}
              {(undoSale(c) || (!c.takenDownAt && !drop(c)) || anyShareItems(c)) && (
                <RowMenu label={`More for ${carName(c)}`}>
                  {undoSale(c)}
                  {!c.takenDownAt && !drop(c) && editThere(c)}
                  {shareItems(c)}
                </RowMenu>
              )}
            </>
          ) : (
            <>
              {drop(c) && dropButton(c, drop(c)!.priceEur)}
              <RowMenu label={`More for ${carName(c)}`}>
                {!isSold(c) && (
                  <Link href={`/stock/${c.id}/sale`} aria-label={`Mark sold: ${carName(c)}`} className={rowButton}>
                    <CheckIcon className="shrink-0 size-4" />
                    Mark sold
                  </Link>
                )}
                <Link href={`/stock/${c.id}`} className={rowButton}>
                  <PencilIcon className="shrink-0 size-4" />
                  Edit details and photos
                </Link>
                {deposits && (forSale(c) || c.reserved) && !isSold(c) && (
                  <Link href={`/stock/${c.id}/reserve`} className={rowButton}>
                    {c.reserved ? "Deposit" : "Reserve"}
                  </Link>
                )}
                {shareItems(c)}
                <ListingButton car={c} className={rowButton} />
                {undoSale(c)}
                {/* Back on sale only where no sale is recorded: undoing a recorded sale keeps its record (Undo sale). */}
                {isSold(c) && !sales.has(c.id) && (
                  <ActButton act={toggleSoldAction.bind(null, c.id)} confirm={{ title: `Put ${carName(c)} back on sale?`, text: c.listing ? "It stays off the website until you show it." : "It goes back on the website for sale.", yes: "Put back on sale" }} className={rowButton}>
                    Back on sale
                  </ActButton>
                )}
              </RowMenu>
            </>
          )}
        </div>
      ),
    },
  ];

  // No sort chosen: the view's own order (stock-views.ts).
  const { rows: sorted, sort } = sortRows(matching, columns, sp, { key: "", dir: "asc" });
  const paged = pageOf(sorted, sp);
  const rows = paged.rows;
  return (
    <>
      {/* Keyed by the list's address: a new search or filter starts the bar again, counting the boxes that are really ticked. */}
      {!synced && <StockBulk key={new URLSearchParams(sp as Record<string, string>).toString()} canDelete={canUndo} />}
      <DataTable
        label="Stock"
        linkRows
        rows={rows}
        rowKey={(c) => c.id}
        columns={columns}
        sort={sort}
        empty={<EmptyState title="No cars match" text={q ? "Try a different search." : undefined} action={!synced && !q ? <Link href="/stock/new" className={adminButton}>Add a car</Link> : undefined} />}
      />
      {/* The list as it is filtered now, as a CSV: cost and margin columns only for the margins roles. */}
      <TableFooter page={paged.page} pageCount={paged.pageCount} total={paged.total} per={paged.per} exportHref="/stock/export" />
    </>
  );
}

// A loss is red, as on Margins.
const MarginCell = ({ eur }: { eur: number }) => <span className={eur < 0 ? "text-bad" : undefined}>{fmtEur(eur)}</span>;
