import { describe, vi } from "vitest";
import { carRaceCases } from "@/test/car-race-cases";

vi.mock("server-only", () => ({}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => ({ get: () => null }) }));

// With no D1 (next dev, the E2E run): the dealer's cars in memory.
describe("changing a car while others do (in memory)", () => carRaceCases());
