import { notFound } from "next/navigation";
import { DealerChooser } from "@/components/admin/DealerChooser";
import { PageHeader } from "@/components/admin/kit";
import { dealerAccess } from "@/lib/tenancy/membership";

export const metadata = { title: "Switch dealer" };

// For someone at several dealers (the menu links here): which one to work on. Someone at one has nothing to switch to.
export default async function Page() {
  const a = await dealerAccess();
  if (a.state !== "ok" || a.choices.length < 2) notFound();
  return (
    <>
      <PageHeader title="Switch dealer" />
      <div className="max-w-sm">
        <DealerChooser choices={a.choices} current={a.dealer.id} />
      </div>
    </>
  );
}
