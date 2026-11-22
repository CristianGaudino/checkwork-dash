import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// Sessions in the directory's copy in memory (next dev, the E2E run); session.int.test.ts runs the same cases on D1's stand-in.
vi.mock("server-only", () => ({}));
const s = await import("./session");
const { memoryDirectory, resetMemoryDirectory } = await import("@/lib/tenancy/directory");
const { sessionCases } = await import("@/test/session-cases");

sessionCases(
  {
    reset: async () => resetMemoryDirectory(),
    addPerson: async (id, email) => void memoryDirectory().staff.push({ id, email, codeFailures: 0, codeLockedUntil: null, createdAt: new Date() }),
    stored: async () => memoryDirectory().sessions,
  },
  s,
);

describe("the session cookie", () => {
  const sent = (c: ReturnType<typeof s.sessionCookie>) => {
    const res = new NextResponse(null);
    res.cookies.set(c);
    return (res.headers.get("set-cookie") ?? "").split("; ");
  };
  it("is __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, and lasts the 7 days", () => {
    const parts = sent(s.sessionCookie("v"));
    expect(parts[0]).toBe("__Host-cw_session=v");
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "Max-Age=604800", "Secure", "HttpOnly", "SameSite=lax"]));
    expect(parts.some((p) => /^domain=/i.test(p))).toBe(false);
  });
  it("is deleted with the same attributes, or a browser would refuse to drop a __Host- cookie", () => {
    const parts = sent(s.endedSessionCookie());
    expect(parts[0]).toBe("__Host-cw_session=");
    expect(parts).toEqual(expect.arrayContaining(["Path=/", "Max-Age=0", "Secure", "HttpOnly", "SameSite=lax"]));
  });
});
