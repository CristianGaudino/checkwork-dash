import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { leadChips, leadKind } from "./LeadKind";

describe("leadKind and leadChips", () => {
  it("names a typed lead by its type, and a general message by its topic", () => {
    expect(leadKind("test-drive")).toEqual({ label: "Test drive", icon: "test-drive" });
    expect(leadKind("general")).toEqual({ label: "General", icon: "general" });
    expect(leadKind("general", "service")).toEqual({ label: "Service", icon: "service" });
    expect(leadKind("general", "made-up")).toEqual({ label: "General", icon: "general" });
  });
  it("never repeats the kind as a chip, and keeps the answers", () => {
    expect(leadChips("general", "buying", { timing: "this-week", hasTradeIn: "yes" })).toEqual(["This week", "Trade-in"]);
    expect(leadChips("enquiry", "finance", {})).toEqual(["Finance"]);
    expect(leadChips("enquiry", undefined)).toEqual([]);
  });
});
