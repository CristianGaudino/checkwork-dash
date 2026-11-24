import type { TestDrive } from "./collections";
import { DRIVE_NEXT } from "./drives";

// The steps a booking can take now (#95): Mark done and No show only once its time has passed, not just its day, so they never take
// Confirm's place under a double tap and a confirmed booking still to come has no step. Pure, so it is tested.
export const driveSteps = (d: Pick<TestDrive, "status" | "startsAt">, now = Date.now()) =>
  (DRIVE_NEXT[d.status] ?? []).filter(([to]) => d.startsAt <= now || (to !== "completed" && to !== "no-show"));
