import Link from "next/link";
import { adminButton } from "@/components/admin/kit";
import { card } from "@/components/ui";
import { whoCan, type Permission } from "@/lib/permission-rules";

// A page the person's role cannot open: which page, who it is for and how to get it, and the way back. The page returns this before it
// reads anything, so nothing of the page itself is in it. Who it is for comes from the permission rules, never written out here.
export function NotForRole({ title, permission }: { title: string; permission: Permission }) {
  return (
    <div className="flex flex-col items-center px-4 py-12">
      <div className={`${card} flex w-full max-w-lg flex-col items-center gap-3 p-8 text-center`}>
        <h1 className="text-display font-bold">Not for your role</h1>
        <p className="max-w-[45ch] text-body text-text-2">{title} is for {whoCan(permission)}. Ask an owner to change your role.</p>
        <Link href="/" className={`${adminButton} mt-2`}>
          Back to the overview
        </Link>
      </div>
    </div>
  );
}
