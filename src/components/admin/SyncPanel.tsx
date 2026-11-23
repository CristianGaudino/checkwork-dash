import { fmtAgo } from "@/lib/admin/format";
import type { SyncStatus } from "@/lib/donedeal/sync";

// The stock sync's state in one line, for Stock and Settings.
export const counts = (r: NonNullable<SyncStatus["result"]>, none = "Nothing had changed") =>
  [r.added && `${r.added} added`, r.changed && `${r.changed} changed`, r.takenDown && `${r.takenDown} taken down`].filter(Boolean).join(", ") || none;

export function syncLine(s: SyncStatus) {
  if (!s.lastRunAt) return "Not checked yet.";
  if (!s.problem) return `Last checked ${fmtAgo(s.lastOkAt!)}. ${counts(s.result ?? { added: 0, changed: 0, takenDown: 0 })}.`;
  return `${s.problem} ${s.lastOkAt ? `The site shows the cars from the last good check, ${fmtAgo(s.lastOkAt)}.` : "No cars have come through yet."}`;
}
