import { describe, expect, it, vi } from "vitest";
import { driveDays, driveTimes, inDriveHours } from "./constants";
import { leadSchema } from "./schema";
import { DEMO_PROFILE } from "@/lib/tenancy/profile";

describe("driveTimes", () => {
  it("runs from opening until an hour before closing, in half hours", () => {
    const tue = driveTimes("2026-11-10", DEMO_PROFILE.hours); // a Tuesday: 09:30 to 18:00
    expect(tue[0]).toBe("09:30");
    expect(tue.at(-1)).toBe("17:00");
    const sat = driveTimes("2026-11-14", DEMO_PROFILE.hours); // a Saturday: 10:00 to 16:00
    expect(sat[0]).toBe("10:00");
    expect(sat.at(-1)).toBe("15:00");
  });
  it("is empty on a day we are closed", () => expect(driveTimes("2026-11-15", DEMO_PROFILE.hours)).toEqual([])); // a Sunday
  it("lets the desk type any minute inside the hours, never outside", () => {
    expect(inDriveHours("2026-11-10", "09:45", DEMO_PROFILE.hours)).toBe(true);
    expect(inDriveHours("2026-11-10", "17:30", DEMO_PROFILE.hours)).toBe(false); // the last start is an hour before closing
    expect(inDriveHours("2026-11-15", "11:00", DEMO_PROFILE.hours)).toBe(false);
  });
});

describe("driveDays", () => {
  const days = driveDays(DEMO_PROFILE.hours, new Date("2026-11-13T10:00:00Z")); // a Friday
  it("starts tomorrow, skips closed days and stops at two months, the dashboard's limit too", () => {
    expect(days[0]).toBe("2026-11-14");
    expect(days).not.toContain("2026-11-15");
    expect(days[1]).toBe("2026-11-16");
    expect(days.at(-1)).toBe("2027-01-13"); // a Wednesday, the 13th two months on
  });
  it("skips bank holidays: no Christmas, St Stephen's Day or its Monday", () => {
    const xmas = driveDays(DEMO_PROFILE.hours, new Date("2026-12-20T10:00:00Z"));
    expect(xmas).not.toContain("2026-12-25");
    expect(xmas).not.toContain("2026-12-26"); // a Saturday, open on any other week
    expect(xmas).not.toContain("2026-12-28");
    expect(xmas).toContain("2026-12-29");
    expect(driveTimes("2026-12-26", DEMO_PROFILE.hours)).toEqual([]);
  });
  it("uses the Irish date, so late evening in Ireland is still that day", () => {
    expect(driveDays(DEMO_PROFILE.hours, new Date("2026-11-13T23:30:00Z"))[0]).toBe("2026-11-14");
  });
});

describe("leadSchema for a test drive and an alert", () => {
  const base = { clientRef: crypto.randomUUID(), sourcePath: "/used-cars/x", name: "Test buyer", email: "a@example.com", consent: "yes" };
  it("accepts a real day and time, and refuses a time that is not a slot or a day that is closed", () => {
    const day = driveDays(DEMO_PROFILE.hours)[0];
    const time = driveTimes(day, DEMO_PROFILE.hours)[0];
    expect(leadSchema.safeParse({ ...base, type: "test_drive", carId: "1", driveDate: day, driveTime: time }).success).toBe(true);
    expect(leadSchema.safeParse({ ...base, type: "test_drive", carId: "1", driveDate: day, driveTime: "03:00" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, type: "test_drive", carId: "1", driveDate: "2020-01-01", driveTime: time }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, type: "test_drive", carId: "1" }).success).toBe(false);
  });
  it("takes today from a form opened yesterday, but never a time that has passed", () => {
    vi.useFakeTimers({ now: new Date("2026-11-10T14:00:00Z") }); // a Tuesday, 14:00 in Ireland
    const drive = (driveTime: string) => leadSchema.safeParse({ ...base, type: "test_drive", carId: "1", driveDate: "2026-11-10", driveTime }).success;
    expect(drive("15:00")).toBe(true);
    expect(drive("10:00")).toBe(false);
    const last = driveDays(DEMO_PROFILE.hours).at(-1)!; // the last day the form offers, which yesterday's list does not have
    expect(leadSchema.safeParse({ ...base, type: "test_drive", carId: "1", driveDate: last, driveTime: driveTimes(last, DEMO_PROFILE.hours)[0] }).success).toBe(true);
    vi.useRealTimers();
  });
  it("takes an alert with just an email, and refuses an unknown kind or no email", () => {
    expect(leadSchema.safeParse({ clientRef: base.clientRef, sourcePath: "/", email: "a@example.com", consent: "yes", type: "alert", alertKind: "price-drop", carId: "1" }).success).toBe(true);
    expect(leadSchema.safeParse({ clientRef: base.clientRef, sourcePath: "/", email: "a@example.com", consent: "yes", type: "alert", alertKind: "spam" }).success).toBe(false);
    expect(leadSchema.safeParse({ clientRef: base.clientRef, sourcePath: "/", phone: "0871234567", consent: "yes", type: "alert", alertKind: "price-drop" }).success).toBe(false);
  });
});
