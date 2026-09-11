import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getUserSession } from "@/lib/auth/guard";
import { pathForLocale } from "@/lib/routes";
import AcceptInvestorInvitation from "@/components/investor/AcceptInvestorInvitation";
import type { Locale } from "@/i18n/routing";

export default async function InvestorInvitePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  const session = await getUserSession();
  const returnPath = pathForLocale(`/investor/invite/${token}`, l);
  return (
    <main className="min-h-screen bg-cream px-5 py-16 font-[family-name:var(--font-body)]">
      <div className="mx-auto max-w-xl rounded-3xl border border-dark/10 bg-white p-7 shadow-sm md:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">NOVA</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("inviteTitle")}</h1>
        <p className="mt-3 text-sm leading-6 text-dark/60">{t("inviteBody")}</p>
        <div className="mt-7">
          {session ? (
            <AcceptInvestorInvitation token={token} locale={l} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link href={`${pathForLocale("/login", l)}?next=${encodeURIComponent(returnPath)}`} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white">{t("login")}</Link>
              <Link href={`${pathForLocale("/signup", l)}?next=${encodeURIComponent(returnPath)}`} className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 px-6 py-3 text-sm font-bold text-dark">{t("signup")}</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
