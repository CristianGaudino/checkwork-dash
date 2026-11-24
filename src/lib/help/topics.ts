import { SHOW_PRICING } from "@/lib/billing/rules";
import type { ModuleId } from "@/lib/modules-rules";
import { roleCan, type Permission, type Role } from "@/lib/permission-rules";
import { BUTTON_LABELS, EVENTS, eventList } from "@/lib/whatsapp/rules";

// The Help page's how-to topics (#143), as data: one topic per job, grouped as the menu is, each shown only to the roles it is for and only
// when the dealer has its module. Plain data and a pure function, so the page and the tests agree. `id` is the topic's #link (/help#whatsapp).
export type HelpTopic = { id: string; title: string; summary: string; steps?: string[]; points?: string[]; note?: string; href: string; go: string };
export type HelpGroup = { id: string; title: string; topics: HelpTopic[] };
type Ctx = { role: Role | null; modules: ReadonlySet<ModuleId>; synced: boolean; listingSite: string; oldStockDays: number };
type Rule = HelpTopic & { roles?: readonly Role[]; permission?: Permission; module?: ModuleId };

// The people who work the leads and the stock day to day; finance comes for the figures, so their help is sales, margins and their account (WhatsApp alerts included: Finance gets them too).
const FLOOR: readonly Role[] = ["Owner", "Manager", "Sales"];

export function helpGroups({ role, modules, synced, listingSite, oldStockDays }: Ctx): HelpGroup[] {
  const margins = modules.has("margins") && roleCan(role, "margins");
  const alerts = eventList(modules, oldStockDays).filter((e) => e.on);
  const groups: { id: string; title: string; topics: Rule[] }[] = [
    {
      id: "leads",
      title: "Leads",
      topics: [{ id: "answer-lead", title: "Answer a new lead", summary: "Call, email or WhatsApp them, then set the status", steps: ["Open Leads and press the person's name.", "Call, email or WhatsApp them from the top of the lead.", "Set the status to Contacted so the team knows."], href: "/leads?status=new", go: "Go to leads", roles: FLOOR }],
    },
    {
      id: "test-drives",
      title: "Test drives",
      topics: [{ id: "book-test-drive", title: "Book a test drive", summary: "Pick the car, the day and a free time", steps: ["Press Book a test drive on the Overview.", "Pick the car, the day and a free time.", "Requests from your website show under To do: press Confirm."], href: "/test-drives/new", go: "Book a test drive", roles: FLOOR, module: "testDrives" }],
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
      topics: [{ id: "post-car", title: "Post a car to Facebook, Instagram or TikTok", summary: "Now, or on a day and time you choose", steps: ["Press New post on the Overview.", "Pick the car and the photos, and write a line or two.", "Post now, or choose a day and time."], href: "/marketing/new", go: "New post", roles: FLOOR, module: "social" }],
    },
    {
      id: "reports",
      title: "Reports and margins",
      topics: [
        { id: "reports", title: "Read your reports", summary: margins ? "Sales, where won leads came from, stock age and prep spend" : "Your own figures, month by month", steps: ["Open Reports.", "Pick 3, 6 or 12 months, or Monthly for one month at a time.", ...(margins ? [] : ["Only your own leads and sales are counted."])], href: "/reports", go: "Open reports", permission: "reports", module: "margins" },
        { id: "margins", title: "See what each car makes", summary: "Price less cost, prep and warranty repairs", steps: ["Open Margins.", "Each car shows its price less its cost, prep and warranty repairs, before VAT.", "A car with no cost price is left out until it has one: To do lists them."], href: "/margins", go: "Open margins", permission: "margins", module: "margins" },
      ],
    },
    {
      id: "account",
      title: "Your account and team",
      topics: [
        { id: "notifications", title: "Get notifications on this device", summary: "New leads and reminders on this phone or computer", steps: ["Open Settings, then Notifications.", "Press Turn on, and allow notifications when your browser asks.", "Do the same on each phone or computer you use."], href: "/settings?section=emails", go: "Open notifications" },
        // WhatsApp is one more way your alerts reach you, so it sits with the notifications, not in a place of its own.
        { id: "whatsapp", title: "Get new leads on WhatsApp", summary: "Leads on your phone, answered with a tap", steps: ["Open WhatsApp and press your name under Staff phones.", "Add your WhatsApp number and tick the alerts you want.", "Press Save. Quiet hours hold alerts back while you are off."], href: "/whatsapp", go: "Open WhatsApp", module: "whatsapp" },
        { id: "whatsapp-how", title: "How WhatsApp replies work", summary: "A buyer gets in touch, you tap a reply", steps: ["A buyer gets in touch: a trade-in, a test drive, a question about a car.", "It lands on your phone as a WhatsApp message with the car, the photos and buttons to answer.", "Tap a reply: the buyer gets your answer, and the lead and the activity log are updated for you."], note: `Buyers who tick the WhatsApp box on a form get your replies on WhatsApp, and can stop at any time. Everyone else gets email. ${SHOW_PRICING ? "If WhatsApp reaches its monthly limit, replies go by email instead. Alerts your plan includes still go by WhatsApp." : "If WhatsApp can't send, alerts and replies go by email instead."}`, href: "/whatsapp", go: "Open WhatsApp", module: "whatsapp" },
        { id: "whatsapp-alerts", title: "What reaches your phone", summary: `${alerts.length} kinds of alert on your plan`, points: alerts.map((e) => `${e.label}: ${e.does} Buttons: ${EVENTS[e.id].buttons.map((b) => BUTTON_LABELS[b]).join(", ")}.`), href: "/whatsapp", go: "Choose your alerts", module: "whatsapp" },
        { id: "add-team", title: "Add someone to your team", summary: "Their name, email and role", steps: ["Open Settings, then Team.", "Enter their name and email, and choose their role.", "Their role decides what they see: Settings lists what each role can see."], href: "/settings?section=team", go: "Open team settings", permission: "team" },
        { id: "billing", title: "Your plan and bills", summary: "What your plan includes, and how to add to it", steps: ["Open Billing to see your plan and what it includes.", "Press Ask us to add beside anything you want. It switches nothing on.", "Our reply shows here in Help, under What you sent us."], href: "/billing", go: "Open billing", permission: "billing" },
      ],
    },
  ];
  const shown = (t: Rule) => (!t.roles || (role !== null && t.roles.includes(role))) && (!t.permission || roleCan(role, t.permission)) && (!t.module || modules.has(t.module));
  return groups
    .map((g) => ({ ...g, topics: g.topics.filter(shown) }))
    .filter((g) => g.topics.length > 0);
}
