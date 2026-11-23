import { ownerSiteKeys } from "@/lib/owner-api/site-keys";

export const dynamic = "force-dynamic";
export const DELETE = async (req: Request, ctx: { params: Promise<{ dealerId: string; keyId: string }> }) => {
  const { dealerId, keyId } = await ctx.params;
  return ownerSiteKeys(req, dealerId, keyId);
};
