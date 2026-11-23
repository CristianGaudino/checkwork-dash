import { MAX_BODY, receivePresence } from "@/lib/site-api/presence";
import { readCapped, siteRequest } from "@/lib/site-api/request";

// A dealer's website says a tab is open (docs/site-api.md, #111). The website key decides the dealer.
export const dynamic = "force-dynamic";
export const POST = (req: Request) =>
  siteRequest(req, "presence", async () => {
    const text = await readCapped(req, MAX_BODY);
    return text === null ? { status: 413, outcome: "too-large" } : receivePresence(text);
  });
