import { sendMonthlyReport } from "@/lib/reports/send";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's cron on the 1st (worker.mjs) sends each dealer last month's report through here, with CRON_KEY and the dealer's id. The
// answer is a count only.
export const POST = (req: Request) => dealerJob(req, () => sendMonthlyReport());
