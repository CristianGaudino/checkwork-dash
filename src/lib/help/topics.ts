import { roleCan, type Permission, type Role } from "@/lib/permission-rules";
import { BUTTON_LABELS, EVENTS, eventList } from "@/lib/whatsapp/rules";

// The Help page's how-to topics (#143), as data: one topic per job, grouped as the menu is, each shown only to the roles it is for. Plain data and a pure function, so the page and the tests agree. `id` is the topic's #link (/help#whatsapp).
export type HelpTopic = { id: string; title: string; summary: string; steps?: string[]; points?: string[]; note?: string; href: string; go: string };
export type HelpGroup = { id: string; title: string; topics: HelpTopic[] };
type Ctx = { role: Role | null; synced: boolean; listingSite: string; oldStockDays: number };
type Rule = HelpTopic & { roles?: readonly Role[]; permission?: Permission };

// The people who work the leads and the stock day to day; finance comes for the figures, so their help is sales, margins and their account.
// WhatsApp is for these roles too: Finance has no WhatsApp alerts (#142, src/lib/notify-rules.ts).
const FLOOR: readonly Role[] = ["Owner", "Manager", "Sales"];

export function helpGroups({ role, synced, listingSite, oldStockDays }: Ctx): HelpGroup[] {
  const margins = roleCan(role, "margins");
  const alerts = eventList(oldStockDays);
  const groups: { id: string; title: string; topics: Rule[] }[] = [
    {
      id: "leads",
      title: "Leads",
      topics: [{ id: "answer-lead", title: "Answer a new lead", summary: "Call, email or WhatsApp them, then set the status", steps: ["Open Leads and press the person's name.", "Call, email or WhatsApp them from the top of the lead.", "Set the status to Contacted so the team knows."], href: "/leads?status=new", go: "Go to leads", roles: FLOOR }],
    },
    {
      id: "test-drives",
      title: "Test drives",
      topics: [{ id: "book-test-drive", title: "Book a test drive", summary: "Pick the car, the day and a free time", steps: ["Press Book a test drive on the Overview.", "Pick the car, the day and a free time.", "Requests from your website show under To do: press Confirm."], href: "/test-drives/new", go: "Book a test drive", roles: FLOOR }],
    },
    {
      id: "stock",
      title: "Stock",
      topics: [
        synced
          ? { id: "add-car", title: "Add or change a car", summary: `Cars come from ${listingSite}`, steps: [`Your cars come from ${listingSite}: add or change them there.`, "The website and this dashboard update by themselves.", ...(margins ? ["Its cost and prep are added here, on its page in Stock."] : [])], href: "/stock", go: "Go to stock", roles: FLOOR }
          : { id: "add-car", title: "Add a car", summary: "Photos, price and details, or a draft to finish later", steps: ["Press Add a car on the Overview or in Stock.", "Add the photos, the price and the details.", "Press Add car, or Save draft to finish it later."], href: "/stock/new", go: "Add a car", roles: FLOOR },
        synced
          ? { id: "record-sale", title: "Record a sale", summary: `When a car's ad comes down on ${listingSite}`, steps: [`When a car's ad comes down on ${listingSite}, it shows under To do.`, "Press Check, then It sold.", "Add the buyer and the price."], href: "/stock?view=sold", go: "Go to sold cars" }
          : { id: "record-sale", title: "Mark a car as sold", summary: "Add the buyer and the price", steps: ["Open Stock and find the car.", "Press Mark sold.", "Add the buyer and the price. It shows as Sold on your website."], href: "/stock", go: "Go to stock" },
      ],
    },
    {
      id: "marketing",
      title: "Marketing",
      topics: [{ id: "post-car", title: "Post a car to Facebook, Instagram or TikTok", summary: "Now, or on a day and time you choose", steps: ["Press New post on the Overview.", "Pick the car and the photos, and write a line or two.", "Post now, or choose a day and time."], href: "/marketing/new", go: "New post", roles: FLOOR }],
    },
    {
      id: "reports",
      title: "Reports and margins",
      topics: [
        { id: "reports", title: "Read your reports", summary: margins ? "Sales, where won leads came from, stock age and prep spend" : "Your own figures, month by month", steps: ["Open Reports.", "Pick 3, 6 or 12 months, or Monthly for one month at a time.", ...(margins ? [] : ["Only your own leads and sales are counted."])], href: "/reports", go: "Open reports", permission: "reports" },
        { id: "margins", title: "See what each car makes", summary: "Price less cost, prep and warranty repairs", steps: ["Open Margins.", "Each car shows its price less its cost, prep and warranty repairs, before VAT.", "A car with no cost price is left out until it has one: To do lists them."], href: "/margins", go: "Open margins", permission: "margins" },
      ],
    },
    {
      id: "account",
      title: "Your account and team",
      topics: [
        { id: "notifications", title: "Choose what reaches you", summary: "Each alert by push, email or WhatsApp", steps: ["Open Settings, then Notifications, and press Edit.", "Tick how each alert reaches you, and press Save.", "Under Notifications on this device, press Turn on on each phone or computer you use."], href: "/settings?section=emails", go: "Open notifications" },
        // WhatsApp is one more way your alerts reach you, so it sits with the notifications, not in a place of its own.
        { id: "whatsapp", title: "Get new leads on WhatsApp", summary: "Leads on your phone, answered with a tap", steps: ["Open Settings, then Profile, and add your mobile phone.", "Open Notifications, press Edit and tick WhatsApp for the alerts you want.", "Press Save. Quiet hours hold alerts back while you are off."], href: "/settings", go: "Open your profile", roles: FLOOR },
        { id: "whatsapp-how", title: "How WhatsApp replies work", summary: "A buyer gets in touch, you tap a reply", steps: ["A buyer gets in touch: a trade-in, a test drive, a question about a car.", "It lands on your phone as a WhatsApp message with the car, the photos and buttons to answer.", "Tap a reply: the buyer gets your answer, and the lead and the activity log are updated for you."], note: `Buyers who tick the WhatsApp box on a form get your replies on WhatsApp, and can stop at any time. Everyone else gets email. If WhatsApp reaches its monthly limit, replies go by email instead. Alerts your plan includes still go by WhatsApp.`, href: "/settings?section=emails", go: "Open notifications", roles: FLOOR },
        { id: "whatsapp-alerts", title: "What reaches your phone", summary: `${alerts.length} kinds of alert`, points: alerts.map((e) => `${e.label}: ${e.does} Buttons: ${EVENTS[e.id].buttons.map((b) => BUTTON_LABELS[b]).join(", ")}.`), href: "/settings?section=emails", go: "Choose your alerts", roles: FLOOR },
        { id: "add-team", title: "Add someone to your team", summary: "Their name, email and role", steps: ["Open Settings, then Team, and press Add someone.", "Enter their name and email, and choose their role.", "Press Edit on their row to add their phone or choose what reaches them."], href: "/settings?section=team", go: "Open team settings", permission: "team" },
        { id: "billing", title: "Your plan and bills", summary: "This month's bill, your limits and past bills", steps: ["Open Billing to see this month's bill so far, with your plan and what is paid per use.", "Set a monthly limit on lookups, history checks and WhatsApp in Settings, Monthly limits. At a limit the service stops until next month, and you are told.", "Open a past bill to see what it was made of."], note: "Your website, the dashboard, social and ads and everything else are in one plan. Lookups, history checks and WhatsApp messages past what your plan includes are paid per use. AI writing is included with fair use.", href: "/billing", go: "Open billing", permission: "billing" },
      ],
    },
  ];
  const shown = (t: Rule) => (!t.roles || (role !== null && t.roles.includes(role))) && (!t.permission || roleCan(role, t.permission));
  return groups
    .map((g) => ({ ...g, topics: g.topics.filter(shown) }))
    .filter((g) => g.topics.length > 0);
}
