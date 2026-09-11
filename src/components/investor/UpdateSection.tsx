import { getTranslations } from "next-intl/server";
import { Section } from "./Section";
import type { Locale } from "@/i18n/routing";

type Update = { id: string; title: string; body: string; publishedAt: Date };

export default async function UpdateSection({
  locale,
  updates,
}: {
  locale: Locale;
  updates: Update[];
}) {
  const t = await getTranslations({ locale, namespace: "InvestorView" });
  const fmt = new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US");
  return (
    <Section title={t("updates")}>
      <div className="space-y-4">
        {updates.map((item) => (
          <article key={item.id}>
            <p className="text-xs text-dark/40">{fmt.format(item.publishedAt)}</p>
            <h3 className="mt-1 font-bold text-dark">{item.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-dark/60">{item.body}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}
