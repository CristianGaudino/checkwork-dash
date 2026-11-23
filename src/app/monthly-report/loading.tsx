import { Bone, HeaderBones, Loading, PanelBones, TextBones, TileBones } from "@/components/admin/Skeleton";

export default function MonthlyReportLoading() {
  return (
    <Loading>
      <HeaderBones title="Monthly report" />
      {/* The month row under the header: both arrows, the month, Print at the end. */}
      <div className="flex items-center gap-2">
        <Bone className="size-11" />
        <Bone className="size-11" />
        <Bone className="ml-2 h-6 w-32" />
        <Bone className="ml-auto h-11 w-20" />
      </div>
      <PanelBones title="What to do">
        <TextBones />
      </PanelBones>
      <TileBones />
      <TileBones />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <PanelBones />
        <PanelBones />
        <PanelBones />
      </div>
    </Loading>
  );
}
