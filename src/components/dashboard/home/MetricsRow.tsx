import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

// KEY METRICS：4 格皆綁真實 ROLL ON 資料（企業數 / 影片數 / 清單進度 / 活動數）。
// 刻意不放假的「↑18%」漲跌數（無歷史資料）。
export default async function MetricsRow({
  locale,
  companies,
  videos,
  checklistDone,
  checklistTotal,
  events,
}: {
  locale: Locale;
  companies: number;
  videos: number;
  checklistDone: number;
  checklistTotal: number;
  events: number;
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.metrics" });

  const percent =
    checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  const cards: { label: string; value: string; hint: string }[] = [
    { label: t("companies"), value: String(companies), hint: t("companiesHint") },
    { label: t("videos"), value: String(videos), hint: t("videosHint") },
    {
      label: t("checklist"),
      value: checklistTotal > 0 ? `${percent}%` : "—",
      hint: t("checklistHint", { done: checklistDone, total: checklistTotal }),
    },
    { label: t("events"), value: String(events), hint: t("eventsHint") },
  ];

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
        {t("sectionTitle")}
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-dark/10 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-dark/40 font-[family-name:var(--font-heading)]">
              {c.label}
            </p>
            <p className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-dark font-[family-name:var(--font-heading)]">
              {c.value}
            </p>
            <p className="mt-1 text-xs text-dark/50">{c.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
