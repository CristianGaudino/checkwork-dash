import { PageHeader } from "@/components/admin/kit";
import { getSettings } from "@/lib/admin/collections";
import { newestForSale, writeNewsletter } from "@/lib/admin/marketing";
import { adminCars } from "@/lib/admin/stock-admin";
import { requireModule } from "@/lib/modules";
import { currentDealer } from "@/lib/tenancy/current";
import { LetterForm } from "../LetterForm";

export const metadata = { title: "New newsletter" };

// "Write from the newest cars": the letter written from the stock, for the dealer to check and change before it is saved. Nothing is kept until then.
export default async function Page() {
  await requireModule("newsletter");
  const [{ marketing }, cars, { name, profile }] = await Promise.all([getSettings(), adminCars(), currentDealer()]);
  const { subject, body } = writeNewsletter(newestForSale(cars, 5), marketing, { name, siteUrl: profile.siteUrl });
  return (
    <>
      <PageHeader title="New newsletter" text="Written from your newest cars. Check it, then save it." back={{ href: "/marketing?tab=newsletters", label: "Newsletters" }} />
      <LetterForm subject={subject} body={body} />
    </>
  );
}
