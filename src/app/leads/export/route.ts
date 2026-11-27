import { sourceText } from "@/lib/visit-rules";
import { logActivity } from "@/lib/admin/activity";
import { LEAD_STATUS_LABELS, LEAD_TYPE_LABELS, getSettings, leadsStore } from "@/lib/admin/collections";
import { csvResponse, toCsv } from "@/lib/admin/csv";
import { dublinDateTime, dublinDay } from "@/lib/admin/format";
import { filterLeads, onLeadsList, parseLeadFilter } from "@/lib/admin/leads";
import { can, DEMO_ROLE_REFUSED, realCan } from "@/lib/permissions";
import { readLead } from "@/lib/leads/lead-text";

// The leads list as a CSV, with the list's filters. Personal data: owners and managers only, and each export is in the activity history.
export async function GET(req: Request) {
  // Real personal data: the directory's role, not the demo bar's (realCan). A demo viewer the bar showed the button to is told why.
  if (!(await realCan("data"))) return (await can("data")) ? new Response(DEMO_ROLE_REFUSED, { status: 403 }) : new Response(null, { status: 404 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const today = dublinDay();
  const rows = filterLeads((await leadsStore.list()).filter(onLeadsList), parseLeadFilter(sp), today, (await getSettings()).leadSlaHours);
  await logActivity("leads", `Exported the leads list (${rows.length === 1 ? "1 lead" : `${rows.length} leads`})`);
  return csvResponse(
    "leads",
    toCsv(rows, [
      ["Received", (l) => dublinDateTime(l.createdAt)],
      ["Name", (l) => l.name],
      ["Email", (l) => l.email],
      ["Phone", (l) => l.phone],
      ["Type", (l) => LEAD_TYPE_LABELS[l.type]],
      ["Source", sourceText],
      ["Status", (l) => LEAD_STATUS_LABELS[l.status]],
      ["Car", (l) => l.carTitle],
      ["Registration", (l) => l.reg],
      ["Message", (l) => readLead(l).text],
      ["Details", (l) => Object.entries(readLead(l).facts).map(([k, v]) => `${k}: ${v}`).join("\n")], // one answer to a line in the cell
      ["With", (l) => l.assignedTo],
      ["Follow up", (l) => l.followUpOn],
    ]),
  );
}
