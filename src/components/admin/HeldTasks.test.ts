import { describe, expect, it } from "vitest";
import { keepOrder, outcomeOf } from "./HeldTasks";

describe("outcomeOf", () => {
  it("reads what the row becomes from the pressed button's name", () => {
    expect(outcomeOf("Mark contacted: Mary Byrne")).toBe("Contacted");
    expect(outcomeOf("Mark appointment set: Mary Byrne")).toBe("Appointment set");
    expect(outcomeOf("Spam: Mary Byrne")).toBe("Spam");
    expect(outcomeOf("Close: Duplicate, Mary Byrne")).toBe("Closed");
  });
  it("is nothing for a press that keeps the row", () => {
    for (const l of ["More for Mary Byrne", "Not spam: Mary Byrne", "Call Mary Byrne", "", null, undefined]) expect(outcomeOf(l)).toBeUndefined();
  });
});

describe("keepOrder", () => {
  const held = (...ids: string[]) => (id: string) => ids.includes(id);
  it("keeps a held row where it was, among the live ones", () => {
    expect(keepOrder(["a", "b", "c"], ["a", "c", "d"], held("b"))).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps a held first row first, and several held rows in their order", () => {
    expect(keepOrder(["a", "b", "c"], ["c"], held("a", "b"))).toEqual(["a", "b", "c"]);
  });
  it("drops a row that left without a press", () => {
    expect(keepOrder(["a", "b", "c"], ["a", "c"], held())).toEqual(["a", "c"]);
  });
  it("puts a row back live, in the server's order, after Undo", () => {
    expect(keepOrder(["a", "b", "c"], ["a", "b", "c"], held("b"))).toEqual(["a", "b", "c"]);
  });
});
