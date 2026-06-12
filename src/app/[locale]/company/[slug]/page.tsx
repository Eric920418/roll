import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { SITE_URL, pathForLocale } from "@/lib/routes";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getAllCompanies, getCompany, type Metric } from "@/lib/company/content";
import { metricLabel } from "@/lib/company/format";
import { ReportMarkdown } from "@/lib/company/markdown";
import { TocSidebar, type TocItem } from "@/components/company/TocSidebar";
import { MetricChart } from "@/components/company/MetricChart";
import { SnapshotCard, FactTable } from "@/components/company/FactTable";

type Props = { params: Promise<{ locale: string; slug: string }> };

export function generateStaticParams() {
  const slugs = getAllCompanies().map((c) => c.slug);
  const out: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    for (const slug of slugs) out.push({ locale, slug });
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const company = getCompany(slug);
  if (!company) return { title: "Company not found" };
  const title = `${company.nameEn} (${company.ticker})`;
  const description =
    company.summaryEn ??
    `Financials, business model, and strategic analysis of ${company.nameEn} (${company.ticker}), a Taiwan-listed company.`;
  return {
    title: { absolute: title },
    description,
    // 預覽階段先不讓搜尋引擎索引（之後正式上線再拿掉）
    robots: { index: false, follow: false },
    alternates: {
      canonical: `${SITE_URL}/company/${slug}`,
      languages: {
        en: `${SITE_URL}/company/${slug}`,
        "zh-TW": `${SITE_URL}/zh-tw/company/${slug}`,
      },
    },
    openGraph: { title, description, type: "profile" },
  };
}

function groupMetrics(metrics: Metric[]) {
  const byKey = new Map<string, { period: string; value: number; unit: string | null }[]>();
  for (const m of metrics) {
    const arr = byKey.get(m.metricKey) ?? [];
    arr.push({ period: m.period, value: m.value, unit: m.unit });
    byKey.set(m.metricKey, arr);
  }
  for (const arr of byKey.values()) {
    arr.sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  }
  return byKey;
}

// 頭條快照（每個取最新值；不存在則略過）
const SNAPSHOT_KEYS = [
  "monthlyRevenue", "revenue", "grossMargin", "opMargin", "netMargin", "eps", "roe", "pe", "dividendYield",
];

// 趨勢圖（有 >1 期才畫）
const CHART_SPECS: { key: string; kind: "bar" | "line"; color?: string }[] = [
  { key: "monthlyRevenue", kind: "bar" },
  { key: "revenue", kind: "bar" },
  { key: "grossMargin", kind: "line", color: "var(--color-gold)" },
  { key: "netMargin", kind: "line", color: "var(--color-positive)" },
  { key: "eps", kind: "bar", color: "var(--color-navy-light)" },
  { key: "operatingCashFlow", kind: "bar", color: "var(--color-navy-light)" },
  { key: "stockPrice", kind: "line" },
];

