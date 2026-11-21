import { describe, expect, it, vi } from "vitest";
import type { Lead, TeamMember } from "./collections";

vi.mock("server-only", () => ({}));
// The demo bar's plan switch (a cookie): it counts here because the tests' dealer is the demo dealer (src/lib/tenancy/current.ts demoCookie).
let plan: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "checkwork-demo-modules" && plan ? { value: plan } : undefined) }), headers: async () => ({ get: () => null }) }));
const sendTo = vi.fn<(to: string[], mail: { subject: string; text: string }) => Promise<void>>(async () => {});
vi.mock("@/lib/leads/mail", () => ({ sendTo }));
const { digestGroups, sendFollowUpDigest } = await import("./follow-up-digest");
const { leadsStore, settingsStore, getSettings } = await import("./collections");

const team: TeamMember[] = [
  { id: "1", name: "Aoife", email: "aoife@x.ie", role: "Owner" },
  { id: "2", name: "Conor", email: "conor@x.ie", role: "Sales" },
  { id: "3", name: "Ciara", email: "ciara@x.ie", role: "Manager" },
  { id: "4", name: "Niamh", email: "niamh@x.ie", role: "Finance" },
];
const lead = (id: string, o: Partial<Lead>) => ({ id, status: "contacted", ...o }) as Lead;

describe("digestGroups", () => {
  it("sends each salesperson their own due follow-ups, and unassigned ones to owners and managers", () => {
    const g = digestGroups(
      [
        lead("mine", { assignedTo: "Conor", followUpOn: "2026-11-11" }),
        lead("late", { assignedTo: "Conor", followUpOn: "2026-11-01" }),
        lead("later", { assignedTo: "Conor", followUpOn: "2026-11-12" }),
        lead("nobody", { followUpOn: "2026-11-10" }),
        lead("gone", { assignedTo: "Someone who left", followUpOn: "2026-11-11" }),
        lead("won", { assignedTo: "Conor", followUpOn: "2026-11-01", status: "won" }),
      ],
      team,
      "2026-11-11",
    );
    expect(Object.fromEntries([...g].map(([k, v]) => [k, v.map((l) => l.id)]))).toEqual({ "conor@x.ie": ["mine", "late"], "aoife@x.ie": ["nobody", "gone"], "ciara@x.ie": ["nobody", "gone"] });
  });
});

describe("sendFollowUpDigest", () => {
  it("sends nothing when it is switched off, one email per person when on, and counts only what went", async () => {
    await settingsStore.reset();
    await settingsStore.put({ ...(await getSettings()), notifications: { followUps: false } });
    expect(await sendFollowUpDigest()).toEqual({ sent: 0 });
    await settingsStore.put({ ...(await getSettings()), notifications: { followUps: true } });
    const lead = (await leadsStore.list()).find((l) => l.status === "contacted")!;
    await leadsStore.put({ ...lead, followUpOn: "2020-01-01", assignedTo: undefined });
    sendTo.mockClear();
    const { sent } = await sendFollowUpDigest();
    expect(sent).toBe(sendTo.mock.calls.length);
    expect(sent).toBeGreaterThan(0);
    const [, mail] = sendTo.mock.calls[0];
    expect(mail.subject).toMatch(/follow-ups? today$/);
    expect(mail.text).toContain(`/leads/`);
    sendTo.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await sendFollowUpDigest()).sent).toBe(sent - 1);
  });
  it("sends nothing to a dealer without the dashboard", async () => {
    plan = "tradeIn";
    sendTo.mockClear();
    expect(await sendFollowUpDigest()).toEqual({ sent: 0 });
    expect(sendTo).not.toHaveBeenCalled();
    plan = undefined;
  });
});
