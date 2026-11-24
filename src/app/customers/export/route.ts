import { logActivity } from "@/lib/admin/activity";
import { ALERT_KIND_LABELS, alertsStore, customersStore } from "@/lib/admin/collections";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { filterAlerts, filterCustomers } from "@/lib/admin/customer-lists";
import { can, DEMO_ROLE_REFUSED, realCan } from "@/lib/permissions";
import { hasModule } from "@/lib/modules";
import { dublinDay as day } from "@/lib/admin/format";

// The Customers page's list (customers or stock alerts), searched and filtered as it is shown, as a CSV. Personal data: owners and managers only, each export in
// the activity history.
export async function GET(req: Request) {
  // Real personal data: the directory's role, not the demo bar's (realCan). A demo viewer the bar showed the button to is told why.
  if (!(await realCan("data"))) return (await can("data")) ? new Response(DEMO_ROLE_REFUSED, { status: 403 }) : new Response(null, { status: 404 });
  if (!(await hasModule("dashboard"))) return new Response(null, { status: 404 }); // as every page answers without the dashboard (src/app/layout.tsx)
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const tab = sp.tab;
  // Each list only with its module, as on the page: alerts are the "newsletter" module's (its id kept for stored plans), customers are sales'.
  if (!(await hasModule(tab === "alerts" ? "newsletter" : "sales"))) return new Response(null, { status: 404 });
  if (tab === "alerts") {
    const rows = filterAlerts(await alertsStore.list(), sp).sort((a, b) => b.createdAt - a.createdAt);
    await logActivity("customers", `Exported the stock alerts (${rows.length})`);
    return csvResponse("stock-alerts", toCsv(rows, [["Email", (a) => a.email], ["Alert", (a) => ALERT_KIND_LABELS[a.kind]], ["For", (a) => a.criteria], ["On", (a) => (a.active ? "Yes" : "No")], ["Added", (a) => day(a.createdAt)], ["Last sent", (a) => (a.lastSentAt ? day(a.lastSentAt) : "")]]));
  }
  const rows = filterCustomers(await customersStore.list(), sp).sort((a, b) => b.lastContactAt - a.lastContactAt);
  await logActivity("customers", `Exported the customer list (${rows.length})`);
  return csvResponse("customers", toCsv(rows, [["Name", (c) => c.name], ["Email", (c) => c.email], ["Phone", (c) => c.phone], ["Source", (c) => c.source], ["Marketing", (c) => (c.marketingConsent ? "Agreed" : "No")], ["Added", (c) => day(c.createdAt)], ["Last contact", (c) => day(c.lastContactAt)]]));
}
