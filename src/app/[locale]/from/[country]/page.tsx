import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import ContentPage from "@/components/content/ContentPage";
import { articleSchema } from "@/lib/schema";
import { contentMetadata } from "@/lib/content-metadata";
import { ContentNotFoundError, loadContent } from "@/lib/mdx";
import { COUNTRY_SLUGS, buildRoutePath } from "@/lib/routes";
import { routing, type Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; country: string }>;
};

export function generateStaticParams() {
  const out: { locale: string; country: string }[] = [];
  for (const locale of routing.locales) {
    for (const slug of COUNTRY_SLUGS) {
      out.push({ locale, country: slug });
    }
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, country } = await params;
  try {
    const { frontmatter } = await loadContent(
      "country",
      country,
      locale as Locale,
    );
    return contentMetadata(frontmatter, locale as Locale);
  } catch (e) {
    if (e instanceof ContentNotFoundError) return {};
    throw e;
  }
}

const CRUMB_LABEL: Record<Locale, { home: string; from: string }> = {
  en: { home: "Home", from: "By Origin Country" },
  "zh-tw": { home: "首頁", from: "各國進台灣指南" },
};

export default async function CountryPage({ params }: Props) {
  const { locale, country } = await params;
  setRequestLocale(locale);

  const l = locale as Locale;
  let content;
  try {
    content = await loadContent("country", country, l);
  } catch (e) {
    if (e instanceof ContentNotFoundError) notFound();
    throw e;
  }

  const path = buildRoutePath("country", country);
  const labels = CRUMB_LABEL[l];

  return (
    <ContentPage
      frontmatter={content.frontmatter}
      body={content.body}
      locale={l}
      breadcrumbs={[
        { name: labels.home, path: "/" },
        { name: labels.from, path: "/from" },
        { name: content.frontmatter.title, path },
      ]}
      extraSchemas={[
        articleSchema({
          title: content.frontmatter.title,
          description: content.frontmatter.description,
          path,
          locale: l,
          publishedAt: content.frontmatter.publishedAt,
          updatedAt: content.frontmatter.updatedAt,
          author: content.frontmatter.author,
          keywords: [content.frontmatter.targetQuery],
        }),
      ]}
    />
  );
}
