"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/staff";
import { DEALER_COOKIE, dealerAccess } from "@/lib/tenancy/membership";

// Opens one of the dealers the signed-in person works at. Only one they are a member of: the id the form sends is checked against their
// memberships, and the cookie it sets is only a preference, checked again on every request (src/lib/tenancy/membership.ts). Secure:
// browsers still keep it on http://localhost (next dev, the E2E run), which counts as a secure origin.
export async function chooseDealerAction(data: FormData) {
  await requireStaff("choosing"); // signed in, and at a dealer: the chooser runs before one is open
  const id = String(data.get("dealer") ?? "");
  const a = await dealerAccess();
  const choices = a.state === "ok" || a.state === "choose" ? a.choices : [];
  if (!choices.some((c) => c.id === id)) notFound();
  (await cookies()).set(DEALER_COOKIE, id, { path: "/", maxAge: 31_536_000, sameSite: "lax", httpOnly: true, secure: true });
  revalidatePath("/", "layout"); // the whole frame, menu and name included, is drawn again for the dealer just opened
  redirect("/");
}
