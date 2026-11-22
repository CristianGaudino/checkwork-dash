import { ownerKeys } from "@/lib/owner-api/keys";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ dealerId: string; service: string }> };
const handle = async (req: Request, ctx: Ctx) => {
  const { dealerId, service } = await ctx.params;
  return ownerKeys(req, dealerId, service);
};
export const PUT = handle;
export const DELETE = handle;
