"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function CoreBelief() {
  const t = useTranslations("ESG.coreBelief");

  return (
    <section className="bg-primary py-20 md:py-28 relative overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-4xl mx-auto px-5 md:px-8 flex flex-col items-center text-center gap-10 md:gap-14"
      >
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight font-[family-name:var(--font-heading)]">
          {t("title")}
        </h2>

        <div className="relative">
          <span
            aria-hidden="true"
            className="absolute -top-6 -left-4 md:-top-10 md:-left-10 text-7xl md:text-9xl leading-none text-white/20 select-none font-[family-name:var(--font-heading)]"
          >
            &ldquo;
          </span>
          <p className="text-base md:text-xl text-white/85 leading-relaxed px-8 md:px-16 font-[family-name:var(--font-body)]">
            {t("body")}
          </p>
          <span
            aria-hidden="true"
            className="absolute -bottom-14 -right-4 md:-bottom-20 md:-right-10 text-7xl md:text-9xl leading-none text-white/20 select-none font-[family-name:var(--font-heading)]"
          >
            &rdquo;
          </span>
        </div>
      </motion.div>
    </section>
  );
}
