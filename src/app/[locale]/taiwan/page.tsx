import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import TaiwanV10 from "@/components/home/TaiwanV10";
import { rollonMetadata } from "@/components/home/RollonPage";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  return rollonMetadata("taiwan", locale as Locale);
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <TaiwanV10 locale={locale as Locale} />;
}
