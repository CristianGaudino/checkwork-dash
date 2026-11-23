import { HeaderBones, Loading, TabBones, TableBones, ToolbarBones } from "@/components/admin/Skeleton";

export default function StockLoading() {
  return (
    <Loading>
      <HeaderBones title="Stock" actions={1} />
      <TabBones count={4} />
      <ToolbarBones />
      <TableBones />
    </Loading>
  );
}
