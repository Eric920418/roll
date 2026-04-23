import Link from "next/link";
import type { Frontmatter } from "@/lib/mdx";
import type { Locale } from "@/i18n/routing";
import {
  breadcrumbSchema,
  faqSchema,
  type BreadcrumbItem,
} from "@/lib/schema";
import { MdxBody } from "@/lib/render-mdx";
import FaqList from "./FaqList";
import JsonLd from "./JsonLd";
import { pathForLocale } from "@/lib/routes";

const CTA_COPY: Record<Locale, { label: string; href: string }> = {
  en: { label: "Talk to ROLL ON. →", href: "mailto:Vivian.lee@roll-grp.com" },
  "zh-tw": {
    label: "和 ROLL ON. 聊聊 →",
    href: "mailto:Vivian.lee@roll-grp.com",
  },
};

const BACK_HOME: Record<Locale, string> = {
  en: "← Back to home",
  "zh-tw": "← 回首頁",
};

export default function ContentPage({
  frontmatter,
  body,
  locale,
  breadcrumbs,
  extraSchemas,
}: {
  frontmatter: Frontmatter;
  body: string;
  locale: Locale;
  breadcrumbs: BreadcrumbItem[];
  extraSchemas?: object[];
}) {
  const schemas: object[] = [
    breadcrumbSchema(breadcrumbs, locale),
    ...(extraSchemas ?? []),
  ];
  if (frontmatter.faqs?.length) {
    schemas.push(faqSchema(frontmatter.faqs));
  }

  return (
    <main className="min-h-screen bg-white">
      {schemas.map((s, i) => (
        <JsonLd key={i} data={s} />
      ))}

      <div className="max-w-3xl mx-auto px-5 md:px-8 py-20 md:py-28">
        <nav
          aria-label="Breadcrumb"
          className="text-sm text-dark/60 mb-8 flex items-center flex-wrap gap-2"
        >
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-dark/30">/</span>}
              {i < breadcrumbs.length - 1 ? (
                <Link
                  href={pathForLocale(b.path, locale)}
                  className="hover:text-primary transition-colors"
                >
                  {b.name}
                </Link>
              ) : (
                <span className="text-dark/40">{b.name}</span>
              )}
            </span>
          ))}
        </nav>

        <article>
          <header className="mb-10">
            <p className="text-xs tracking-[0.22em] uppercase text-primary mb-4 font-[family-name:var(--font-heading)]">
              {typeLabel(frontmatter.type, locale)}
            </p>
            <h1 className="text-3xl md:text-5xl font-bold text-dark leading-tight font-[family-name:var(--font-heading)]">
              {frontmatter.title}
            </h1>
            <p className="mt-5 text-lg text-dark/70 leading-relaxed font-[family-name:var(--font-chinese)]">
              {frontmatter.description}
            </p>
            <p className="mt-6 text-xs text-dark/50">
              {frontmatter.author} ·{" "}
              <time dateTime={frontmatter.updatedAt}>
                {frontmatter.updatedAt}
              </time>
            </p>
          </header>

          <div>
            <MdxBody source={body} />
          </div>

          {frontmatter.faqs && (
            <FaqList faqs={frontmatter.faqs} locale={locale} />
          )}
        </article>

        <section className="mt-16 border-t border-dark/10 pt-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <a
            href={CTA_COPY[locale].href}
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded font-semibold hover:bg-primary-dark transition-colors"
          >
            {CTA_COPY[locale].label}
          </a>
          <Link
            href={pathForLocale("/", locale)}
            className="text-sm text-dark/60 hover:text-primary transition-colors"
          >
            {BACK_HOME[locale]}
          </Link>
        </section>
      </div>
    </main>
  );
}

function typeLabel(type: Frontmatter["type"], locale: Locale): string {
  const labels: Record<Locale, Record<Frontmatter["type"], string>> = {
    en: {
      insight: "Insight",
      case: "Case Study",
      service: "Service",
      country: "Country Guide",
    },
    "zh-tw": {
      insight: "深度指南",
      case: "成功案例",
      service: "服務項目",
      country: "國別指南",
    },
  };
  return labels[locale][type];
}
