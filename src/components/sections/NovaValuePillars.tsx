import { getLocale, getTranslations } from "next-intl/server";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

const pillars = ["software", "guidance", "execution", "access", "ecosystem"] as const;

export default async function NovaValuePillars() {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations("Product.positioning");
  const home = pathForLocale("/", locale);
  return (
    <section className="bg-white px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">NOVA by ROLL ON.</p>
        <h2 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-[-0.04em] text-dark font-[family-name:var(--font-heading)] md:text-5xl">{t("title")}</h2>
        <p className="mt-5 max-w-3xl text-base leading-7 text-dark/60">{t("intro")}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {pillars.map((pillar) => (
            <article key={pillar} className="rounded-2xl border border-dark/10 bg-cream p-5">
              <h3 className="font-bold text-dark font-[family-name:var(--font-heading)]">{t(`${pillar}.title`)}</h3>
              <p className="mt-2 text-sm leading-6 text-dark/55">{t(`${pillar}.body`)}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 rounded-2xl bg-primary p-6 text-white md:flex md:items-center md:justify-between md:gap-8">
          <div>
            <p className="font-bold font-[family-name:var(--font-heading)]">{t("goalTitle")}</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">{t("goalBody")}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 md:mt-0">
            <a href="https://www.youtube.com/@GOLDENTICKET-rollon" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-primary">{t("podcast")}</a>
            <a href={`${home}#events`} className="inline-flex min-h-11 items-center rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white">{t("events")}</a>
            <a href={`${home}#contact`} className="inline-flex min-h-11 items-center rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white">{t("contact")}</a>
          </div>
        </div>
      </div>
    </section>
  );
}
