import { PlanGate } from "@/components/admin/PlanGate";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PlanGate id="newCars">{children}</PlanGate>;
}
