import { vi } from "vitest";

// The dashboard's actions ask src/lib/staff.ts who is there (a verified Access token). Unit tests of those actions are about what the
// action does, so here everyone is staff; src/lib/staff.test.ts tests the real check.
vi.mock("@/lib/staff", () => ({ requireStaff: async () => {}, staffIdentity: async () => ({ ok: true, email: "" }) }));

// And they work on the demo dealer, as nobody in particular (no role: the demo's tests pick one with the demo bar's cookie). Code inside
// runAsDealer still gets that dealer. src/lib/tenancy/*.test.ts test the real resolver (vi.importActual) and the separation between dealers.
vi.mock("@/lib/tenancy/membership", async (orig) => ({
  ...(await orig<typeof import("@/lib/tenancy/membership")>()),
  dealerAccess: async () => ({
    state: "ok",
    dealer: { id: "checkwork-motors", name: "Checkwork Motors", binding: "DB_CHECKWORK_MOTORS", demo: true, status: "active", createdAt: 0, profile: (await import("@/lib/tenancy/profile")).DEMO_PROFILE },
    role: null,
    email: "",
    choices: [{ id: "checkwork-motors", name: "Checkwork Motors" }],
  }),
}));
