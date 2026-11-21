import type { NextRequest } from "next/server";
import { sitePhoto } from "@/lib/site-api/photos";

// A car photo on the dealer's website, by the signed link the stock answer gave (docs/site-api.md). No site key: an <img> cannot send one.
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: { params: Promise<{ dealer: string; key: string[] }> }) {
  const { dealer, key } = await params;
  return sitePhoto(dealer, key.join("/"), req.nextUrl.searchParams.get("sig") ?? "");
}
