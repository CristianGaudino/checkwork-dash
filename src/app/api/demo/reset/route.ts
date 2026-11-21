import { revalidatePath } from "next/cache";
import { demoRecordsFor } from "@/lib/admin/docs";
import { resetDemoRecords } from "@/lib/admin/demo-reset";
import { isDemoSite } from "@/lib/site";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's morning cron (worker.mjs) puts a demo dealer's made-up records back to their seed, dated from today, with CRON_KEY and the
// dealer's id; on a Monday after the deploy moved the demo cars' sold dates, so a sale's day matches its car's again. The demo deploy and a
// demo dealer only: anywhere else it is not there.
export const POST = (req: Request) =>
  dealerJob(req, async (dealer) => {
    if (!isDemoSite() || !demoRecordsFor(dealer)) return null;
    await resetDemoRecords();
    revalidatePath("/", "layout");
    return { ok: true };
  });
