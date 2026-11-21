import type { ActivityEntry, RefKind } from "./activity";

// What an activity row points at, as the page shows it. A person's record is named from the live record (`people`, by "kind:id"), so a
// deleted person shows as "A deleted lead" and no name outlives its record. Other records keep the label stored with the entry. Pure, so
// it is tested without the stores.
const WHERE: Record<RefKind, { noun: string; href: (id: string) => string }> = {
  car: { noun: "car", href: (id) => `/stock/${id}` },
  lead: { noun: "lead", href: (id) => `/leads/${id}` },
  drive: { noun: "test drive", href: (id) => `/test-drives/${id}` },
  alert: { noun: "stock alert", href: () => "/customers?tab=alerts" },
  subscriber: { noun: "subscriber", href: () => "/customers?tab=newsletter" },
  review: { noun: "review", href: () => "/reviews" },
  post: { noun: "post", href: () => "/marketing?tab=posts" },
  ad: { noun: "ad", href: () => "/marketing?tab=posts" },
  newsletter: { noun: "newsletter", href: () => "/marketing?tab=newsletters" },
  team: { noun: "team member", href: () => "/settings?section=team" },
};

export type RefView = { label: string; href?: string };

// `exists` says whether a record with a stored label is still there (a deleted car keeps its title but loses its link).
export function refView(e: Pick<ActivityEntry, "refKind" | "refId" | "refLabel">, people: Map<string, string>, exists: (kind: RefKind, id: string) => boolean): RefView | null {
  if (!e.refKind || !e.refId) return null;
  const where = WHERE[e.refKind];
  const live = e.refLabel ?? people.get(`${e.refKind}:${e.refId}`);
  if (live === undefined || !exists(e.refKind, e.refId)) return { label: live ?? `A deleted ${where.noun}` };
  return { label: live, href: where.href(e.refId) };
}
