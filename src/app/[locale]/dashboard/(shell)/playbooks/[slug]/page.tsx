import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaybook, pickDual } from "@/lib/playbook/content";
import { pathForLocale } from "@/lib/routes";
import PlaybookArticle from "@/components/dashboard/PlaybookArticle";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string; slug: string }> };

export default async function PlaybookDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const l = locale as Locale;
  const t = await getTranslations({ locale, namespace: "Dashboard.playbooks" });

  const pb = getPlaybook(slug);
  if (!pb) notFound();

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

      <PlaybookArticle markdown={pickDual(pb.body, locale)} />
    </div>
  );
}
