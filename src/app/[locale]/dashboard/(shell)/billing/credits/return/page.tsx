import { setRequestLocale } from "next-intl/server";
import CreditPurchaseReturn from "@/components/dashboard/CreditPurchaseReturn";
import type { Locale } from "@/i18n/routing";

export default async function CreditPurchaseReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  return (
    <CreditPurchaseReturn
      locale={locale as Locale}
      orderId={query.token ?? null}
    />
  );
}
