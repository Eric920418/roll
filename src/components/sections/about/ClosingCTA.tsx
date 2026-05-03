"use client";

import { useLocale, useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";

export default function AboutClosingCTA() {
  const t = useTranslations("AboutPage.closing");
  const locale = useLocale() as Locale;
  const contactHref = `${pathForLocale("/", locale)}#contact`;

  // 把標題尾端的「.」獨立出來上 brand red — ROLL ON. 的 dot 是品牌記號
  const rawTitle = t("title");
  const titleHead = rawTitle.endsWith(".") ? rawTitle.slice(0, -1) : rawTitle;
  const titleHasDot = rawTitle.endsWith(".");

  return (
    <section className="bg-cream text-dark py-24 md:py-32 px-5 md:px-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="max-w-6xl mx-auto flex flex-col gap-10 md:gap-14"
      >
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-extrabold tracking-[-0.04em] leading-[1.1] font-[family-name:var(--font-heading)]">
          {titleHead}
          {titleHasDot && <span className="text-primary">.</span>}
        </h2>

        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <p className="text-base md:text-lg text-dark/75 max-w-xl leading-relaxed font-[family-name:var(--font-body)]">
            {t("body")}
          </p>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href={contactHref}
              className="inline-flex items-center bg-primary text-white px-8 md:px-10 py-3 md:py-3.5 rounded-full text-sm md:text-base font-semibold uppercase tracking-[0.18em] font-[family-name:var(--font-heading)] hover:bg-primary-dark transition-colors duration-300"
              aria-label={t("cta")}
            >
              {t("cta")}
            </a>
            <a
              href={contactHref}
              className="group inline-flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-full border border-primary text-primary hover:bg-primary hover:text-white transition-colors duration-300"
              aria-label={t("cta")}
            >
              <span
                aria-hidden="true"
                className="text-base leading-none transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
              >
                ↘
              </span>
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
