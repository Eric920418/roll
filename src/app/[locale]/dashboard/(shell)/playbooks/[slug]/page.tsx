import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaybook, pickDual } from "@/lib/playbook/content";
import { getCurrentAccount } from "@/lib/auth/account";
import { pathForLocale } from "@/lib/routes";
import PlaybookReader from "@/components/dashboard/PlaybookReader";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; slug: string }> };

export default async function PlaybookDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.playbooks" });

  const pb = getPlaybook(slug);
  if (!pb) notFound();

  const account = await getCurrentAccount();
  const reads: Record<string, boolean> = {};
  if (account) {
    for (const s of pb.segments) {
      if (account.playbookReads[`${slug}:${s.key}`]) reads[s.key] = true;
    }
  }

  const segments = [...pb.segments]
    .sort((a, b) => a.order - b.order)
    .map((s) => ({
      key: s.key,
      heading: pickDual(s.heading, locale),
      body: pickDual(s.body, locale),
    }));

  const catLabel = t.has(`categories.${pb.category}`)
    ? t(`categories.${pb.category}`)
    : pb.category;

  return (
    <div className="font-[family-name:var(--font-body)]">
      <Link
        href={pathForLocale("/dashboard/playbooks", l)}
        className="text-sm font-semibold text-primary transition-colors hover:text-primary/80 font-[family-name:var(--font-heading)]"
      >
        ← {t("back")}
      </Link>

      <span className="mt-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary font-[family-name:var(--font-heading)]">
        {catLabel}
      </span>
      <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {pickDual(pb.title, locale)}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-dark/60">{pickDual(pb.summary, locale)}</p>

      <PlaybookReader slug={slug} segments={segments} initialReads={reads} />
    </div>
  );
}
