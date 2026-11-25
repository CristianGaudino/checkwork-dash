import { describe, expect, it } from "vitest";
import { parseModules } from "@/lib/modules-rules";
import { channelsOf, columnsFor, eventsFor, gets, mayGet, prefsOf, profileErrors, reachLine, readGrid, roleDefaults, type Prefs } from "./notify-rules";

const all = parseModules("all");

describe("who may get what, and how (#142)", () => {
  it("carries each event only on the channels that really send it", () => {
    expect(channelsOf("enquiry")).toEqual(["push", "whatsapp"]);
    expect(channelsOf("assigned")).toEqual(["push"]);
    expect(channelsOf("follow-ups")).toEqual(["email"]);
    expect(channelsOf("deposit")).toEqual(["whatsapp"]);
  });
  it("never gives Finance WhatsApp, and the Monday summary only to those who see the full reports", () => {
    expect(mayGet("Finance", "whatsapp", "deposit")).toBe(false);
    expect(mayGet("Finance", "push", "enquiry")).toBe(true);
    expect(mayGet("Sales", "whatsapp", "monday")).toBe(false);
    expect(mayGet("Owner", "whatsapp", "monday")).toBe(true);
    expect(mayGet(null, "push", "enquiry")).toBe(false);
    expect(eventsFor("Finance", all)).not.toContain("deposit"); // only WhatsApp carries it
    expect(eventsFor("Sales", all)).not.toContain("monday");
    expect(eventsFor("Owner", parseModules("dashboard"))).toEqual(["enquiry", "assigned", "follow-ups", "slow-stock"]);
  });
  it("shows the WhatsApp column with it connected and a phone, never for Finance", () => {
    expect(columnsFor("Sales", { on: true, phone: "+353 85 000 0000" })).toEqual(["push", "email", "whatsapp"]);
    expect(columnsFor("Sales", { on: true, phone: " " })).toEqual(["push", "email"]);
    expect(columnsFor("Sales", { on: false, phone: "+353 85 000 0000" })).toEqual(["push", "email"]);
    expect(columnsFor("Finance", { on: true, phone: "+353 85 000 0000" })).toEqual(["push", "email"]);
  });
});

describe("reading what is stored", () => {
  const rec = { id: "u2", name: "Conor", phone: "+353 85 000 0000", alerts: ["enquiry" as const], quietFrom: "", quietTo: "" };
  it("keeps a record from before #142: its WhatsApp alerts, with push and email from the role and the old morning switch", () => {
    expect(prefsOf(rec, "Sales", { followUps: true })).toEqual({ push: roleDefaults("Sales", true).push, email: ["follow-ups"], whatsapp: ["enquiry"] });
    expect(prefsOf(rec, "Sales", { followUps: false }).email).toEqual([]);
    expect(prefsOf(undefined, "Sales", { followUps: false })).toEqual(roleDefaults("Sales", false));
    expect(prefsOf({ ...rec, push: ["assigned"], email: [] }, "Sales", { followUps: true })).toMatchObject({ push: ["assigned"], email: [] });
  });
  it("gives Finance no WhatsApp by default, and a sender skips what a role may not get whatever is stored", () => {
    expect(roleDefaults("Finance", false).whatsapp).toEqual([]);
    expect(gets({ push: [], email: [], whatsapp: ["monday"] }, "Sales", "whatsapp", "monday")).toBe(false);
  });
});

describe("readGrid", () => {
  const was: Prefs = { push: ["enquiry", "trade-in"], email: ["follow-ups"], whatsapp: ["deposit", "trade-in"] };
  const sent = (o: Partial<Record<string, string[]>>) => (c: string) => o[c] ?? [];
  it("takes the ticked cells, and keeps what a module that is off or a hidden column had", () => {
    const shown = eventsFor("Sales", parseModules("dashboard,whatsapp,sales"));
    expect(shown).not.toContain("trade-in");
    const next = readGrid(sent({ push: ["assigned"], whatsapp: ["enquiry"] }), shown, ["push", "email", "whatsapp"], was);
    expect(next).toEqual({ push: ["trade-in", "assigned"], email: [], whatsapp: ["trade-in", "enquiry"] });
    expect(readGrid(sent({}), shown, ["push", "email"], was).whatsapp).toEqual(was.whatsapp); // no column: untouched
  });
  it("ignores a cell the channel cannot carry, or an event not shown", () => {
    expect(readGrid(sent({ email: ["enquiry", "nonsense"], push: ["deposit"] }), eventsFor("Owner", all), ["push", "email"], { push: [], email: [], whatsapp: [] })).toEqual({ push: [], email: [], whatsapp: [] });
  });
});

describe("reachLine", () => {
  const p: Prefs = { push: ["enquiry"], email: ["follow-ups"], whatsapp: ["enquiry"] };
  const events = eventsFor("Owner", all);
  it("names each way that reaches them, WhatsApp first", () => {
    expect(reachLine(p, "Sales", { devices: true, whatsapp: true }, events)).toBe("WhatsApp, push, email");
    expect(reachLine(p, "Sales", { devices: false, whatsapp: true }, events)).toBe("WhatsApp, email");
    expect(reachLine(p, "Finance", { devices: false, whatsapp: true }, events)).toBe("Email");
    expect(reachLine({ push: [], email: [], whatsapp: [] }, "Sales", { devices: true, whatsapp: true }, events)).toBe("The app only");
  });
});

describe("profileErrors", () => {
  it("takes a name of up to 100 characters, as a website lead does (#195)", () => {
    expect(profileErrors("x".repeat(100), "")).toEqual({});
    expect(profileErrors("x".repeat(101), "").name).toBe("Use 100 characters or fewer.");
  });
});
