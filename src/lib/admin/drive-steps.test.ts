import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { driveSteps } = await import("./drive-steps");

const to = (s: ReturnType<typeof driveSteps>) => s.map(([t]) => t);

describe("driveSteps", () => {
  const now = Date.UTC(2026, 10, 23, 12);
  it("leaves Mark done and No show off until the drive's time has passed, even on its day", () => {
    expect(to(driveSteps({ status: "confirmed", startsAt: now + 60_000 }, now))).toEqual(["cancelled"]);
    expect(to(driveSteps({ status: "confirmed", startsAt: now }, now))).toEqual(["completed", "no-show", "cancelled"]);
  });
  it("offers Confirm on a request at any time, and nothing on a booking that is over", () => {
    expect(to(driveSteps({ status: "requested", startsAt: now + 86_400_000 }, now))).toEqual(["confirmed", "cancelled"]);
    expect(driveSteps({ status: "completed", startsAt: now - 1 }, now)).toEqual([]);
  });
});
