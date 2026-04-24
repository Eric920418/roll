import type { MetadataRoute } from "next";
import { routing, type Locale } from "@/i18n/routing";
import {
  SITE_URL,
  allContentRoutes,
  buildRoutePath,
  pathForLocale,
} from "@/lib/routes";

type Freq = "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";

function urlFor(path: string, locale: Locale): string {
  return `${SITE_URL}${pathForLocale(path, locale)}`;
}

function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const loc of routing.locales) {
    out[loc === "zh-tw" ? "zh-TW" : loc] = urlFor(path, loc);
  }
  return out;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // Home
  entries.push({
    url: SITE_URL,
    lastModified: now,
    changeFrequency: "weekly" as Freq,
    priority: 1,
    alternates: { languages: languageAlternates("/") },
  });

  // ESG (static brand narrative page)
  entries.push({
    url: urlFor("/esg", "en"),
    lastModified: now,
    changeFrequency: "monthly" as Freq,
    priority: 0.8,
    alternates: { languages: languageAlternates("/esg") },
  });

  // Content pages
  const typeMeta: Record<
    "insight" | "case" | "service" | "country",
    { priority: number; changeFrequency: Freq }
  > = {
    insight: { priority: 0.9, changeFrequency: "monthly" },
    case: { priority: 0.8, changeFrequency: "monthly" },
    service: { priority: 0.9, changeFrequency: "monthly" },
    country: { priority: 0.7, changeFrequency: "monthly" },
  };

  for (const r of allContentRoutes()) {
    const path = buildRoutePath(r.type, r.slug);
    entries.push({
      url: urlFor(path, "en"),
      lastModified: now,
      changeFrequency: typeMeta[r.type].changeFrequency,
      priority: typeMeta[r.type].priority,
      alternates: { languages: languageAlternates(path) },
    });
  }

  return entries;
}
