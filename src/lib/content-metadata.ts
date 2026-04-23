import type { Metadata } from "next";
import type { Frontmatter } from "./mdx";
import type { Locale } from "@/i18n/routing";
import { SITE_URL, absoluteUrl, buildRoutePath, pathForLocale } from "./routes";
import { routing } from "@/i18n/routing";

export function contentMetadata(
  fm: Frontmatter,
  locale: Locale,
): Metadata {
  const path = buildRoutePath(fm.type, fm.slug);
  const url = absoluteUrl(path, locale);
  const ogImage = `${SITE_URL}${pathForLocale(`/og?title=${encodeURIComponent(fm.title)}&subtitle=${encodeURIComponent(fm.description.slice(0, 120))}`, locale)}`;

  const languages: Record<string, string> = {};
  for (const loc of routing.locales) {
    languages[loc === "zh-tw" ? "zh-TW" : loc] = absoluteUrl(path, loc);
  }

  return {
    title: fm.title,
    description: fm.description,
    keywords: [fm.targetQuery, "ROLL ON", "Taiwan", "Asia market entry"],
    alternates: {
      canonical: url,
      languages,
    },
    openGraph: {
      title: fm.title,
      description: fm.description,
      url,
      locale: locale === "zh-tw" ? "zh_TW" : "en",
      type: fm.type === "service" ? "website" : "article",
      images: [{ url: ogImage, width: 1200, height: 630, alt: fm.title }],
      publishedTime: fm.publishedAt,
      modifiedTime: fm.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: fm.title,
      description: fm.description,
      images: [ogImage],
    },
  };
}
