import { setRequestLocale } from "next-intl/server";
import BillingReturn from "@/components/dashboard/BillingReturn";
import type { Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ subscription_id?: string }>;
};

export default async function BillingReturnPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const subscriptionId =
    typeof sp.subscription_id === "string" ? sp.subscription_id : null;

  return (
    <BillingReturn locale={locale as Locale} subscriptionId={subscriptionId} />
  );
}
