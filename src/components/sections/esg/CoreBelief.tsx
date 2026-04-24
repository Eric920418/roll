"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function CoreBelief() {
  const t = useTranslations("ESG.coreBelief");
  const title = t("title");
  const titleBase = title.replace(/\.$/, "");
  const hasTrailingDot = title.endsWith(".");

  return (
    <section className="bg-white pt-20 md:pt-28 pb-10 md:pb-14 relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-4xl mx-auto px-5 md:px-8 flex flex-col items-center text-center gap-8"
      >
        <span
          aria-hidden="true"
          className="absolute -top-6 -left-2 md:-top-10 md:-left-12 text-[8rem] md:text-[14rem] leading-none text-dark/10 select-none font-bold font-[family-name:var(--font-heading)] z-0"
        >
          &ldquo;
        </span>

        <h2 className="relative z-10 text-3xl md:text-5xl lg:text-6xl font-bold text-dark tracking-tight font-[family-name:var(--font-heading)]">
          {titleBase}
          {hasTrailingDot && <span className="text-primary">.</span>}
        </h2>

        <p className="relative z-10 text-base md:text-lg text-dark/75 leading-relaxed max-w-2xl font-[family-name:var(--font-body)]">
          {t("body")}
        </p>

        <span
          aria-hidden="true"
          className="absolute -bottom-20 -right-2 md:-bottom-28 md:-right-12 text-[8rem] md:text-[14rem] leading-none text-dark/10 select-none font-bold font-[family-name:var(--font-heading)] z-0"
        >
          &rdquo;
        </span>
      </motion.div>
    </section>
  );
}
