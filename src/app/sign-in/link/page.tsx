import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Brand } from "../Brand";
import { card } from "@/components/ui";
import { safeNext } from "@/lib/auth/gate";
import { signInOpen } from "@/lib/staff";
import { LinkSignIn } from "./LinkSignIn";

export const metadata: Metadata = { title: "Sign in" };

// The link in the sign-in email (docs/sign-in.md, section 3). A GET only shows this page, and it must never redirect, signed in or not: a
// redirect would carry the #t fragment to another address. The page's script reads the token, clears it from the address bar and asks
// who it would sign in; only the button uses it.
export default async function LinkPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await signInOpen())) notFound();
  const next = safeNext((await searchParams).next);
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20">
      <div className={`${card} flex w-full max-w-sm flex-col gap-5 p-6`}>
        <Brand />
        <LinkSignIn next={next} />
      </div>
    </main>
  );
}
