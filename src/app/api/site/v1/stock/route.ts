import { siteRequest } from "@/lib/site-api/request";
import { publicStock } from "@/lib/site-api/stock";

// A dealer's website reads the cars on it (docs/site-api.md). The website key decides the dealer.
export const dynamic = "force-dynamic";
export const GET = (req: Request) => siteRequest(req, "stock", publicStock);
