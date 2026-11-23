"use client";

import { usePathname } from "next/navigation";
import { Bone, FormPageBones, HeaderBones, ListPageBones, Loading, PanelBones, RecordPageBones, TileBones } from "@/components/admin/Skeleton";
import AnalyticsLoading from "./analytics/loading";
import CustomersLoading from "./customers/loading";
import LeadsLoading from "./leads/loading";
import MarketingLoading from "./marketing/loading";
import MonthlyReportLoading from "./monthly-report/loading";
import ReportsLoading from "./reports/loading";
import StockLoading from "./stock/loading";
import TestDrivesLoading from "./test-drives/loading";

const PAGES: Record<string, () => React.ReactNode> = { analytics: AnalyticsLoading, customers: CustomersLoading, leads: LeadsLoading, marketing: MarketingLoading, "monthly-report": MonthlyReportLoading, reports: ReportsLoading, stock: StockLoading, "test-drives": TestDrivesLoading };

// The fallback for every page under it. Opening a page from another, its own loading.tsx shows; a page loaded from the address bar shows
// this one first, so it takes the page's shape from the path: the Overview's, a list page's own, a record's, a form's, or a bar, search and
// a table for the rest. Client side only to read the path. The sign-in pages are quick and drawn bare, so they show nothing.
export default function RootLoading() {
  const [first, second] = usePathname().split("/").filter(Boolean);
  if (first === "sign-in") return null;
  if (second === "new") return <FormPageBones />;
  if (second) return <RecordPageBones />;
  const Page = first ? PAGES[first] : undefined;
  if (Page) return <Page />;
  if (first) return <ListPageBones />;
  return (
    <Loading>
      <HeaderBones title="Overview" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex min-h-24 flex-col justify-between gap-3 rounded-card border border-hairline bg-card p-4">
            <Bone className="size-10" />
            <span className="flex flex-col gap-1.5">
              <Bone className="h-4 w-28 max-w-full" />
              <Bone className="h-3.5 w-36 max-w-full" />
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <PanelBones title="To do" />
        <div className="flex min-w-0 flex-col gap-6">
          <PanelBones title="Test drives" />
          <PanelBones plain title="Numbers">
            <TileBones />
          </PanelBones>
        </div>
      </div>
    </Loading>
  );
}
