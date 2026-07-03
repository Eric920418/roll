import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { pick } from "@/lib/quiz/locale";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export type EventView = {
  id: string;
  date: unknown; // Prisma Json 雙語顯示字串
  title: unknown;
  location: unknown;
};

// UPCOMING EVENTS：取自 Event model（首頁活動）。
export default async function UpcomingEventsRail({
  locale,
  events,
}: {
  locale: Locale;
  events: EventView[];
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.events" });

  return (
    <div className="rounded-2xl border border-dark/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </p>
        <Link
          href={`${pathForLocale("/", locale)}#events`}
          className="text-xs font-semibold text-primary hover:text-primary-dark font-[family-name:var(--font-heading)]"
        >
          {t("viewAll")}
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-dark/55">{t("empty")}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
                  {pick(e.title, locale)}
                </p>
                <p className="truncate text-xs text-dark/50">
                  {pick(e.date, locale)}
                  {pick(e.location, locale) ? ` · ${pick(e.location, locale)}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
