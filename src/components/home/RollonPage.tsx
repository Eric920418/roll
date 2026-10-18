import { getRollonAssets } from "@/lib/cms/rollon-content";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { SITE_URL, absoluteUrl } from "@/lib/routes";
import HomeNavigation from "./HomeNavigation";
import RollonFooter from "./RollonFooter";
import { inter } from "./font";
import base from "./home.module.css";
import styles from "./pages.module.css";

export type RollonPageName = "approach" | "cases" | "taiwan" | "about";
export const pageNamespaces = { approach: "ApproachV10", cases: "CasesV10", taiwan: "TaiwanV10", about: "AboutV10" } as const;

export async function rollonMetadata(page: RollonPageName, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: pageNamespaces[page] });
  const title = t("meta.title");
  const description = t("meta.description");
  const url = absoluteUrl(`/${page}`, locale);
  const image = `${absoluteUrl("/og", locale)}?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(description)}`;
  return {
    title, description,
    alternates: { canonical: url, languages: { en: `${SITE_URL}/${page}`, "zh-TW": `${SITE_URL}/zh-tw/${page}` } },
    openGraph: { title, description, url, type: "website", locale: locale === "en" ? "en" : "zh_TW", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function RollonPage({ page, locale, children }: { page: RollonPageName; locale: Locale; children: ReactNode }) {
  const t = await getTranslations({ locale, namespace: pageNamespaces[page] });
  const { error: assetError } = await getRollonAssets(page);
  return (
    <div id="top" className={`${base.home} ${styles.page} ${inter.variable}`} data-brand="rollon" data-rollon-page={page} lang={locale}>
      <div className={base.heroShell}><HomeNavigation locale={locale} current={page} /></div>
      <main id="page-content">
        {assetError && <p role="alert" className={base.formError}>{assetError}</p>}
        <section className={`${styles.intro} ${styles[`${page}Intro`]}`} aria-labelledby="page-title">
          <div className={base.container}>
            <p className={base.eyebrow}>{t("hero.eyebrow")}</p>
            <h1 id="page-title">{t("hero.title")}</h1>
            <p className={styles.introDescription}>{t("hero.description")}</p>
          </div>
        </section>
        {children}
      </main>
      <RollonFooter locale={locale} path={`/${page}`} />
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <><p className={`${base.eyebrow} ${styles.sectionEyebrow}`}>{eyebrow}</p><h2 className={base.sectionTitle}>{title}</h2>{description && <p className={styles.sectionDescription}>{description}</p>}</>;
}
