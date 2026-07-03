import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getCurrentAccount } from "@/lib/auth/account";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export default async function CompanyProfilePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  const tOpt = await getTranslations({ locale, namespace: "Auth.options" });

  const account = await getCurrentAccount();
  if (!account) return null; // layout 已 redirect

  const p = account.profile;
  const na = t("profile.notProvided");
  const opt = (ns: string, v?: string | null) =>
    v ? tOpt(`${ns}.${v}`) : na;

  const hasAny =
    p &&
    Boolean(
      p.companyName ||
        p.industry ||
        p.companySize ||
        p.website ||
        p.country ||
        p.needs.length ||
        p.targetMarkets.length ||
        p.timeline ||
        p.budgetRange ||
        p.notes,
    );

  const editHref = pathForLocale("/dashboard/account", l);

  return (
    <div className="font-[family-name:var(--font-body)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
            {t("profile.title")}
          </h1>
          <p className="mt-2 text-sm text-dark/60">{t("profile.subtitle")}</p>
        </div>
        <Link
          href={editHref}
          className="rounded-xl border border-dark/15 px-5 py-3 text-sm font-semibold text-dark/80 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
        >
          {t("profile.edit")}
        </Link>
      </div>

      {!hasAny ? (
        <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/[0.04] p-7">
          <h2 className="text-xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
            {t("profile.emptyTitle")}
          </h2>
          <p className="mt-2 text-sm text-dark/70">{t("profile.emptyBody")}</p>
          <Link
            href={editHref}
            className="mt-5 inline-block rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
          >
            {t("profile.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-7 grid gap-6 md:grid-cols-2">
          {/* 公司資訊 */}
          <section className="rounded-2xl border border-dark/10 bg-white p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
              {t("account.companySection")}
            </h2>
            <dl className="mt-4 flex flex-col divide-y divide-dark/[0.06]">
              <Row label={t("account.companyName")} value={p?.companyName || na} />
              <Row label={t("account.industry")} value={opt("industry", p?.industry)} />
              <Row
                label={t("account.companySize")}
                value={opt("companySize", p?.companySize)}
              />
              <Row
                label={t("account.website")}
                value={
                  p?.website ? (
                    <a
                      href={p.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {p.website}
                    </a>
                  ) : (
                    na
                  )
                }
              />
              <Row label={t("account.country")} value={p?.country || na} />
            </dl>
          </section>

          {/* 進入需求 */}
          <section className="rounded-2xl border border-dark/10 bg-white p-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
              {t("account.requirementsSection")}
            </h2>
            <dl className="mt-4 flex flex-col divide-y divide-dark/[0.06]">
              {p && p.targetMarkets.length > 0 && (
                <Row
                  label={t("account.targetMarkets")}
                  value={p.targetMarkets.map((m) => tOpt(`markets.${m}`)).join(" · ")}
                />
              )}
              <Row
                label={t("account.needs")}
                value={
                  p && p.needs.length
                    ? p.needs.map((n) => tOpt(`needs.${n}`)).join(" · ")
                    : na
                }
              />
              <Row label={t("account.timeline")} value={opt("timeline", p?.timeline)} />
              <Row
                label={t("account.budgetRange")}
                value={opt("budget", p?.budgetRange)}
              />
              <Row label={t("account.notes")} value={p?.notes || na} />
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-sm text-dark/50">{label}</dt>
      <dd className="text-right text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
        {value}
      </dd>
    </div>
  );
}
