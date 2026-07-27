import { setRequestLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { getCurrentAccount } from "@/lib/auth/account";
import { pickDual } from "@/lib/playbook/content";
import {
  fortnightIndex,
  selectForPeriod,
  scoreAttempt,
  daysUntilNext,
  type AttemptAnswer,
} from "@/lib/playbook/quiz";
import PlaybookQuizClient from "@/components/dashboard/PlaybookQuizClient";

type Props = { params: Promise<{ locale: string }> };

// 「本期問答」：以會員註冊日為錨即時算第幾個雙週（不排程、不寄信）。全部段落題庫循環出題。
export default async function PlaybookQuizPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Dashboard.playbooks.quiz" });

  const account = await getCurrentAccount();
  if (!account) return null; // proxy 已把關

  const user = await prisma.user.findUnique({
    where: { id: account.id },
    select: { createdAt: true },
  });
  const anchor = user?.createdAt ?? new Date();
  const now = new Date();
  const periodIndex = fortnightIndex(anchor, now);
  const selected = selectForPeriod(periodIndex);
  const daysLeft = daysUntilNext(anchor, periodIndex, now);

  const Header = (
    <>
      <h1 className="text-3xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-dark/60">{t("subtitle")}</p>
    </>
  );

  if (selected.length === 0) {
    return (
      <div className="font-[family-name:var(--font-body)]">
        {Header}
        <div className="mt-7 rounded-2xl border border-dark/10 bg-white p-7 text-sm text-dark/60">
          {t("empty")}
        </div>
      </div>
    );
  }

  const existing = await prisma.playbookQuizAttempt.findUnique({
    where: { userId_periodIndex: { userId: account.id, periodIndex } },
  });

  if (existing) {
    const stored = (existing.answers as AttemptAnswer[] | null) ?? [];
    const scored = scoreAttempt(selected, stored);
    return (
      <div className="font-[family-name:var(--font-body)]">
        {Header}
        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/[0.03] p-6">
          <p className="text-lg font-extrabold text-dark font-[family-name:var(--font-heading)]">
            {t("score", { score: existing.score, total: existing.total })}
          </p>
          <p className="mt-1 text-sm text-dark/60">{t("done", { days: daysLeft })}</p>
        </div>
        <div className="mt-5 flex flex-col gap-4">
          {selected.map((q, qi) => {
            const r = scored.results.find((x) => x.questionId === q.id);
            return (
              <div key={q.id} className="rounded-2xl border border-dark/10 bg-white p-6">
                <p className="text-sm font-semibold text-dark">
                  {qi + 1}. {pickDual(q.question, locale)}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {q.options.map((opt, oi) => {
                    let cls = "border-dark/10 text-dark/50";
                    if (oi === q.answerIndex) cls = "border-green-500 bg-green-50 text-dark";
                    else if (r && oi === r.chosen) cls = "border-red-400 bg-red-50 text-dark";
                    return (
                      <div key={oi} className={`rounded-xl border px-4 py-2.5 text-sm ${cls}`}>
                        {pickDual(opt, locale)}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-dark/60">
                  <span
                    className={
                      r?.correct ? "font-bold text-green-600" : "font-bold text-red-500"
                    }
                  >
                    {r?.correct ? `✓ ${t("correct")}` : `✗ ${t("wrong")}`}
                  </span>{" "}
                  — {pickDual(q.explanation, locale)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const view = selected.map((q) => ({
    id: q.id,
    question: pickDual(q.question, locale),
    options: q.options.map((o) => pickDual(o, locale)),
  }));

  return (
    <div className="font-[family-name:var(--font-body)]">
      {Header}
      <p className="mt-2 text-sm text-dark/50">{t("countHint", { count: selected.length })}</p>
      <PlaybookQuizClient questions={view} />
    </div>
  );
}
