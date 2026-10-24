import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { loadContent } from "@/lib/mdx";
import { INSIGHT_SLUGS, SERVICE_SLUGS, absoluteUrl, pathForLocale, buildRoutePath } from "@/lib/routes";
import HomeNavigation from "@/components/home/HomeNavigation";
import RollonFooter from "@/components/home/RollonFooter";
import { inter } from "@/components/home/font";
import base from "@/components/home/home.module.css";
import styles from "./index.module.css";

type IndexKind = "services" | "insights";

export async function indexMetadata(kind: IndexKind, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: `HomeV10.indexes.${kind}` });
  const title = t("title"), description = t("description");
  const path = `/${kind}`;
  const image = `${absoluteUrl("/og", locale)}?title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(description)}`;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: absoluteUrl(path, locale), languages: { en: absoluteUrl(path, "en"), "zh-TW": absoluteUrl(path, "zh-tw") } },
    openGraph: { title, description, url: absoluteUrl(path, locale), type: "website", images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function ContentIndex({ kind, locale }: { kind: IndexKind; locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "HomeV10" });
  const type = kind === "services" ? "service" : "insight";
  const slugs = kind === "services" ? SERVICE_SLUGS : INSIGHT_SLUGS;
  const content = await Promise.all(slugs.map(slug => loadContent(type, slug, locale)));
  return <div className={`${base.home} ${inter.variable}`} data-brand="rollon" lang={locale}>
    <div className={base.heroShell}><HomeNavigation locale={locale} current={kind} /></div>
    <main className={`${base.container} ${styles.index}`}>
      <Link href={pathForLocale("/", locale)}>{t("nav.home")} →</Link>
      <h1>{t(`indexes.${kind}.heading`)}</h1>
      <p className={styles.intro}>{t(`indexes.${kind}.description`)}</p>
      <div className={styles.grid}>
        {content.map(({ frontmatter }) => <Link key={frontmatter.slug} className={styles.card} href={pathForLocale(buildRoutePath(type, frontmatter.slug), locale)}>
          <h2>{frontmatter.title}</h2>
          <p>{frontmatter.description}</p>
          <span>{t("indexes.read")}</span>
        </Link>)}
      </div>
    </main>
    <RollonFooter locale={locale} path={`/${kind}`} />
  </div>;
}
