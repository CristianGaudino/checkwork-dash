import { sendReminders } from "@/lib/admin/reminders";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's morning cron (worker.mjs) sends each dealer's NCT and service reminders to past buyers through here, with CRON_KEY and the
// dealer's id. The answer is counts only.
export const POST = (req: Request) => dealerJob(req, () => sendReminders());
