import { ownerDealers } from "@/lib/owner-api/handler";

export const dynamic = "force-dynamic";
export const GET = (req: Request) => ownerDealers(req);
