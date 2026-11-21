"use client";

import { createContext, useContext, useMemo } from "react";
import { parseModules, type ModuleId } from "@/lib/modules-rules";
import type { DealerFacts } from "@/lib/tenancy/profile";

// The dealer being viewed, for the browser (factsOf in src/lib/tenancy/profile.ts, set by src/app/layout.tsx for this request).

const Facts = createContext<DealerFacts | null>(null);
export function DealerFactsProvider({ value, children }: { value: DealerFacts; children: React.ReactNode }) {
  return <Facts.Provider value={value}>{children}</Facts.Provider>;
}
export function useDealerFacts(): DealerFacts {
  const f = useContext(Facts);
  if (!f) throw new Error("No dealer open"); // never another dealer's facts, nor made-up ones
  return f;
}
// The modules the dealer has now (#173). A demo bar switch refreshes the page, which brings the new plan from the server.
export function useModules(): Set<ModuleId> {
  const raw = useDealerFacts().modules;
  return useMemo(() => parseModules(raw), [raw]);
}
