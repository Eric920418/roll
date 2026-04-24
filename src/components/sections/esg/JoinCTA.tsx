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
    <section className="bg-primary pb-20 md:pb-28">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-8 md:gap-12"
      >
        <div className="flex flex-col">
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight font-[family-name:var(--font-heading)]">
            {t("line1")}
          </h2>
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white/60 leading-tight tracking-tight font-[family-name:var(--font-heading)]">
            {t("line2")}
          </h2>
        </div>

        <a
          href={contactHref}
          className="group inline-flex items-center gap-3 self-start md:self-auto shrink-0 bg-white text-primary px-8 md:px-10 py-3.5 md:py-4 rounded-full text-sm md:text-base font-semibold uppercase tracking-widest font-[family-name:var(--font-heading)] hover:bg-[var(--color-accent,#D4A574)] hover:text-white transition-colors duration-300"
          aria-label={t("button")}
        >
          {t("button")}
          <span
            aria-hidden="true"
            className="transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </a>
      </motion.div>
    </section>
  );
}
