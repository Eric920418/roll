import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import ContentPage from "@/components/content/ContentPage";
import { articleSchema } from "@/lib/schema";
import { contentMetadata } from "@/lib/content-metadata";
import { ContentNotFoundError, loadContent } from "@/lib/mdx";
import { INSIGHT_SLUGS, buildRoutePath } from "@/lib/routes";
import { routing, type Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  const out: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    for (const slug of INSIGHT_SLUGS) {
      out.push({ locale, slug });
    }
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const { frontmatter } = await loadContent("insight", slug, locale as Locale);
    return contentMetadata(frontmatter, locale as Locale);
  } catch (e) {
    if (e instanceof ContentNotFoundError) return {};
    throw e;
  }
}

const CRUMB_LABEL: Record<Locale, { home: string; insights: string }> = {
  en: { home: "Home", insights: "Insights" },
  "zh-tw": { home: "首頁", insights: "深度指南" },
};

export default async function InsightPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const l = locale as Locale;
  let content;
  try {
    content = await loadContent("insight", slug, l);
  } catch (e) {
    if (e instanceof ContentNotFoundError) notFound();
    throw e;
  }

  const path = buildRoutePath("insight", slug);
  const labels = CRUMB_LABEL[l];

  return (
    <ContentPage
      frontmatter={content.frontmatter}
      body={content.body}
      locale={l}
      breadcrumbs={[
        { name: labels.home, path: "/" },
        { name: labels.insights, path: "/insights" },
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
