import { getLocale } from "next-intl/server";
import { getEvents } from "@/lib/cms/content";
import { pick } from "@/lib/cms/i18n";
import type { Locale } from "@/i18n/routing";
import EventsClient, { type EventCard } from "./EventsClient";

// Server wrapper：抓 DB + 依 locale 解析雙語，再交給 client（motion）渲染
export default async function Events() {
  const locale = (await getLocale()) as Locale;
  const events = await getEvents();

  const resolved: EventCard[] = events.map((e) => ({
    id: e.id,
    date: pick(e.date, locale),
    title: pick(e.title, locale),
    location: pick(e.location, locale),
    description: pick(e.description, locale),
    image: e.image,
  }));

  return <EventsClient events={resolved} />;
}
