import Link from "next/link";
import { ActButton } from "@/components/admin/ActButton";
import { FormActions, adminButton, adminButtonQuiet, rowButton, rowButtonStrong, rowDanger } from "@/components/admin/kit";
import { CallButton } from "@/components/admin/LeadActions";
import { RowMenu } from "@/components/admin/RowMenu";
import { DRIVE_STATUS_LABELS, type TestDrive } from "@/lib/admin/collections";
import { DRIVE_NEXT } from "@/lib/admin/drives";
import { driveSteps } from "@/lib/admin/drive-steps";
import { setDriveStatusAction } from "@/app/test-drives/actions";

type Drive = Pick<TestDrive, "id" | "name" | "status" | "startsAt" | "phone">;

// Book a test drive again for the same person and car: the form reads the booking's id and fills itself in (test-drives/new).
export const rebookHref = (id: string) => `/test-drives/new?rebook=${encodeURIComponent(id)}`;

// A booking's next steps (confirm, done, no show, cancel), each with Undo in its toast. Mark done and No show only once the drive's time has
// passed (driveSteps), so a double tap on Confirm never lands on Mark done. A booking that is over gets Rebook.
// `page`: the booking's own page: every step in view, the first filled and right-most, Cancel at the far left. In a row (#95): only the first step, and
// everything else (Call, the other steps, Cancel, Rebook) under the row's menu, out of a slipping thumb's way; with no step due, only the
// menu. `primary` false: the step is a button elsewhere on the page (To do on the Overview), so the row has only its menu.
export function DriveSteps({ drive, page = false, primary = true }: { drive: Drive; page?: boolean; primary?: boolean }) {
  const next = driveSteps(drive);
  // Cancel asks first: a second press on Confirm, landing where Cancel then shows, must never cancel.
  const step = ([to, label]: (typeof next)[number], className: string) => (
    <ActButton key={to} act={setDriveStatusAction.bind(null, drive.id, to, drive.status)} undo={setDriveStatusAction.bind(null, drive.id, drive.status, to)} done={`${drive.name}: ${DRIVE_STATUS_LABELS[to]}`} confirm={to === "cancelled" ? { title: `Cancel ${drive.name}'s test drive?`, yes: "Cancel test drive" } : undefined} label={`${label}: ${drive.name}`} className={className}>
      {label}
    </ActButton>
  );
  const cancel = next.find(([to]) => to === "cancelled");
  const rest = next.filter((s) => s !== cancel);
  const over = !DRIVE_NEXT[drive.status];
  const rebook = (className: string) => (
    <Link href={rebookHref(drive.id)} aria-label={`Rebook ${drive.name}`} className={className}>
      Rebook
    </Link>
  );
  // On the page: bottom right with the next step right-most (#140), the others before it, and Cancel on the far left, away from it.
  if (page)
    return (
      <FormActions>
        {over ? (
          rebook(adminButtonQuiet)
        ) : (
          <>
            {cancel && step(cancel, rest.length ? `${rowDanger} mr-auto` : rowDanger)}
            {rest.map((s, i) => step(s, i > 0 ? rowButton : adminButton)).reverse()}
          </>
        )}
      </FormActions>
    );
  const first = primary ? rest[0] : undefined;
  const others = rest.filter((s) => s !== first);
  // `contents`: the buttons join the row's own line instead of wrapping as a block of their own.
  return (
    <span className="contents">
      {first && step(first, rowButtonStrong)}
      <RowMenu label={`More for ${drive.name}`}>
        <CallButton phone={drive.phone} name={drive.name} quiet />
        {others.map((s) => step(s, rowButton))}
        {cancel && step(cancel, rowButton)}
        {over && rebook(rowButton)}
      </RowMenu>
    </span>
  );
}
