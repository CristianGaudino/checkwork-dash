import "server-only";
import { getSettings, type TeamMember } from "@/lib/admin/collections";
import { modeOf } from "@/lib/integrations";
import { hasModule } from "@/lib/modules";
import { prefsOf, type Prefs } from "@/lib/notify-rules";
import { staffStore, type StaffPhone } from "@/lib/whatsapp/store";

// Each person on the team as one record (#142): who they are and their role (the directory's, through getSettings), and their own phone,
// quiet hours and what reaches them how (the dealer's store, by their id). Read here, so Settings and every sender agree. Someone with no
// record gets their role's defaults, never the owner's for a new person: changing those leaves the team as it was (addTeamAction).
export type Person = TeamMember & { phone: string; quietFrom: string; quietTo: string; prefs: Prefs; rec?: StaffPhone };

export async function people(): Promise<Person[]> {
  const [s, recs] = await Promise.all([getSettings(), staffStore.list()]);
  return s.team.map((t) => {
    const rec = recs.find((r) => r.id === t.id);
    return { ...t, phone: rec?.phone ?? "", quietFrom: rec?.quietFrom ?? "", quietTo: rec?.quietTo ?? "", prefs: prefsOf(rec, t.role, { followUps: s.notifications.followUps }), rec };
  });
}

// WhatsApp can reach the team: the dealer has the module and it is connected (simulated on a demo dealer).
export const whatsappOn = async () => (await hasModule("whatsapp")) && (await modeOf("whatsapp")) !== "off";
