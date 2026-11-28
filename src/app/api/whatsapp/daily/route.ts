import { sendDailyAlerts } from "@/lib/whatsapp/alerts";
import { dealerJob } from "@/lib/tenancy/jobs";

// The Worker's morning cron (worker.mjs) sends each dealer's WhatsApp alerts through here, with CRON_KEY and the dealer's id: slow stock,
// new reviews, and on a Monday last week's summary. Nothing until WhatsApp is connected. The answer is a count only.
export const POST = (req: Request) => dealerJob(req, () => sendDailyAlerts());
