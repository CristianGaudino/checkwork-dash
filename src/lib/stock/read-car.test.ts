import { describe, expect, it } from "vitest";
import type { Car } from "./types";

import { readCar } from "./types";

describe("readCar", () => {
  it("reads a car still stored as new as used, and leaves the rest alone", () => {
    const car = { id: "1", make: "Kia" } as Car;
    expect(readCar({ ...car, condition: "new" })).toEqual(car);
    expect(readCar({ ...car, condition: "commercial" })).toEqual({ ...car, condition: "commercial" });
    expect(readCar(car)).toEqual(car);
  });
});
