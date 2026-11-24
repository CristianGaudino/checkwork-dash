import { ownerBilling } from "@/lib/owner-api/billing";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ dealerId: string }> };
const handle = async (req: Request, ctx: Ctx) => ownerBilling(req, (await ctx.params).dealerId);
export const GET = handle;
export const PUT = handle;
