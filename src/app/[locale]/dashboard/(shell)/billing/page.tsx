import { setRequestLocale } from "next-intl/server";
import BillingOverview from "@/components/dashboard/BillingOverview";

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BillingOverview locale={locale} />;
}
