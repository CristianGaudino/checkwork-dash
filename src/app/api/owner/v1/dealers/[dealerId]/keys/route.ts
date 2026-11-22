import { ownerKeys } from "@/lib/owner-api/keys";

export const dynamic = "force-dynamic";
export const GET = async (req: Request, ctx: { params: Promise<{ dealerId: string }> }) => ownerKeys(req, (await ctx.params).dealerId);
