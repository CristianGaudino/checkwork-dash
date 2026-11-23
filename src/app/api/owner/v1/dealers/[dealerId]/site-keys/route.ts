import { ownerSiteKeys } from "@/lib/owner-api/site-keys";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ dealerId: string }> };
const handle = async (req: Request, ctx: Ctx) => ownerSiteKeys(req, (await ctx.params).dealerId);
export const GET = handle;
export const POST = handle;
