import { describe, expect, it, vi } from "vitest";
import { historyFacts, historyWarnings } from "@/lib/history-rules";

vi.mock("server-only", () => ({}));
const { mapHistory } = await import("./one-auto");

describe("mapHistory", () => {
  it("leaves out what a partial answer does not say, so the summary never shows 0 owners or an empty date", () => {
    const h = mapHistory({ finance: { outstanding: true }, mileage_records: [{ date: "2024-03-01T00:00:00Z", mileage_km: 90000 }, { date: "2022-03-01", mileage_km: 60000 }] }, "191-D-1", "2026-11-24");
    expect(h).not.toHaveProperty("owners");
    expect(h).not.toHaveProperty("firstRegistered");
    expect(h.mileage.map((m) => m.on)).toEqual(["2022-03-01", "2024-03-01"]); // oldest first
    expect(historyWarnings(h)).toEqual(["Finance owed"]);
    expect(historyFacts(h)).toEqual(["No NCT on record", "90,000 km on 1 Mar 2024"]);
  });
});
