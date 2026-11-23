import { ChartBones, HeaderBones, Loading, PanelBones, SegmentBones, TableBones, TextBones, TileBones } from "@/components/admin/Skeleton";

export default function ReportsLoading() {
  return (
    <Loading>
      <HeaderBones title="Reports" />
      <SegmentBones />
      <TextBones />
      <TileBones />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PanelBones>
          <ChartBones className="h-56" />
        </PanelBones>
        <PanelBones />
      </div>
      <PanelBones>
        <TableBones bare rows={4} />
      </PanelBones>
    </Loading>
  );
}
