import { describe, expect, it } from "vitest";
import { parseRole, roleCan } from "./permission-rules";

describe("roles", () => {
  it("reads only a real role, the owner otherwise", () => {
    expect(parseRole("Sales")).toBe("Sales");
    expect(parseRole("sales")).toBe("Owner");
    expect(parseRole(undefined)).toBe("Owner");
  });
  it("grants what each role has, and nothing to no role", () => {
    expect(["Owner", "Manager", "Finance", "Sales"].map((r) => roleCan(r as never, "margins"))).toEqual([true, true, true, false]);
    expect(["Owner", "Manager", "Finance", "Sales"].map((r) => roleCan(r as never, "team"))).toEqual([true, true, false, false]);
    expect(roleCan(null, "margins")).toBe(false);
  });
});
