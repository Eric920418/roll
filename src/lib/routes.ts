import type { Locale } from "@/i18n/routing";

export type ContentType = "insight" | "case" | "service" | "country";

export type ContentRoute = {
  type: ContentType;
  slug: string;
  targetQuery: string;
};

export const INSIGHT_SLUGS = [
  "taiwan-market-entry-guide",
  "foreign-company-setup-taiwan",
  "asia-expansion-from-taiwan",
] as const;

export const CASE_SLUGS = ["medix"] as const;

export const SERVICE_SLUGS = [
  "fundraising",
  "market-entry",
  "marketing",
  "legal",
  "sales-channel",
  "investor-access",
] as const;

export const COUNTRY_SLUGS = [
  "japan",
  "korea",
  "china",
  "singapore",
  "vietnam",
  "thailand",
] as const;

export type InsightSlug = (typeof INSIGHT_SLUGS)[number];
export type CaseSlug = (typeof CASE_SLUGS)[number];
export type ServiceSlug = (typeof SERVICE_SLUGS)[number];
export type CountrySlug = (typeof COUNTRY_SLUGS)[number];

export const SITE_URL = "https://rollgrp.com";
export const DEFAULT_LOCALE: Locale = "en";

export function pathForLocale(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return `/${locale}${path}`;
}

export function absoluteUrl(path: string, locale: Locale): string {
  return `${SITE_URL}${pathForLocale(path, locale)}`;
}

export function buildRoutePath(type: ContentType, slug: string): string {
  switch (type) {
    case "insight":
      return `/insights/${slug}`;
    case "case":
      return `/cases/${slug}`;
    case "service":
      return `/services/${slug}`;
    case "country":
      return `/from/${slug}`;
  }
}

export function allContentRoutes(): ContentRoute[] {
  return [
    ...INSIGHT_SLUGS.map<ContentRoute>((slug) => ({
      type: "insight",
      slug,
      targetQuery: insightTargetQuery(slug),
    })),
    ...CASE_SLUGS.map<ContentRoute>((slug) => ({
      type: "case",
      slug,
      targetQuery: `${slug} Taiwan case study`,
    })),
    ...SERVICE_SLUGS.map<ContentRoute>((slug) => ({
      type: "service",
      slug,
      targetQuery: serviceTargetQuery(slug),
    })),
    ...COUNTRY_SLUGS.map<ContentRoute>((slug) => ({
      type: "country",
      slug,
      targetQuery: `${slug} company enter Taiwan market`,
    })),
  ];
}

function insightTargetQuery(slug: InsightSlug): string {
  switch (slug) {
    case "taiwan-market-entry-guide":
      return "Taiwan market entry consultant";
    case "foreign-company-setup-taiwan":
      return "how to set up a company in Taiwan foreign";
    case "asia-expansion-from-taiwan":
      return "Asia expansion from Taiwan bridge";
  }
}

function serviceTargetQuery(slug: ServiceSlug): string {
  switch (slug) {
    case "fundraising":
      return "fundraising Taiwan startup consultant";
    case "market-entry":
      return "market entry strategy Taiwan";
    case "marketing":
      return "marketing consultant Taiwan foreign brand";
    case "legal":
      return "company setup Taiwan legal compliance";
    case "sales-channel":
      return "distribution channel Taiwan foreign brand";
    case "investor-access":
      return "investor access Taiwan";
  }
}
