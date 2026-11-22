import { receiveCounts } from "@/lib/site-api/counts";
import { readCapped, siteRequest } from "@/lib/site-api/request";

// A dealer's website sends a day's anonymous visitor counts (docs/site-api.md). The website key decides the dealer.
export const dynamic = "force-dynamic";
export const POST = (req: Request) =>
  siteRequest(req, "counts", async () => {
    const text = await readCapped(req);
    return text === null ? { status: 413, outcome: "too-large" } : receiveCounts(text);
  });
