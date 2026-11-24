import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/kit";
import { newslettersStore } from "@/lib/admin/collections";
import { requireModule } from "@/lib/modules";
import { LetterForm } from "../LetterForm";

export const metadata = { title: "Edit newsletter" };

// A newsletter draft, to change before it is sent. A sent one is never changed, so it is not found here.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireModule("newsletter");
  const n = await newslettersStore.get((await params).id);
  if (!n || n.status !== "draft") notFound();
  return (
    <>
      <PageHeader title="Edit newsletter" back={{ href: "/marketing?tab=newsletters", label: "Newsletters" }} />
      <LetterForm id={n.id} subject={n.subject} body={n.body} />
    </>
  );
}
