import { chooseDealerAction } from "@/app/dealers/actions";
import { adminButtonQuiet } from "@/components/admin/kit";
import type { Choice } from "@/lib/tenancy/membership";

// The dealers the signed-in person works at, one button each. The open one, when there is one, is marked.
export function DealerChooser({ choices, current }: { choices: Choice[]; current?: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {choices.map((c) => (
        <li key={c.id}>
          <form action={chooseDealerAction}>
            <input type="hidden" name="dealer" value={c.id} />
            <button type="submit" aria-current={c.id === current ? "true" : undefined} className={`${adminButtonQuiet} w-full justify-between`}>
              <span>{c.name}</span>
              {c.id === current && <span className="text-meta font-normal text-text-2">Open now</span>}
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

// What someone sees with no dealer open: the list to pick from, or, at no dealer at all, that they have no access and nothing else.
// `email`: who Access signed in, so someone with two accounts can see which one it was (the person's own address, shown only to them).
export function DealerGate({ choices, email }: { choices?: Choice[]; email?: string }) {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-4">
        {choices ? (
          <>
            <h1 className="text-display font-bold">Choose a dealer</h1>
            <DealerChooser choices={choices} />
          </>
        ) : (
          <>
            <h1 className="text-display font-bold">No access</h1>
            <p className="text-body text-text-2">This email is not on a dealer&apos;s team here. Ask the dealer&apos;s owner to add you.</p>
            <p className="text-meta text-text-2">Signed in as {email ? <span className="font-medium text-text">{email}</span> : "an account with no email"}</p>
          </>
        )}
      </div>
    </main>
  );
}
