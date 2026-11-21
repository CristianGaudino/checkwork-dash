import { receiveLead } from "@/lib/site-api/leads";
import { readCapped, siteRequest } from "@/lib/site-api/request";

// A dealer's website sends a lead (docs/site-api.md). The website key decides the dealer.
export const dynamic = "force-dynamic";
export const POST = (req: Request) =>
  siteRequest(req, "leads", async () => {
    const text = await readCapped(req);
    return text === null ? { status: 413, outcome: "too-large" } : receiveLead(text);
  });
