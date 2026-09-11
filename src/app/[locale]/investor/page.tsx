import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUserSession } from "@/lib/auth/guard";
import { listInvestorMemberships } from "@/lib/investor/portal";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default async function InvestorIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const session = await getUserSession();
  if (!session) redirect(`${pathForLocale("/login", l)}?next=${encodeURIComponent(pathForLocale("/investor", l))}`);
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  const memberships = await listInvestorMemberships(session.uid);
  return (
    <main className="min-h-screen bg-cream px-5 py-14 font-[family-name:var(--font-body)]">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-extrabold tracking-[-0.04em] text-dark font-[family-name:var(--font-heading)]">{t("portfolioTitle")}</h1>
        <p className="mt-2 text-sm text-dark/60">{t("portfolioBody")}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {memberships.map((item) => <Link key={item.portalId} href={pathForLocale(`/investor/${item.portalId}`, l)} className="min-h-32 rounded-2xl border border-dark/10 bg-white p-6 transition hover:border-primary/40"><h2 className="text-xl font-bold text-dark">{item.companyName}</h2><p className="mt-4 text-sm font-bold text-primary">{t("openPortal")} →</p></Link>)}
          {!memberships.length && <p className="rounded-2xl border border-dashed border-dark/15 bg-white/60 p-6 text-sm text-dark/60">{t("empty")}</p>}
        </div>
      </div>
    </main>
  );
}
