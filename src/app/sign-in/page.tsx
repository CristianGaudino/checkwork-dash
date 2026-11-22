import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Brand } from "./Brand";
import { card } from "@/components/ui";
import { safeNext } from "@/lib/auth/gate";
import { currentSession } from "@/lib/auth/session";
import { signInOpen } from "@/lib/staff";
import { EmailForm } from "./EmailForm";

export const metadata: Metadata = { title: "Sign in" };

// Where a signed-out page goes under our sign-in (docs/sign-in.md, section 4). Not there at all (404) while SIGN_IN is `access`, behind Access
// in `both`, linked from nowhere. Someone with a live session goes on to `next`; a dead cookie is left alone (no loop).
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await signInOpen())) notFound();
  const next = safeNext((await searchParams).next);
  if (await currentSession()) redirect(next);
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20">
      <div className={`${card} flex w-full max-w-sm flex-col gap-5 p-6`}>
        <Brand />
        <h1 className="text-display font-bold">Sign in to Checkwork</h1>
        <EmailForm next={next} />
      </div>
    </main>
  );
}
