import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import ContentIndex, { indexMetadata } from "@/components/content/ContentIndex";

export const revalidate = 3600;
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  return indexMetadata("insights", locale as Locale);
}

export default async function InsightsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ContentIndex kind="insights" locale={locale as Locale} />;
}
