import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";

export type FounderMatch = {
  name: string;
  role: string;
  blurb: string;
  similarity: number; // 0~100，由頁面用作答分數與創辦人三維向量算歐氏距離得出（真實）
  planningDepth: number;
  executionStrength: number;
  visionClarity: number;
  companyHref: string | null;
};

// COMPANY MATCHING：顯示測驗配對到的台灣上市公司創辦人（既有 quiz 結果）。
export default async function FounderMatchCard({
  locale,
  match,
  quizHref,
}: {
  locale: Locale;
  match: FounderMatch | null;
  quizHref: string;
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.match" });

  if (!match) {
    return (
      <div className="nova-dashboard-card flex h-full flex-col rounded-2xl border border-dark/10 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
          {t("eyebrow")}
        </p>
        <p className="mt-3 flex-1 text-sm text-dark/60">{t("empty")}</p>
        <Link
          href={quizHref}
          className="mt-5 inline-block w-fit rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
        >
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  const bars: { label: string; value: number }[] = [
    { label: t("planning"), value: match.planningDepth },
    { label: t("execution"), value: match.executionStrength },
    { label: t("vision"), value: match.visionClarity },
  ];

  return (
    <div className="nova-dashboard-card flex h-full flex-col rounded-2xl border border-dark/10 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
            {t("eyebrow")}
          </p>
          <p className="mt-2 text-lg font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
            {match.name}
          </p>
          <p className="text-xs text-dark/55">{match.role}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-extrabold tracking-[-0.03em] text-primary font-[family-name:var(--font-heading)]">
            {match.similarity}%
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-dark/40">
            {t("similarity")}
          </p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-dark/65">{match.blurb}</p>

      <div className="mt-4 flex flex-col gap-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-center justify-between text-xs text-dark/60">
              <span>{b.label}</span>
              <span className="font-semibold text-dark/80">{b.value}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary/10">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, b.value))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {match.companyHref && (
        <Link
          href={match.companyHref}
          className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary-dark font-[family-name:var(--font-heading)]"
        >
          {t("viewCompany")}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
    </div>
  );
}
