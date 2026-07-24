"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";
import NovaLogo from "@/components/brand/NovaLogo";

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
    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
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
    <section className="relative overflow-hidden bg-primary pb-16 pt-28 text-white md:pb-24 md:pt-36">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={container}
        className="relative z-10 w-full max-w-6xl mx-auto px-5 md:px-8 grid md:grid-cols-2 gap-12 md:gap-10 items-center"
      >
        {/* 左：NOVA 金屬識別 + 副標 + CTA */}
        <div className="flex flex-col">
          <motion.div variants={item}>
            <NovaLogo
              variant="metal"
              priority
              alt={t("hero.brand")}
              sizes="(min-width: 768px) 520px, 88vw"
              className="h-auto w-full max-w-[520px] [filter:brightness(1.55)_contrast(0.9)]"
            />
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
              {t("hero.byline")}
            </p>
          </motion.div>
          <motion.p
            variants={item}
            className="mt-7 max-w-md text-base leading-relaxed text-white/70 font-[family-name:var(--font-body)] md:mt-8 md:text-lg"
          >
            {t("hero.tagline")}
          </motion.p>
          <motion.div variants={item} className="mt-9 md:mt-10 flex items-center gap-4">
            <a
              href="#pricing"
              className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-primary transition-colors duration-300 hover:bg-accent md:px-9 md:text-base font-[family-name:var(--font-heading)]"
            >
              {t("hero.ctaPrimary")}
            </a>
            <span className="text-sm text-white/45 font-[family-name:var(--font-body)]">
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
              className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-5"
            >
              <Check />
              <div>
                <h3 className="text-base font-bold tracking-[-0.02em] text-white font-[family-name:var(--font-heading)] md:text-lg">
                  {t(`features.${f}.title`)}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55 font-[family-name:var(--font-body)]">
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
