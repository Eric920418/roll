"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function AboutHero() {
  const t = useTranslations("AboutPage.hero");

  return (
    <section className="bg-cream text-dark min-h-[88vh] flex flex-col items-center justify-center px-5 md:px-8 pt-32 pb-20">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center"
      >
        <h1 className="text-[18vw] md:text-[14vw] lg:text-[12vw] leading-[0.9] tracking-[-0.02em] font-[family-name:var(--font-display)]">
          {t("wordmark")}
          <span className="text-primary"> .</span>
        </h1>
        <p className="mt-6 md:mt-8 text-primary uppercase tracking-[0.22em] text-xs md:text-sm font-[family-name:var(--font-heading)]">
          {t("tagline")}
        </p>
      </motion.div>
    </section>
  );
}
