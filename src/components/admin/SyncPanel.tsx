import { fmtAgo } from "@/lib/admin/format";
import type { SyncStatus } from "@/lib/donedeal/sync";

// The stock sync's state in one line, for Stock and Settings.
export const counts = (r: NonNullable<SyncStatus["result"]>, none = "No changes") =>
  [r.added && `${r.added} added`, r.changed && `${r.changed} changed`, r.takenDown && `${r.takenDown} taken down`].filter(Boolean).join(", ") || none;

export function syncLine(s: SyncStatus) {
  if (!s.lastRunAt) return "Not updated yet.";
  if (!s.problem) return `Last updated ${fmtAgo(s.lastOkAt!)}. ${counts(s.result ?? { added: 0, changed: 0, takenDown: 0 })}.`;
  // Its cars are gone, so none from the last update are shown: why they went, then what else is wrong now (DoneDeal not answering).
  if (s.removed) return s.removedWhy && s.problem !== s.removedWhy ? `${s.removedWhy} ${s.problem}` : s.problem;
  return `${s.problem} ${s.lastOkAt ? `The site shows the cars from the last update, ${fmtAgo(s.lastOkAt)}.` : "No cars have come through yet."}`;
}
