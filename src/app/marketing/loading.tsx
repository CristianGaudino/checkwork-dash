import { HeaderBones, Loading, PanelBones, TabBones, TileBones, ToolbarBones } from "@/components/admin/Skeleton";

export default function MarketingLoading() {
  return (
    <Loading>
      <HeaderBones title="Marketing" actions={1} />
      <TabBones count={4} />
      <PanelBones />
      <TileBones />
      <ToolbarBones />
      <PanelBones />
    </Loading>
  );
}
