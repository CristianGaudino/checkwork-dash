import { describe, expect, it } from "vitest";
import { directionsUrl, formatHours } from "./dealer";
import { DEMO_PROFILE } from "@/lib/tenancy/profile";

describe("hours and map links", () => {
  it("formats hours in plain 12 hour time", () => {
    expect(formatHours({ opens: "09:00", closes: "18:00" })).toBe("9am to 6pm");
    expect(formatHours({ opens: "12:00", closes: "17:30" })).toBe("12pm to 5:30pm");
    expect(formatHours({ opens: "00:00", closes: "09:05" })).toBe("12am to 9:05am");
    expect(formatHours({})).toBe("Closed");
  });

  it("points directions at the dealer's street, and encodes the place ID", () => {
    expect(directionsUrl(DEMO_PROFILE.address)).toBe("https://www.google.com/maps/search/?api=1&query=Long%20Mile%20Road%2C%20Dublin%2012%2C%20Ireland");
    expect(directionsUrl(DEMO_PROFILE.address, "ChIJ x")).toMatch(/&query_place_id=ChIJ%20x$/);
  });
});
