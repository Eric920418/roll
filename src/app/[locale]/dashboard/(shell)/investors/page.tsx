import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth/guard";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ checkInId?: string }> }) {
  const { locale } = await params; await requireUserPage(locale);
  const { checkInId } = await searchParams;
  const query = new URLSearchParams({ tab: "sharing" });
  if (typeof checkInId === "string" && checkInId.length <= 200) query.set("checkInId", checkInId);
  redirect(`${pathForLocale("/dashboard/matchmaking", locale as Locale)}?${query}`);
}
