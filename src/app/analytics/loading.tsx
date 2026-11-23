import { ChartBones, HeaderBones, Loading, PanelBones, SegmentBones, TextBones, TileBones } from "@/components/admin/Skeleton";

export default function AnalyticsLoading() {
  return (
    <Loading>
      <HeaderBones title="Analytics" text={false} />
      <SegmentBones className="w-72" />
      <TextBones />
      <TileBones />
      <PanelBones plain title="Where visits come from">
        <TileBones count={3} />
      </PanelBones>
      <PanelBones title="From visit to sale">
        <ChartBones className="h-32" />
      </PanelBones>
      <PanelBones title="Visitors each day">
        <ChartBones className="h-56" />
      </PanelBones>
    </Loading>
  );
}