export default async function CompanyPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const company = getCompany(slug);
  if (!company) notFound();

  const byKey = groupMetrics(company.metrics);
  const hasFinancials = byKey.size > 0;

  const snapshots = SNAPSHOT_KEYS.map((key) => {
    const series = byKey.get(key);
    if (!series || series.length === 0) return null;
    const latest = series[series.length - 1];
    return { key, ...latest };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const revenueSeries = byKey.get("monthlyRevenue") ?? byKey.get("revenue");
  const revenueKey = byKey.has("monthlyRevenue") ? "monthlyRevenue" : "revenue";
  const dividendSeries = byKey.get("cashDividend");

  const toc: TocItem[] = [
    { id: "key-facts", label: "Key Facts" },
    ...(hasFinancials ? [{ id: "financials", label: "Financials" }] : []),
    ...company.sections.map((s) => ({ id: s.slug, label: s.headingEn })),
    ...(company.sources.length ? [{ id: "sources", label: "Sources" }] : []),
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Corporation",
    name: company.nameEn,
    alternateName: company.nameZh ?? undefined,
    tickerSymbol: company.ticker,
    foundingDate: company.foundedYear ? String(company.foundedYear) : undefined,
    url: company.websiteUrl ?? undefined,
    description: company.summaryEn ?? undefined,
    address: company.headquarters
      ? { "@type": "PostalAddress", addressLocality: company.headquarters }
      : undefined,
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-canvas">
        <script
          type="application/ld+json"
          // 轉義 `<` 防止任何欄位含 `</script>` 突破 script 標籤
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />

        {/* Header strip */}
        <section className="border-b border-line bg-paper pt-20">
          <div className="mx-auto max-w-6xl px-5 py-8">
            <Link href={pathForLocale("/company", l)} className="text-sm text-muted hover:text-navy">
              ← All companies
            </Link>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-navy md:text-4xl">
                {company.nameEn}
              </h1>
              <span className="font-[family-name:var(--font-mono)] text-lg text-muted">
                {company.market}:{company.ticker}
              </span>
              <StatusBadge status={company.status} />
            </div>
            {company.summaryEn && (
              <p className="mt-3 max-w-3xl text-lg leading-relaxed text-ink/80">{company.summaryEn}</p>
            )}
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <Fact label="Sector" value={company.sector} />
              <Fact label="Founded" value={company.foundedYear?.toString()} />
              <Fact label="Listed" value={company.listedYear?.toString()} />
              <Fact label="HQ" value={company.headquarters} />
              {company.websiteUrl && (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Website</dt>
                  <dd>
                    <a
                      href={company.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-navy-light underline underline-offset-2 hover:text-navy"
                    >
                      {company.websiteUrl.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        {/* Two-column body */}
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[200px_1fr]">
            <aside>
              <TocSidebar items={toc} />
            </aside>

            <article className="min-w-0">
              <section id="key-facts" className="scroll-mt-24">
                <h2 className="mb-4 font-[family-name:var(--font-heading)] text-2xl font-bold text-navy">
                  Key Facts
                </h2>
                {snapshots.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {snapshots.map((s) => (
                      <SnapshotCard key={s.key} label={metricLabel(s.key)} value={s.value} unit={s.unit} period={s.period} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No financial data ingested yet.</p>
                )}
              </section>

              {hasFinancials && (
                <section id="financials" className="mt-12 scroll-mt-24">
                  <h2 className="mb-4 font-[family-name:var(--font-heading)] text-2xl font-bold text-navy">
                    Financials
                  </h2>
                  <div className="space-y-8">
                    <div className="grid gap-5 sm:grid-cols-2">
                      {CHART_SPECS.map((c) => {
                        const s = byKey.get(c.key);
                        if (!s || s.length < 2) return null;
                        return (
                          <ChartBlock key={c.key} title={metricLabel(c.key)}>
                            <MetricChart points={s} kind={c.kind} unit={s[0].unit} color={c.color} />
                          </ChartBlock>
                        );
                      })}
                    </div>

                    <FinCards title="Valuation" byKey={byKey} keys={["pe", "pb", "dividendYield"]} />
                    <FinCards
                      title="Balance Sheet & Cash Flow"
                      byKey={byKey}
                      keys={["totalAssets", "totalEquity", "debtRatio", "cash", "operatingCashFlow"]}
                    />

                    {dividendSeries && dividendSeries.length > 0 && (
                      <div>
                        <h3 className="mb-1 font-[family-name:var(--font-heading)] text-lg font-semibold text-navy">
                          Dividend History
                        </h3>
                        <p className="mb-3 text-sm text-muted">Cash dividend per share, by fiscal year.</p>
                        <FactTable metricKey="cashDividend" rows={[...dividendSeries].reverse()} />
                      </div>
                    )}

                    {revenueSeries && revenueSeries.length > 0 && (
                      <details className="rounded-lg border border-line bg-paper p-4">
                        <summary className="cursor-pointer text-sm font-medium text-navy">Show full monthly revenue table</summary>
                        <div className="mt-4">
                          <FactTable metricKey={revenueKey} rows={[...revenueSeries].reverse()} />
                        </div>
                      </details>
                    )}
                  </div>
                </section>
              )}

              {company.sections.map((s) => (
                <section key={s.slug} id={s.slug} className="report-body mt-12 scroll-mt-24">
                  <h2 className="mb-4 font-[family-name:var(--font-heading)] text-2xl font-bold text-navy">
                    {s.headingEn}
                  </h2>
                  <ReportMarkdown source={s.bodyMarkdown} />
                </section>
              ))}

              {company.sections.length === 0 && (
                <section className="mt-12 rounded-lg border border-dashed border-line bg-paper p-6 text-sm text-muted">
                  Narrative analysis not generated yet. Add{" "}
                  <code className="font-[family-name:var(--font-mono)]">ANTHROPIC_API_KEY</code> and rerun the pipeline
                  to fill in the report sections.
                </section>
              )}

              {company.sources.length > 0 && (
                <section id="sources" className="mt-12 scroll-mt-24">
                  <h2 className="mb-4 font-[family-name:var(--font-heading)] text-2xl font-bold text-navy">Sources</h2>
                  <ol className="space-y-2 text-sm">
                    {company.sources.map((src) => (
                      <li key={src.url} className="flex flex-wrap items-baseline gap-2">
                        <a
                          href={src.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-navy-light underline underline-offset-2 hover:text-navy"
                        >
                          {src.label}
                        </a>
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-xs uppercase text-muted">{src.kind}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-xs text-muted">
                    Last updated {company.updatedAt}. Financial figures sourced from official/open data; narrative
                    analysis is AI-generated and not investment advice.
                  </p>
                </section>
              )}
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-5">
      <p className="mb-3 text-sm font-semibold text-navy">{title}</p>
      {children}
    </div>
  );
}

// 一組指標的最新值卡片（不存在的 key 自動略過）
function FinCards({
  title,
  byKey,
  keys,
}: {
  title: string;
  byKey: Map<string, { period: string; value: number; unit: string | null }[]>;
  keys: string[];
}) {
  const cards = keys
    .map((k) => {
      const s = byKey.get(k);
      if (!s || s.length === 0) return null;
      const latest = s[s.length - 1];
      return { key: k, ...latest };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (cards.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 font-[family-name:var(--font-heading)] text-lg font-semibold text-navy">{title}</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {cards.map((c) => (
          <SnapshotCard key={c.key} label={metricLabel(c.key)} value={c.value} unit={c.unit} period={c.period} />
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-positive/10 text-positive",
    acquired: "bg-gold/15 text-navy",
    delisted: "bg-negative/10 text-negative",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-canvas text-muted"}`}>
      {status}
    </span>
  );
}
