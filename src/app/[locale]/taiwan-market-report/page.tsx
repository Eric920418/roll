import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/routes";
import HomeNavigation from "@/components/home/HomeNavigation";
import RollonFooter from "@/components/home/RollonFooter";
import ReportSection from "@/components/reports/ReportSection";
import styles from "@/components/home/home.module.css";
import { inter } from "@/components/home/font";
import { REPORT_PAGE } from "@/lib/reports/catalog";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "zh-tw" ? "台灣市場進入報告｜2026 第四季" : "Taiwan Market Entry Report | Q4 2026", description: locale === "zh-tw" ? "免費索取 Roll On 台灣市場進入報告，提供英文及繁體中文版。" : "Get the free Roll On Taiwan Market Entry Report in English or Traditional Chinese.", alternates: { canonical: absoluteUrl(REPORT_PAGE, locale as Locale), languages: { en: absoluteUrl(REPORT_PAGE, "en"), "zh-TW": absoluteUrl(REPORT_PAGE, "zh-tw") } } };
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; setRequestLocale(locale); const l = locale as Locale;
  return <div className={`${styles.home} ${inter.variable}`} data-home-v10 data-brand="rollon" lang={l}><div className={styles.heroShell}><HomeNavigation locale={l} current="report" /></div><main><ReportSection locale={l} standalone /></main><RollonFooter locale={l} path={REPORT_PAGE} /></div>;
}
