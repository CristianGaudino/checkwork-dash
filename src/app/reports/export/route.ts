import { salesStore } from "@/lib/admin/collections";
import { carCosts } from "@/lib/admin/costs";
import { csvResponse } from "@/lib/admin/csv";
import { dublinDay } from "@/lib/admin/format";
import { PERIODS, monthsBetween, monthsOf, salesCsv, type Period } from "@/lib/admin/reports";
import { adminCars } from "@/lib/admin/stock-admin";
import { can } from "@/lib/permissions";
import { dealerAccess } from "@/lib/tenancy/membership";

// The sales of a period as a CSV for the dealer's accountant (#173): Reports' period (?period=3, 6 or 12), or ?from=2026-01&to=2026-03.
// Costs and margins: the margins roles only, as on Reports. No buyer details.
export async function GET(req: Request) {
  if (!(await can("margins"))) return new Response(null, { status: 404 }); // as the margins screens answer anyone else
  const access = await dealerAccess();
  if (access.state !== "ok") return new Response(null, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const asked = Number(sp.get("period"));
  const months = sp.has("from") || sp.has("to") ? monthsBetween(sp.get("from") ?? "", sp.get("to") ?? "") : monthsOf((PERIODS as readonly number[]).includes(asked) ? (asked as Period) : 12, dublinDay());
  if (!months) return new Response("Choose the months as from=2026-01&to=2026-03.", { status: 400 });
  const [sales, cars, costs] = await Promise.all([salesStore.list(), adminCars(), carCosts()]);
  const span = months.length === 1 ? months[0] : `${months[0]}-to-${months.at(-1)}`;
  return csvResponse(`sales-${access.dealer.id}-${span}`, salesCsv({ sales, cars, costs, months }), false);
}
