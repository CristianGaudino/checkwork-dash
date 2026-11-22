import { ActButton } from "@/components/admin/ActButton";
import { adminButton, rowButton, rowButtonStrong, rowDanger } from "@/components/admin/kit";
import { RowMenu } from "@/components/admin/RowMenu";
import { DRIVE_STATUS_LABELS, type TestDrive } from "@/lib/admin/collections";
import { DRIVE_NEXT } from "@/lib/admin/drives";
import { setDriveStatusAction } from "@/app/test-drives/actions";

// A booking's next steps (confirm, done, no show, cancel), each with Undo in its toast. The first is the likely one, so it is the strong one. Nothing for a booking that is over.
// `ahead`: the drive has not happened yet, so Mark done and No show are left off (the diary's coming days).
// `page`: the booking's own page, where the first step is the filled button and Cancel stays in view. In a row, Cancel is under More, out of a slipping thumb's way.
export function DriveSteps({ drive, ahead = false, page = false }: { drive: Pick<TestDrive, "id" | "name" | "status">; ahead?: boolean; page?: boolean }) {
  const next = (DRIVE_NEXT[drive.status] ?? []).filter(([to]) => !ahead || (to !== "completed" && to !== "no-show"));
  if (next.length === 0) return null;
  const step = ([to, label]: (typeof next)[number], className: string) => (
    <ActButton key={to} act={setDriveStatusAction.bind(null, drive.id, to, drive.status)} undo={setDriveStatusAction.bind(null, drive.id, drive.status, to)} done={`${drive.name}: ${DRIVE_STATUS_LABELS[to]}`} label={`${label}: ${drive.name}`} className={className}>
      {label}
    </ActButton>
  );
  const cancel = next.find(([to]) => to === "cancelled");
  const rest = next.filter((s) => s !== cancel);
  return (
    <span className="flex flex-wrap gap-2">
      {rest.map((s, i) => step(s, i > 0 ? rowButton : page ? adminButton : rowButtonStrong))}
      {cancel && (page ? step(cancel, rowDanger) : <RowMenu label={`More for ${drive.name}`}>{step(cancel, rowButton)}</RowMenu>)}
    </span>
  );
}
