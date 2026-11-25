import { describe, expect, it, vi } from "vitest";
import type { Car } from "./types";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({}));
vi.mock("@/lib/tenancy/current", () => ({}));
const { readCar } = await import("./d1-provider");

describe("readCar", () => {
  it("reads a car still stored as new as used, and leaves the rest alone", () => {
    const car = { id: "1", make: "Kia" } as Car;
    expect(readCar({ ...car, condition: "new" })).toEqual(car);
    expect(readCar({ ...car, condition: "commercial" })).toEqual({ ...car, condition: "commercial" });
    expect(readCar(car)).toEqual(car);
  });
});
