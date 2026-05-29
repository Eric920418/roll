import { notFound } from "next/navigation";
import { getResourceConfig } from "@/lib/cms/resource-fields";
import ResourceForm from "@/components/admin/ResourceForm";

export const dynamic = "force-dynamic";

export default async function NewResourcePage({
  params,
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource } = await params;
  const config = getResourceConfig(resource);
  if (!config) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">新增{config.label}</h1>
      <ResourceForm resource={resource} config={config} initial={null} />
    </div>
  );
}
