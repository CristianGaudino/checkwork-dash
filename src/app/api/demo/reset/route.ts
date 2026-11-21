import { revalidatePath } from "next/cache";
import { resetDemoRecords } from "@/lib/admin/demo-reset";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's morning cron (worker.mjs) puts a demo dealer's made-up records back to their seed, dated from today, with CRON_KEY and the
// dealer's id; on a Monday after the deploy moved the demo cars' sold dates, so a sale's day matches its car's again. A demo dealer only,
// on any deploy: for any other dealer it is not there.
export const POST = (req: Request) =>
  dealerJob(req, async (dealer) => {
    if (!dealer.demo) return null;
    await resetDemoRecords();
    revalidatePath("/", "layout");
    return { ok: true };
  });
