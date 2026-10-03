import { setRequestLocale } from "next-intl/server";
import UnsubscribePage from "@/components/dashboard/rewards/UnsubscribePage";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function Page({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string }> }) {
  const { locale } = await params; setRequestLocale(locale);
  const { token } = await searchParams;
  return <UnsubscribePage token={typeof token === "string" ? token : ""} />;
}
