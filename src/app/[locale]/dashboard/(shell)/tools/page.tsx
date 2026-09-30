import { redirect } from "next/navigation";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default async function ToolsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${pathForLocale("/dashboard/agenda", locale as Locale)}#milestones`);
}
