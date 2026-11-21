import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminReachable } from "@/lib/demo";

describe("adminReachable", () => {
  // The CI job may set the open switch for the whole run, and passing undefined would fall back to it, so it is cleared first.
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", ""));
  afterEach(() => vi.unstubAllEnvs());
  it("is open in next dev, and closed in any build unless the open switch is 1", () => {
    expect(adminReachable("development", undefined)).toBe(true);
    expect(adminReachable("production", undefined)).toBe(false); // a build, whatever APP_ENV says, or with none
    expect(adminReachable(undefined, undefined)).toBe(false); // the tests themselves (NODE_ENV=test)
    expect(adminReachable("production", "true")).toBe(false);
    expect(adminReachable("production", "1")).toBe(true);
  });
});
