import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { SITE_URL, pathForLocale } from "@/lib/routes";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { getAllCompanies } from "@/lib/company/content";
import { CompanyDirectory } from "@/components/company/CompanyDirectory";

type Props = { params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const l = locale as Locale;
  return {
    title: { absolute: "Taiwan Listed Company Intelligence" },
    description:
      "English profiles of Taiwan-listed companies — financial facts from official filings, paired with AI-generated strategic analysis.",
    robots: { index: false, follow: false }, // 預覽階段不索引
    alternates: {
      canonical: `${SITE_URL}${pathForLocale("/company", l)}`,
      languages: { en: `${SITE_URL}/company`, "zh-TW": `${SITE_URL}/zh-tw/company` },
    },
  };
}

export default async function CompanyIndex({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;

  const companies = getAllCompanies().map((c) => ({
    slug: c.slug,
    ticker: c.ticker,
    market: c.market,
    nameEn: c.nameEn,
    sector: c.sector ?? null,
    status: c.status,
    summaryEn: c.summaryEn ?? null,
  }));

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-canvas pt-20">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <header className="max-w-3xl">
            <h1 className="font-[family-name:var(--font-heading)] text-3xl font-bold text-navy md:text-4xl">
              Taiwan Listed Company Intelligence
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-ink/75">
              Automated English profiles of Taiwan-listed companies — financial facts from official
              filings, paired with AI-generated strategic analysis.
            </p>
          </header>

          <div className="mt-10">
            {companies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line bg-paper p-10 text-center text-muted">
                No companies yet. Run the ingest pipeline to generate the first profile.
              </div>
            ) : (
              <CompanyDirectory companies={companies} basePath={pathForLocale("/company", l)} />
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
