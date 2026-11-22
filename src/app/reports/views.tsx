import { Segmented } from "@/components/admin/kit";
import { PERIODS, type Period } from "@/lib/admin/reports";

// Reports' views: the last 3, 6 or 12 months, or one month at a time (the monthly report, at its own address for the email's link).
// No `period`: the monthly report is the one open.
export function ReportViews({ period }: { period?: Period }) {
  return (
    <Segmented
      label="Period"
      items={[
        ...PERIODS.map((p) => ({ label: `${p} months`, href: p === 12 ? "/reports" : `/reports?period=${p}`, active: p === period })),
        { label: "Monthly", href: "/monthly-report", active: period === undefined },
      ]}
    />
  );
}
