import { redirect } from "next/navigation";
import { can } from "@/lib/permissions";

// WhatsApp is a way alerts reach a person, not a place of its own (#142): an old link lands where it now lives. Owners and managers on the
// dealership's WhatsApp (Connected services: the number, whether it is connected, its use); everyone else on their own Notifications.
export default async function Page() {
  redirect((await can("settings")) ? "/settings?section=services" : "/settings?section=emails");
}
