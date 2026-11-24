"use server";

import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/admin/activity";
import { leadsStore } from "@/lib/admin/collections";
import { enabledModules, requireModule } from "@/lib/modules";
import { mayGet } from "@/lib/notify-rules";
import { currentMember } from "@/lib/permissions";
import { tap, typed } from "@/lib/whatsapp/handle";
import { BUTTON_LABELS, type ButtonId } from "@/lib/whatsapp/rules";
import { viewFor, type View } from "@/lib/whatsapp/store";
import { requireStaff } from "@/lib/staff";

// The phone panel's three calls (Settings, Notifications, Try WhatsApp). Each one checks the module and who is asking, acts, and sends back the conversation as it now is.
// The conversation holds buyers' names and messages: each action below checks staff first, wherever it is posted.
// Finance has no WhatsApp (#142): whatever is stored for them, they see no conversation and cannot tap or answer.
const NOTHING: View = { staff: [], buyer: [], buyerName: "", typing: false };
async function onWhatsApp(): Promise<string | null> {
  const me = await currentMember();
  return mayGet(me.role, "whatsapp", "enquiry") ? me.name : null;
}

async function view(): Promise<View> {
  await requireModule("whatsapp");
  const name = await onWhatsApp();
  return name === null ? NOTHING : viewFor(name, await enabledModules());
}

export async function snapshotAction(): Promise<View> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  return view();
}

export async function tapAction(msgId: string, button: string): Promise<View> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("whatsapp");
  const name = await onWhatsApp();
  if (name === null) return NOTHING;
  if (button in BUTTON_LABELS) {
    await tap(name, String(msgId).slice(0, 64), button as ButtonId);
    revalidatePath("/leads");
  }
  return view();
}

export async function sendAction(text: string): Promise<View> {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("whatsapp");
  const name = await onWhatsApp();
  if (name === null) return NOTHING;
  await typed(name, String(text));
  revalidatePath("/leads");
  return view();
}

// A buyer who asked not to hear on WhatsApp any more: nothing more goes to them that way (src/lib/whatsapp/handle.ts reads the opt-in), and
// email takes over where they gave an address. shortcut: the buyer's own STOP reply comes with the adapter (src/lib/whatsapp/send.ts).
export async function stopWhatsAppAction(leadId: string) {
  await requireStaff(); // a server action can be posted to any page: only staff Access let in (src/lib/staff.ts)
  await requireModule("whatsapp");
  const lead = await leadsStore.get(String(leadId));
  if (!lead?.whatsappOptIn) return;
  // false, not unset: the lead then says WhatsApp updates are off, and offers no WhatsApp button.
  if (!(await leadsStore.update(lead.id, (l) => ({ ...l, whatsappOptIn: false })))) return; // erased meanwhile: never written back
  await logActivity("leads", "Stopped WhatsApp updates to the buyer", { kind: "lead", id: lead.id }); // never the buyer
  revalidatePath(`/leads/${lead.id}`);
}
