import { notFound } from "next/navigation";
import { getResource } from "@/lib/cms/resources";
import { getResourceConfig } from "@/lib/cms/resource-fields";
import ResourceForm from "@/components/admin/ResourceForm";

export const dynamic = "force-dynamic";

type Item = Record<string, unknown> & { id: string };

export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ resource: string; id: string }>;
}) {
  const { resource, id } = await params;
  const def = getResource(resource);
  const config = getResourceConfig(resource);
  if (!def || !config) notFound();

  const item = (await def.model.findUnique({ where: { id } })) as Item | null;
  if (!item) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">編輯{config.label}</h1>
      <ResourceForm resource={resource} config={config} initial={item} />
    </div>
  );
}
