import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportData } from "./monthly";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ placeId: undefined as string | undefined, mail: [] as string[], data: { leads: [], cars: [], sales: [], reviews: [] } as unknown as ReportData }));
vi.mock("@/lib/admin/collections", () => ({
  getSettings: async () => ({ team: [{ id: "1", name: "Ann", email: "ann@byrne.ie", role: "Owner" }] }),
  leaderEmails: (team: { email: string }[]) => team.map((t) => t.email),
}));
vi.mock("@/lib/leads/mail", () => ({ sendTo: async (_to: string[], m: { text: string }) => void db.mail.push(m.text) }));
vi.mock("./load", () => ({ loadReportData: async () => db.data }));
vi.mock("@/lib/tenancy/current", async () => {
  const { DEFAULT_PROFILE } = await import("@/lib/tenancy/profile");
  return { currentDealer: async () => ({ name: "Byrne Motors", demo: false, profile: { ...DEFAULT_PROFILE, placeId: db.placeId } }) };
});
const { sendMonthlyReport } = await import("./send");

const NOW = Date.parse("2026-11-10T12:00:00Z"); // the report is October's
// October: three cars sold on the listing site, one of them recorded as a sale in the dashboard.
const october = (): ReportData =>
  ({
    leads: [],
    cars: [["a", "2026-10-12"], ["b", "2026-10-15"], ["c", "2026-10-20"]].map(([id, soldAt]) => ({ id, slug: id, priceEur: 10000, photos: [], listedAt: "2026-09-01", soldAt })),
    sales: [{ id: "a", priceEur: 9000, soldOn: "2026-10-12" }],
    reviews: [],
  }) as unknown as ReportData;

beforeEach(() => {
  db.mail.length = 0;
  db.data = october();
});

describe("the monthly report email", () => {
  it("counts every car sold, the listing site's too, not only the recorded sales", async () => {
    expect(await sendMonthlyReport(NOW)).toMatchObject({ month: "2026-10", sent: 1 });
    expect(db.mail[0]).toContain(", 3 sold,");
  });
  it("has a reviews line only with Google reviews connected", async () => {
    db.placeId = undefined;
    await sendMonthlyReport(NOW);
    expect(db.mail[0]).not.toContain("Reviews:");
    db.placeId = "ChIJ1";
    await sendMonthlyReport(NOW);
    expect(db.mail[1]).toContain("Reviews: 0 new");
  });
});
