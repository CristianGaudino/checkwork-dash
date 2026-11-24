// The car a person wants to sell or trade in, as kept in a lead's `details` (label to value as read): the labels the site's forms already
// use for Make, Model, Year and Mileage (DETAIL_LABELS), and two the dealer adds.
export const CAR_LABELS = { make: "Make", model: "Model", year: "Year", mileage: "Mileage", condition: "Condition", asking: "Asking price" } as const;
export const CAR_CONDITIONS = ["Excellent", "Good", "Fair", "Needs work"] as const;
export type TheirCarFacts = { reg: string } & Record<keyof typeof CAR_LABELS, string>;

export const theirCar = (l: { reg?: string; details?: Record<string, string> }): TheirCarFacts => ({
  reg: l.reg ?? "",
  ...(Object.fromEntries(Object.entries(CAR_LABELS).map(([k, label]) => [k, l.details?.[label] ?? ""])) as Record<keyof typeof CAR_LABELS, string>),
});
// Its facts are shown in Their car, so the answers under What they asked leave them out.
export const isCarLabel = (label: string) => (Object.values(CAR_LABELS) as string[]).includes(label);
