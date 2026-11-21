import { ActButton } from "@/components/admin/ActButton";
import { rowButton, rowButtonStrong, rowDanger } from "@/components/admin/kit";
import { DRIVE_STATUS_LABELS, type TestDrive } from "@/lib/admin/collections";
import { DRIVE_NEXT } from "@/lib/admin/drives";
import { setDriveStatusAction } from "@/app/test-drives/actions";

// A booking's next steps (confirm, done, no show, cancel), each with Undo in its toast. The first is the likely one, so it is the strong one. Nothing for a booking that is over.
// `ahead`: the drive has not happened yet, so Mark done and No show are left off (the diary's coming days).
export function DriveSteps({ drive, ahead = false }: { drive: Pick<TestDrive, "id" | "name" | "status">; ahead?: boolean }) {
  const next = (DRIVE_NEXT[drive.status] ?? []).filter(([to]) => !ahead || (to !== "completed" && to !== "no-show"));
  if (next.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {next.map(([to, label], i) => (
        <ActButton key={to} act={setDriveStatusAction.bind(null, drive.id, to, drive.status)} undo={setDriveStatusAction.bind(null, drive.id, drive.status, to)} done={`${drive.name}: ${DRIVE_STATUS_LABELS[to]}`} label={`${label}: ${drive.name}`} className={to === "cancelled" ? rowDanger : i === 0 ? rowButtonStrong : rowButton}>
          {label}
        </ActButton>
      ))}
    </span>
  );
}
