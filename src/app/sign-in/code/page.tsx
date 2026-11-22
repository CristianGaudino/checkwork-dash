import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { card } from "@/components/ui";
import { safeNext, signInPath } from "@/lib/auth/gate";
import { signInOpen } from "@/lib/staff";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = { title: "Check your email" };

// The same page for every address (docs/sign-in.md, section 3): it never says whether one is on a team.
export default async function CodePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!(await signInOpen())) notFound();
  const next = safeNext((await searchParams).next);
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:py-20">
      <div className={`${card} flex w-full max-w-sm flex-col gap-5 p-6`}>
        <div className="flex flex-col gap-2">
          <h1 className="text-display font-bold">Check your email</h1>
          <p className="text-body text-text-2">If that email is on a team, we have sent a code to it. It works for 15 minutes.</p>
        </div>
        <CodeForm next={next} />
        <Link href={signInPath(next)} className="inline-flex min-h-11 items-center text-meta font-medium text-accent-text underline">
          Send a new code
        </Link>
      </div>
    </main>
  );
}
