import { describe, expect, it } from "vitest";
import { MODULE_IDS, type ModuleId } from "@/lib/modules-rules";
import type { Role } from "@/lib/permission-rules";
import { helpGroups } from "./topics";

const ids = (role: Role, modules: readonly ModuleId[] = MODULE_IDS) => helpGroups({ role, modules: new Set(modules), synced: false, listingSite: "DoneDeal", oldStockDays: 60 }).flatMap((g) => g.topics.map((t) => t.id));

describe("help topics", () => {
  it("shows each role only its own help", () => {
    expect(ids("Owner")).toEqual(expect.arrayContaining(["answer-lead", "margins", "whatsapp", "add-team", "billing"]));
    expect(ids("Sales")).toEqual(expect.arrayContaining(["answer-lead", "whatsapp", "reports"]));
    for (const id of ["margins", "add-team", "billing"]) expect(ids("Sales")).not.toContain(id);
    expect(ids("Finance")).toEqual(expect.arrayContaining(["record-sale", "margins", "notifications"]));
    for (const id of ["answer-lead", "add-team", "billing", "whatsapp", "whatsapp-how", "whatsapp-alerts"]) expect(ids("Finance")).not.toContain(id); // no WhatsApp for Finance (#142)
  });
  it("leaves out a module's help without it, and a group with nothing left", () => {
    const base = helpGroups({ role: "Owner", modules: new Set<ModuleId>(["dashboard"]), synced: false, listingSite: "DoneDeal", oldStockDays: 60 });
    expect(base.map((g) => g.id)).toEqual(["leads", "stock", "account"]);
    expect(base.flatMap((g) => g.topics.map((t) => t.id))).not.toContain("whatsapp");
  });
  it("lists only the WhatsApp alerts the plan has, with the dealer's days", () => {
    const alerts = helpGroups({ role: "Owner", modules: new Set<ModuleId>(["dashboard", "whatsapp"]), synced: false, listingSite: "DoneDeal", oldStockDays: 45 }).flatMap((g) => g.topics).find((t) => t.id === "whatsapp-alerts")!;
    expect(alerts.points).toHaveLength(2); // enquiry and slow stock are the dashboard's
    expect(alerts.points!.join(" ")).toContain("45 days");
  });
  it("ids are unique, so each #link opens one topic", () => {
    const all = ids("Owner");
    expect(new Set(all).size).toBe(all.length);
  });
});
