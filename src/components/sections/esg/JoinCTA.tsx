"use client";

import { useLocale, useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";

export default function JoinCTA() {
  const t = useTranslations("ESG.cta");
  const locale = useLocale() as Locale;
  const contactHref = `${pathForLocale("/", locale)}#contact`;

  return (
    <section className="bg-white pt-10 md:pt-14 pb-20 md:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col md:flex-row items-start md:items-end justify-between gap-8 md:gap-12"
      >
        <div className="flex flex-col leading-tight">
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-dark tracking-[-0.04em] font-[family-name:var(--font-heading)]">
            {t("line1")}
          </h2>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold text-primary tracking-[-0.04em] font-[family-name:var(--font-heading)]">
            {t("line2")}
          </h2>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
          <a
            href={contactHref}
            className="inline-flex items-center bg-primary text-white px-8 md:px-10 py-3 md:py-3.5 rounded-full text-sm md:text-base font-semibold uppercase tracking-[0.18em] font-[family-name:var(--font-heading)] hover:bg-primary-dark transition-colors duration-300"
            aria-label={t("button")}
          >
            {t("button")}
          </a>
          <a
            href={contactHref}
            className="group inline-flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full border border-primary text-primary hover:bg-primary hover:text-white transition-colors duration-300"
            aria-label={t("button")}
          >
            <span
              aria-hidden="true"
              className="text-base leading-none transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
            >
              ↘
            </span>
          </a>
        </div>
      </motion.div>
    </section>
  );
}
