import { afterEach, describe, expect, it, vi } from "vitest";

let bound = false; // a real directory bound (the Worker)
vi.mock("@/lib/leads/bindings", () => ({ getBindings: () => (bound ? { DIRECTORY: {} } : {}) }));
const { appOpen, safeNext, sameOrigin, signInMode, signInPath } = await import("./gate");

afterEach(() => {
  vi.unstubAllEnvs();
  bound = false;
});

describe("the SIGN_IN switch", () => {
  it("is access when unset, empty or anything it does not know, so a typo or a missing var fails closed", () => {
    expect(signInMode(undefined)).toBe("access");
    for (const v of ["", "access", "Own", "OWN", " own", "both ", "own,both", "true", "1"]) expect(signInMode(v), v).toBe("access");
    expect(signInMode("both")).toBe("both");
    expect(signInMode("own")).toBe("own");
  });
  it("reads SIGN_IN from the environment", () => {
    expect(signInMode()).toBe("access");
    vi.stubEnv("SIGN_IN", "own");
    expect(signInMode()).toBe("own");
  });
});

describe("the open app's shortcut", () => {
  it("is open only in next dev or an open build, never with a directory bound, and E2E_SIGN_IN can only close it", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "");
    expect(appOpen()).toBe(false);
    vi.stubEnv("E2E_SIGN_IN", "0");
    expect(appOpen()).toBe(false); // the switch never opens anything
    vi.stubEnv("NEXT_PUBLIC_ADMIN_OPEN", "1");
    expect(appOpen()).toBe(true);
    vi.stubEnv("E2E_SIGN_IN", "1");
    expect(appOpen()).toBe(false); // the E2E run's closed server
    vi.stubEnv("E2E_SIGN_IN", "");
    bound = true;
    expect(appOpen()).toBe(false);
  });
});

describe("where to go after signing in (next)", () => {
  it("keeps a path on this site, and its query read and written again", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/leads")).toBe("/leads");
    expect(safeNext("/leads/real-1")).toBe("/leads/real-1");
    expect(safeNext("/leads?status=new&q=a b")).toBe("/leads?status=new&q=a+b");
    expect(safeNext("/dealers/open?dealer=checkwork-motors&to=%2Fleads%2Fl9")).toBe("/dealers/open?dealer=checkwork-motors&to=%2Fleads%2Fl9");
    expect(safeNext("/stock/export.csv")).toBe("/stock/export.csv");
    expect(safeNext("/leads?x=1#frag")).toBe("/leads?x=1");
  });
  it("refuses //, \\, another site, and anything not a plain path", () => {
    for (const bad of ["//evil.example", "//evil.example/leads", "/\\evil.example", "\\\\evil.example", "/leads\\x", "https://evil.example", "http://localhost/leads", "javascript:alert(1)", "leads", "", " /leads", "/\t/evil.example", "/le ads", "/%2F%2Fevil.example", "/leads#x", null, undefined, 42])
      expect(safeNext(bad), String(bad)).toBe("/");
  });
  it("is carried to the sign-in page as one encoded parameter", () => {
    expect(signInPath("/leads?status=new")).toBe("/sign-in?next=%2Fleads%3Fstatus%3Dnew");
    expect(signInPath("//evil.example")).toBe("/sign-in?next=%2F");
    expect(signInPath(null)).toBe("/sign-in?next=%2F");
  });
});

describe("sameOrigin", () => {
  const post = (origin?: string) => new Request("https://www.dash.checkwork.ie/sign-out", { method: "POST", headers: origin === undefined ? {} : { origin } });
  it("needs Origin present and equal to the app's own", () => {
    const app = "https://www.dash.checkwork.ie";
    expect(sameOrigin(post(app), app)).toBe(true);
    expect(sameOrigin(post(app), `${app}/`)).toBe(true);
    for (const o of [undefined, "", "null", "https://dash.checkwork.ie", "https://dev.dash.checkwork.ie", "https://demo.checkwork.ie", "http://www.dash.checkwork.ie", "https://www.dash.checkwork.ie:8443", "https://www.dash.checkwork.ie.evil.example", `${app}/`])
      expect(sameOrigin(post(o), app), String(o)).toBe(false);
  });
  it("uses this deploy's APP_URL", () => {
    vi.stubEnv("APP_URL", "http://localhost:3002");
    expect(sameOrigin(post("http://localhost:3002"))).toBe(true);
    expect(sameOrigin(post("https://www.dash.checkwork.ie"))).toBe(false);
  });
});
