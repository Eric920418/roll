import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { allContentRoutes, absoluteUrl, buildRoutePath } from "@/lib/routes";
import { loadContent } from "@/lib/mdx";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  const staticPaths = ["", "/approach", "/cases", "/taiwan", "/about", "/esg", "/product", "/services", "/insights"];
  for (const locale of routing.locales) {
    for (const path of staticPaths) {
      // shortcut: CMS has no reliable per-page edit date; add lastmod when page-level timestamps exist.
      const updated = ["", "/services", "/insights"].includes(path) ? "2026-10-25" : undefined;
      entries.push({
        url: absoluteUrl(path, locale),
        ...(updated ? { lastModified: updated } : {}),
        alternates: { languages: { en: absoluteUrl(path, "en"), "zh-TW": absoluteUrl(path, "zh-tw") } },
      });
    }
  }
  const content = await Promise.all(routing.locales.flatMap(locale => allContentRoutes().map(async route => {
    const path = buildRoutePath(route.type, route.slug);
    const { frontmatter } = await loadContent(route.type, route.slug, locale);
    return {
      url: absoluteUrl(path, locale),
      lastModified: frontmatter.updatedAt,
      alternates: { languages: { en: absoluteUrl(path, "en"), "zh-TW": absoluteUrl(path, "zh-tw") } },
    };
  })));
  return [...entries, ...content];
}
