import { describe, expect, it } from "vitest";
import { CLEAN, DEMO_HISTORY, historyFacts, historyWarnings, mileageOff, mockHistory } from "./history-rules";

const DAY = "2026-11-24";

describe("the simulated history check", () => {
  it("gives the same plate the same answer, however it is typed", () => {
    expect(mockHistory("191 d 12345", DAY)).toEqual(mockHistory("191-D-12345", DAY));
    expect(mockHistory("191-D-12345", DAY)).toMatchObject({ reg: "191-D-12345", checkedOn: DAY, firstRegistered: expect.stringMatching(/^2019-01-/) });
  });

  it("not an Irish plate: nothing", () => {
    expect(mockHistory("AB12 CDE", DAY)).toBeNull();
  });

  it("a plate outside the demo list is a clean car", () => {
    const h = mockHistory("191-D-12345", DAY)!;
    expect(historyWarnings(h)).toEqual([]);
    expect(h.mileage.length).toBeGreaterThan(0);
  });

  it("each demo plate shows its state, in plain words", () => {
    const says = (reg: string) => historyWarnings(mockHistory(reg, DAY)!);
    expect(Object.keys(DEMO_HISTORY)).toHaveLength(4);
    expect(says("151-D-1000")).toEqual(["Finance owed to Harbour Finance"]);
    expect(says("151-D-23817")).toEqual(["Written off, category B"]);
    expect(says("162-C-1037")).toEqual(["Mileage does not add up"]);
    expect(says("171-D-1384")).toEqual(["Imported from the UK"]);
  });
});

describe("the summary", () => {
  const h = mockHistory("191-D-12345", DAY)!;
  it("says a clean car is clean", () => {
    expect(CLEAN).toBe("No finance owed, never written off, and the mileage adds up.");
  });
  it("says finance owed without a finance house, and an import from nowhere named", () => {
    expect(historyWarnings({ ...h, financeOwed: true, imported: true })).toEqual(["Finance owed", "Imported"]);
  });
  it("gives the owners, first registration, NCT and last reading", () => {
    expect(historyFacts({ ...h, owners: 1, firstRegistered: "2019-01-05", nctExpiry: "2027-01-05", mileage: [{ on: "2025-01-05", km: 84000 }] })).toEqual(["1 owner", "First registered 5 Jan 2019", "NCT until 5 Jan 2027", "84,000 km on 5 Jan 2025"]);
    expect(historyFacts({ ...h, owners: 2, nctExpiry: undefined, mileage: [] })).toContain("No NCT on record");
  });
  it("flags a reading lower than the one before it", () => {
    expect(mileageOff([{ on: "2020-01-01", km: 50000 }, { on: "2022-01-01", km: 90000 }])).toBe(false);
    expect(mileageOff([{ on: "2020-01-01", km: 50000 }, { on: "2022-01-01", km: 40000 }])).toBe(true);
  });
});
