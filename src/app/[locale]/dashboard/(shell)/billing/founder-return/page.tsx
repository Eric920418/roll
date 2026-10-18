import FounderReturn from "@/components/dashboard/discovery/FounderReturn";
import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
export default async function FounderReturnPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const { locale } = await params; await requireUserPage(locale); setRequestLocale(locale);
  const { token } = await searchParams;
  return <FounderReturn orderId={token ?? ""} />;
}
