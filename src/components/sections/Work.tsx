import { getLocale } from "next-intl/server";
import { getWorkCases } from "@/lib/cms/content";
import { pick } from "@/lib/cms/i18n";
import type { Locale } from "@/i18n/routing";
import WorkClient, { type WorkCard } from "./WorkClient";

// Server wrapper：抓 DB + 依 locale 解析，再交給 client（motion + 展開）渲染
export default async function Work() {
  const locale = (await getLocale()) as Locale;
  const cases = await getWorkCases();

  const group = cases[0]?.group ?? "Medix LLC";
  const resolved: WorkCard[] = cases.map((c) => ({
    id: c.id,
    image: c.image,
    href: c.href,
    description: pick(c.description, locale),
  }));

  return <WorkClient group={group} cases={resolved} />;
}
