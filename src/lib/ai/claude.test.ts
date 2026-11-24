import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
const limit = vi.fn();
vi.mock("@/lib/leads/bindings", () => ({ getBindings: () => ({ AI_LIMITER: { limit } }) }));
vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error { status = 500; }
  class Anthropic { static APIError = APIError; beta = { messages: { create } }; }
  return { default: Anthropic };
});
const { writeWithAI } = await import("./write");
const { runAsDealer } = await import("@/lib/tenancy/current");

const facts = { dealer: "Checkwork Motors", firstName: "Aoife", kind: "Test drive", message: "Can I see it Saturday? Call 087 123 4567", car: "2021 Skoda Octavia" };
const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "thinking", thinking: "" }, { type: "text", text }] });

// A real dealer (not a demo); the demo dealer is below: Claude with a key, the mock without.
describe("writeWithAI with a key (Claude), for a real dealer", () => {
  const real = (...a: Parameters<typeof writeWithAI>) => runAsDealer("test-motors", () => writeWithAI(...a));
  beforeEach(() => { process.env.ANTHROPIC_API_KEY = "test-key"; create.mockReset(); limit.mockReset().mockResolvedValue({ success: true }); });

  it("never calls Claude past the dealer's rate limit", async () => {
    limit.mockResolvedValueOnce({ success: false });
    expect(await real("opus", "leadReply", facts)).toEqual({ ok: false });
    expect(create).not.toHaveBeenCalled();
    expect(limit).toHaveBeenCalledWith({ key: "ai:test-motors" }); // per dealer: one dealer's use never blocks another's
  });
  afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  it("returns the text with dashes stripped", async () => {
    create.mockResolvedValue(reply("Hi Aoife — Saturday suits us – see you then."));
    expect(await real("opus", "leadReply", facts)).toEqual({ ok: true, text: "Hi Aoife, Saturday suits us, see you then." });
  });

  it("gives { ok: false } for a refusal, a max_tokens cut, an empty answer and a thrown error", async () => {
    create.mockResolvedValueOnce(reply("", "refusal"));
    expect(await real("opus", "leadReply", facts)).toEqual({ ok: false });
    create.mockResolvedValueOnce(reply("Hi Aoife, thanks for", "max_tokens"));
    expect(await real("opus", "leadReply", facts)).toEqual({ ok: false });
    create.mockResolvedValueOnce(reply("   "));
    expect(await real("opus", "leadReply", facts)).toEqual({ ok: false });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("timed out"));
    expect(await real("opus", "leadReply", facts)).toEqual({ ok: false });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Aoife"); // personal data never reaches the logs
    log.mockRestore();
  });

  it("sends the fixed system prompt and only the facts (plus the adjust) in the user turn", async () => {
    create.mockResolvedValue(reply("Dear Aoife, thank you."));
    await real("opus", "leadReply", facts, "formal", "Hi Aoife");
    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5-5");
    expect(JSON.stringify(req.system)).not.toContain("Aoife");
    expect(req.messages).toHaveLength(1);
    const user = req.messages[0].content as string;
    expect(user).toContain(JSON.stringify(facts));
    expect(user).toContain("<current_text>\nHi Aoife\n</current_text>");
    expect(user).toContain("More formal");
  });

  it("an urgency button never licenses a made-up deadline, and the prompts hold no dashes", async () => {
    create.mockResolvedValue(reply("Fresh in."));
    await real("opus", "leadReply", facts, "urgency");
    const req = create.mock.calls[0][0];
    expect(req.messages[0].content).toContain("never invent a deadline");
    expect(JSON.stringify(req)).not.toMatch(/[—–]/);
  });

  it("asks for the dealer's model, with the refusal fallback on both", async () => {
    create.mockResolvedValue(reply("Hi Aoife."));
    await real("opus", "leadReply", facts);
    await real("sonnet", "leadReply", facts);
    const [opus, sonnet] = create.mock.calls.map((c) => c[0]);
    expect(opus).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(sonnet).toMatchObject({ model: "claude-sonnet-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
  });
});

describe("writeWithAI for a demo dealer", () => {
  beforeEach(() => { create.mockReset(); limit.mockReset().mockResolvedValue({ success: true }); });
  afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  it("uses the mock and never calls Claude without a key", async () => {
    const r = await writeWithAI("opus", "leadReply", facts);
    expect(r).toMatchObject({ ok: true, text: expect.stringContaining("Hi Aoife,") });
    expect(create).not.toHaveBeenCalled();
  });

  it("calls real Claude with a key, through the same rate limiter", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    create.mockResolvedValue(reply("From Claude."));
    expect(await writeWithAI("opus", "leadReply", facts)).toEqual({ ok: true, text: "From Claude." });
    expect(limit).toHaveBeenCalledWith({ key: "ai:checkwork-motors" });
    limit.mockResolvedValueOnce({ success: false });
    expect(await writeWithAI("opus", "leadReply", facts)).toEqual({ ok: false });
  });
});
