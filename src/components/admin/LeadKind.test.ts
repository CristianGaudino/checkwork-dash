import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { leadChips, leadKind } from "./LeadKind";

describe("leadKind and leadChips", () => {
  it("names a typed lead by its type, and a message by its topic", () => {
    expect(leadKind("test-drive")).toEqual({ label: "Test drive request", icon: "test-drive" });
    expect(leadKind("general")).toEqual({ label: "Message", icon: "general" });
    expect(leadKind("general", "service")).toEqual({ label: "Service", icon: "service" });
    expect(leadKind("order" as never)).toEqual({ label: "Car enquiry", icon: "enquiry" }); // stored by the Worker before #168, mid-deploy
    expect(leadKind("general", "made-up")).toEqual({ label: "Message", icon: "general" });
  });
  it("never repeats the kind as a chip, and keeps the answers", () => {
    expect(leadChips("general", "buying", { timing: "this-week", hasTradeIn: "yes" })).toEqual(["This week", "Trade-in"]);
    expect(leadChips("enquiry", "finance", {})).toEqual(["Finance"]);
    expect(leadChips("enquiry", undefined)).toEqual([]);
  });
});
