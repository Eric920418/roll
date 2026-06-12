"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function ProductCTA() {
  const t = useTranslations("Product.cta");

  return (
    <section className="relative bg-primary py-20 md:py-28 px-5 md:px-8 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -left-[3%] -bottom-[40%] text-[20rem] md:text-[34rem] font-black text-white/[0.06] leading-none font-[family-name:var(--font-heading)] pointer-events-none select-none"
      >
        .
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-5xl mx-auto flex flex-col items-start gap-6 md:gap-8"
      >
        <h2 className="text-5xl md:text-7xl lg:text-8xl font-extrabold text-white leading-[0.95] tracking-[-0.04em] font-[family-name:var(--font-heading)]">
          {t("brand")}
        </h2>

        <div className="flex flex-col gap-1.5">
          <p className="text-xl md:text-2xl font-bold text-white tracking-[-0.02em] font-[family-name:var(--font-heading)]">
            {t("line1")}
          </p>
          <p className="text-base md:text-lg text-white/70 font-[family-name:var(--font-body)]">
            {t("line2")}
          </p>
        </div>

        <a
          href="#contact"
          className="group mt-2 inline-flex items-center gap-2 rounded-full bg-white text-primary px-9 md:px-10 py-3.5 md:py-4 text-sm md:text-base font-semibold font-[family-name:var(--font-heading)] hover:bg-cream transition-colors duration-300"
        >
          {t("button")}
          <span
            aria-hidden="true"
            className="text-base leading-none transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
          >
            ↘
          </span>
        </a>
      </motion.div>
    </section>
  );
}
