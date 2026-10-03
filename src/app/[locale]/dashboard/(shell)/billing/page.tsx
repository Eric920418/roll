import { requireUserPage } from "@/lib/auth/guard";
import { setRequestLocale } from "next-intl/server";
import BillingOverview from "@/components/dashboard/BillingOverview";

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  await requireUserPage((await params).locale);
  const { locale } = await params;
  setRequestLocale(locale);
  return <BillingOverview locale={locale} />;
}
