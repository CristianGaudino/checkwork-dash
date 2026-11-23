import { HeaderBones, Loading, PanelBones, SegmentBones } from "@/components/admin/Skeleton";

export default function TestDrivesLoading() {
  return (
    <Loading>
      <HeaderBones title="Test drives" actions={1} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentBones className="w-64" />
        <SegmentBones className="w-52" />
      </div>
      <PanelBones />
      <PanelBones title="Next few days" />
    </Loading>
  );
}
