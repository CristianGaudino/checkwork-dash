import { sendFollowUpDigest } from "@/lib/admin/follow-up-digest";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's morning cron (worker.mjs) sends each dealer's follow-up emails through here, with CRON_KEY and the dealer's id. It sends
// nothing unless the dealer turned the email on in Settings. The answer is a count only.
export const POST = (req: Request) => dealerJob(req, () => sendFollowUpDigest());
