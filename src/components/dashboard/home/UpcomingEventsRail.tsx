import Image from "next/image";
import Link from "next/link";
import { pick } from "@/lib/quiz/locale";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export type EventView = { id: string; date: unknown; title: unknown; location: unknown; description: unknown; image: string | null };

export default function UpcomingEventsRail({ locale, events, error }: { locale: Locale; events: EventView[]; error?: string | null }) {
  const zh = locale === "zh-tw";
  return <section className="min-w-0 space-y-4" aria-labelledby="dashboard-events-title">
    <div className="flex items-center justify-between gap-3"><h2 id="dashboard-events-title" className="text-lg font-semibold">{zh ? "近期活動" : "Recent events"}</h2><Link href={`${pathForLocale("/product", locale)}#community`} className="inline-flex min-h-11 items-center text-sm font-semibold underline">{zh ? "查看全部" : "View all"}</Link></div>
    {error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-800"><p className="whitespace-pre-wrap break-words">{error}</p><a href={pathForLocale("/dashboard", locale)} className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{zh ? "重新載入" : "Reload"}</a></div> : events.length ? <ul className="grid min-w-0 gap-4 sm:grid-cols-3">{events.map(event => <li key={event.id} className="min-w-0 overflow-hidden rounded-2xl border border-dark/10 bg-white">
      {event.image && <div className="relative aspect-[4/3]"><Image src={event.image} alt={pick(event.title, locale)} fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" unoptimized /></div>}
      <div className="space-y-3 p-5"><p className="text-xs text-dark/60">{[pick(event.date, locale), pick(event.location, locale)].filter(Boolean).join(" · ")}</p><h3 className="break-words text-base font-semibold">{pick(event.title, locale)}</h3>{pick(event.description, locale) && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-dark/65">{pick(event.description, locale)}</p>}</div>
    </li>)}</ul> : <p className="rounded-2xl border border-dark/10 bg-white p-5 text-sm text-dark/60">{zh ? "目前沒有已公布的活動。" : "No published events yet."}</p>}
  </section>;
}
