import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { getPlaybookList, pickDual } from "@/lib/playbook/content";
import { getCurrentAccount } from "@/lib/auth/account";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

// 會員知識手冊列表（登入即可看；proxy 已把關 /dashboard）。內容由 content/playbooks/*.json 生成。
export default async function PlaybooksPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.playbooks" });

  const items = getPlaybookList();
  const account = await getCurrentAccount();
  const reads = account?.playbookReads ?? {};

  return (
    <div className="font-[family-name:var(--font-body)]">
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-dark/60">{t("subtitle")}</p>

      {items.length === 0 ? (
        <div className="mt-7 rounded-2xl border border-dark/10 bg-white p-7 text-sm text-dark/60">
          {t("empty")}
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((p) => {
            const catLabel = t.has(`categories.${p.category}`)
              ? t(`categories.${p.category}`)
              : p.category;
            const done = Object.keys(reads).filter(
              (k) => k.startsWith(`${p.slug}:`) && reads[k],
            ).length;
            return (
              <Link
                key={p.slug}
                href={pathForLocale(`/dashboard/playbooks/${p.slug}`, l)}
                className="group rounded-2xl border border-dark/10 bg-white p-6 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary font-[family-name:var(--font-heading)]">
                    {catLabel}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-dark/50 font-[family-name:var(--font-heading)]">
                    {t("reader.progress", { done, total: p.segmentCount })}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-extrabold tracking-[-0.02em] text-dark transition-colors group-hover:text-primary font-[family-name:var(--font-heading)]">
                  {pickDual(p.title, locale)}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-dark/60">
                  {pickDual(p.summary, locale)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
