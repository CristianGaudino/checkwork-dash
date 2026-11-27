import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/permission-rules";
import { helpGroups } from "./topics";

const ids = (role: Role) => helpGroups({ role, synced: false, listingSite: "DoneDeal", oldStockDays: 60 }).flatMap((g) => g.topics.map((t) => t.id));

describe("help topics", () => {
  it("shows each role only its own help", () => {
    expect(ids("Owner")).toEqual(expect.arrayContaining(["answer-lead", "margins", "whatsapp", "add-team", "billing"]));
    expect(ids("Sales")).toEqual(expect.arrayContaining(["answer-lead", "whatsapp", "reports"]));
    for (const id of ["margins", "add-team", "billing"]) expect(ids("Sales")).not.toContain(id);
    expect(ids("Finance")).toEqual(expect.arrayContaining(["record-sale", "margins", "notifications"]));
    for (const id of ["answer-lead", "add-team", "billing", "whatsapp", "whatsapp-how", "whatsapp-alerts"]) expect(ids("Finance")).not.toContain(id); // no WhatsApp for Finance (#142)
  });
  it("gives every dealer every group (#212), and leaves out a group with nothing left for the role", () => {
    const owner = helpGroups({ role: "Owner", synced: false, listingSite: "DoneDeal", oldStockDays: 60 });
    expect(owner.map((g) => g.id)).toEqual(["leads", "test-drives", "stock", "marketing", "reports", "account"]);
    expect(helpGroups({ role: "Finance", synced: false, listingSite: "DoneDeal", oldStockDays: 60 }).map((g) => g.id)).not.toContain("marketing");
  });
  it("lists every WhatsApp alert, with the dealer's days", () => {
    const alerts = helpGroups({ role: "Owner", synced: false, listingSite: "DoneDeal", oldStockDays: 45 }).flatMap((g) => g.topics).find((t) => t.id === "whatsapp-alerts")!;
    expect(alerts.points).toHaveLength(10);
    expect(alerts.points!.join(" ")).toContain("45 days");
  });
  it("ids are unique, so each #link opens one topic", () => {
    const all = ids("Owner");
    expect(new Set(all).size).toBe(all.length);
  });
});
