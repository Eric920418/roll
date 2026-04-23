import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import ContentPage from "@/components/content/ContentPage";
import { serviceSchema } from "@/lib/schema";
import { contentMetadata } from "@/lib/content-metadata";
import { ContentNotFoundError, loadContent } from "@/lib/mdx";
import { SERVICE_SLUGS, buildRoutePath } from "@/lib/routes";
import { routing, type Locale } from "@/i18n/routing";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  const out: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    for (const slug of SERVICE_SLUGS) {
      out.push({ locale, slug });
    }
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const { frontmatter } = await loadContent(
      "service",
      slug,
      locale as Locale,
    );
    return contentMetadata(frontmatter, locale as Locale);
  } catch (e) {
    if (e instanceof ContentNotFoundError) return {};
    throw e;
  }
}

const CRUMB_LABEL: Record<Locale, { home: string; services: string }> = {
  en: { home: "Home", services: "Services" },
  "zh-tw": { home: "首頁", services: "服務項目" },
};

const SERVICE_TYPE_MAP: Record<string, string> = {
  fundraising: "Fundraising Advisory",
  "market-entry": "Market Entry Consulting",
  marketing: "Marketing Strategy",
  legal: "Legal & Compliance Support",
  "sales-channel": "Sales Channel Development",
  "investor-access": "Investor Access Network",
};

export default async function ServicePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const l = locale as Locale;
  let content;
  try {
    content = await loadContent("service", slug, l);
  } catch (e) {
    if (e instanceof ContentNotFoundError) notFound();
    throw e;
  }

  const path = buildRoutePath("service", slug);
  const labels = CRUMB_LABEL[l];

  return (
    <ContentPage
      frontmatter={content.frontmatter}
      body={content.body}
      locale={l}
      breadcrumbs={[
        { name: labels.home, path: "/" },
        { name: labels.services, path: "/services" },
        { name: content.frontmatter.title, path },
      ]}
      extraSchemas={[
        serviceSchema({
          name: content.frontmatter.title,
          description: content.frontmatter.description,
          path,
          locale: l,
          serviceType: SERVICE_TYPE_MAP[slug] ?? "Business Consulting",
        }),
      ]}
    />
  );
}
