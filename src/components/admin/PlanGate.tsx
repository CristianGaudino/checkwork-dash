import { NotInPlan } from "@/components/admin/NotInPlan";
import { hasModule } from "@/lib/modules";
import type { ModuleId } from "@/lib/modules-rules";

// A module's pages (its folder's layout.tsx, one per path in MODULES' `dashboard`): the current dealer's plan decides, on the server, on
// every load and every navigation into the folder. Without the module the screen says what it is and how to get it; its actions refuse
// on their own (requireModule).
export async function PlanGate({ id, children }: { id: ModuleId; children: React.ReactNode }) {
  return (await hasModule(id)) ? children : <NotInPlan id={id} />;
}
