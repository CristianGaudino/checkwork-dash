import { afterEach, describe, expect, it, vi } from "vitest";
import { humanCheck, verifyTurnstile } from "./turnstile";

const reply = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body)));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verifyTurnstile", () => {
  it("passes only a good check made for sign-in, sending the secret, token and IP", async () => {
    const fetch = reply({ success: true, action: "sign-in" });
    vi.stubGlobal("fetch", fetch);
    expect(await verifyTurnstile("tok", "203.0.113.1", "sec")).toBe(true);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({ secret: "sec", response: "tok", remoteip: "203.0.113.1" });
  });

  it.each([
    ["a bad token", { success: false, "error-codes": ["invalid-input-response"] }, ["invalid-input-response"]],
    ["unknown codes, never passed on", { success: false, "error-codes": ["buyer@example.com"] }, ["other"]],
    ["a token made for another form", { success: true, action: "lead" }, ["action-mismatch"]],
    ["no reason given", { success: false }, ["rejected"]],
  ])("refuses %s", async (_, body, codes) => {
    vi.stubGlobal("fetch", reply(body));
    expect(await verifyTurnstile("tok", "", "sec")).toEqual(codes);
  });

  it("fails closed when Cloudflare cannot be reached, and asks nothing for an empty or over-long token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await verifyTurnstile("tok", "", "sec")).toEqual(["siteverify-failed"]);
    const fetch = reply({ success: true, action: "sign-in" });
    vi.stubGlobal("fetch", fetch);
    expect(await verifyTurnstile("", "", "sec")).toEqual(["no-token"]);
    expect(await verifyTurnstile("x".repeat(2049), "", "sec")).toEqual(["token-too-long"]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("humanCheck", () => {
  it("with no secret: skips in dev, tests and the E2E run, and refuses on a deployed Worker", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(await humanCheck("", "")).toBe("ok"); // NODE_ENV is test
    vi.stubEnv("NODE_ENV", "production");
    expect(await humanCheck("tok", "")).toBe("not-set-up");
    vi.stubEnv("E2E_FAKE_BACKENDS", "1");
    expect(await humanCheck("", "")).toBe("ok");
  });

  it("with the secret set, checks the token even outside production", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "sec");
    vi.stubGlobal("fetch", reply({ success: true, action: "sign-in" }));
    expect(await humanCheck("tok", "")).toBe("ok");
    expect(await humanCheck("", "")).toBe("failed");
    vi.stubGlobal("fetch", reply({ success: false }));
    expect(await humanCheck("tok", "")).toBe("failed");
  });
});
