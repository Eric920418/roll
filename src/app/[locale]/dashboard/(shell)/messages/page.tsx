import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/guard";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
export default async function Page({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ connection?: string }>;
}) {
  const { locale } = await params;
  await requireUserPage(locale);
  const { connection } = await searchParams;
  const query = new URLSearchParams({ tab: "messages" });
  if (connection) query.set("connection", connection);
  redirect(pathForLocale(`/dashboard/matchmaking?${query}`, locale as Locale));
}
