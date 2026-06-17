"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const cardItem: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const FEATURES = ["fundraising", "hiring", "culture"] as const;

function Check() {
  return (
    <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary">
      <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
        <path
          d="M4 10.5l3.5 3.5L16 5.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function ProductHero() {
  const t = useTranslations("Product");

  return (
    <section className="relative bg-cream pt-28 md:pt-36 pb-16 md:pb-24 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -right-[6%] -top-[12%] text-[24rem] md:text-[40rem] font-black text-primary/[0.04] leading-none font-[family-name:var(--font-heading)] pointer-events-none select-none"
      >
        R
      </div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={container}
        className="relative z-10 w-full max-w-6xl mx-auto px-5 md:px-8 grid md:grid-cols-2 gap-12 md:gap-10 items-center"
      >
        {/* 左：品牌標題 + 副標 + CTA */}
        <div className="flex flex-col">
          <motion.h1
            variants={item}
            className="text-6xl md:text-7xl lg:text-8xl font-extrabold text-primary leading-[0.95] tracking-[-0.04em] font-[family-name:var(--font-heading)]"
          >
            {t("hero.brand")}
          </motion.h1>
          <motion.p
            variants={item}
            className="mt-7 md:mt-8 text-base md:text-lg text-dark/70 leading-relaxed max-w-md font-[family-name:var(--font-body)]"
          >
            {t("hero.tagline")}
          </motion.p>
          <motion.div variants={item} className="mt-9 md:mt-10 flex items-center gap-4">
            <a
              href="#pricing"
              className="inline-flex items-center rounded-full bg-primary text-white px-8 md:px-9 py-3.5 text-sm md:text-base font-semibold font-[family-name:var(--font-heading)] hover:bg-primary-dark transition-colors duration-300"
            >
              {t("hero.ctaPrimary")}
            </a>
            <span className="text-sm text-dark/50 font-[family-name:var(--font-body)]">
              {t("hero.ctaNote")}
            </span>
          </motion.div>
        </div>

        {/* 右：3 張勾選功能卡 */}
        <div className="flex flex-col gap-4">
          {FEATURES.map((f) => (
            <motion.div
              key={f}
              variants={cardItem}
              className="flex items-start gap-4 rounded-2xl bg-white border border-dark/5 px-6 py-5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
            >
              <Check />
              <div>
                <h3 className="text-base md:text-lg font-bold text-dark tracking-[-0.02em] font-[family-name:var(--font-heading)]">
                  {t(`features.${f}.title`)}
                </h3>
                <p className="mt-1.5 text-sm text-dark/60 leading-relaxed font-[family-name:var(--font-body)]">
                  {t(`features.${f}.desc`)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
