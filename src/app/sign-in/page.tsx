import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { signInOpen } from "@/lib/staff";

export const metadata: Metadata = { title: "Sign in" };

// Where a signed-out page goes under our sign-in (docs/sign-in.md, section 4). The form comes in steps 4 and 5; until then this lets no one
// in. Not there at all (404) while SIGN_IN is `access`, behind Access in `both`, and linked from nowhere.
export default async function SignInPage() {
  if (!(await signInOpen())) notFound();
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-display font-bold">Sign in to Checkwork</h1>
        <p className="text-body text-text-2">Signing in here is not open yet.</p>
      </div>
    </main>
  );
}
