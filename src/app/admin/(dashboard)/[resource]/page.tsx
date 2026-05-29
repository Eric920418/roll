import { notFound } from "next/navigation";
import { getResource } from "@/lib/cms/resources";
import { getResourceConfig } from "@/lib/cms/resource-fields";
import ResourceList from "@/components/admin/ResourceList";

export const dynamic = "force-dynamic";

type Item = Record<string, unknown> & { id: string };

export default async function ResourceListPage({
  params,
}: {
  params: Promise<{ resource: string }>;
}) {
  const { resource } = await params;
  const def = getResource(resource);
  const config = getResourceConfig(resource);
  if (!def || !config) notFound();

  const items = (await def.model.findMany({ orderBy: { order: "asc" } })) as Item[];

  return <ResourceList resource={resource} config={config} items={items} />;
}
