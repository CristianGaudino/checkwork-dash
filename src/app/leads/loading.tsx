import { HeaderBones, Loading, PanelBones, TabBones, TableBones, ToolbarBones } from "@/components/admin/Skeleton";

export default function LeadsLoading() {
  return (
    <Loading>
      <HeaderBones title="Leads" />
      <TabBones count={5} />
      <PanelBones />
      <ToolbarBones />
      <TableBones />
    </Loading>
  );
}
