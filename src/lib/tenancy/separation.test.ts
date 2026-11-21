import { describe, vi } from "vitest";
import { separationCases } from "@/test/separation-cases";

vi.mock("server-only", () => ({}));
// The real request side: outside runAsDealer the setup's person (no email) is at no dealer, so nothing has a current dealer.
vi.mock("@/lib/tenancy/membership", () => vi.importActual("@/lib/tenancy/membership"));

// With no D1 (next dev, the E2E run): each dealer's records, stock and history in memory of their own.
describe("dealers kept apart (in memory)", () => separationCases());
