"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";
import CounterAnimation from "@/components/ui/CounterAnimation";

const titleContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const statItem: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function EsgHero() {
  const t = useTranslations("ESG.hero");

  return (
    <section className="relative bg-primary min-h-[85vh] flex items-center py-28 md:py-36 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute -right-[8%] md:-right-[4%] -top-[8%] md:-top-[12%] text-[28rem] md:text-[48rem] lg:text-[56rem] font-black text-white/[0.07] leading-none font-[family-name:var(--font-heading)] pointer-events-none select-none"
      >
        R
      </div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-10%" }}
        variants={titleContainer}
        className="relative z-10 w-full max-w-6xl mx-auto px-5 md:px-8 flex flex-col gap-10 md:gap-14"
      >
        <div>
          <motion.h1
            variants={item}
            className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] tracking-tight font-[family-name:var(--font-heading)]"
          >
            {t("titleLine1")}
          </motion.h1>
          <motion.h1
            variants={item}
            className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-[1.05] tracking-tight font-[family-name:var(--font-heading)]"
          >
            {t("titleLine2")}
          </motion.h1>
        </div>

        <motion.p
          variants={item}
          className="text-base md:text-lg text-white/80 leading-relaxed max-w-3xl font-[family-name:var(--font-body)]"
        >
          {t("lead")}
        </motion.p>

        <motion.div
          variants={titleContainer}
          className="grid grid-cols-3 gap-4 md:gap-10 pt-8 md:pt-10 border-t border-white/20 max-w-4xl"
        >
          <motion.div variants={statItem} className="flex flex-col gap-2">
            <CounterAnimation
              end={3}
              suffix="x"
              className="text-4xl md:text-6xl font-bold text-white font-[family-name:var(--font-heading)]"
            />
            <p className="text-[10px] md:text-xs text-white/60 uppercase tracking-widest font-[family-name:var(--font-heading)]">
              {t("stat1Label")}
            </p>
          </motion.div>
          <motion.div variants={statItem} className="flex flex-col gap-2">
            <CounterAnimation
              end={20000}
              suffix="+"
              className="text-4xl md:text-6xl font-bold text-white font-[family-name:var(--font-heading)]"
            />
            <p className="text-[10px] md:text-xs text-white/60 uppercase tracking-widest font-[family-name:var(--font-heading)]">
              {t("stat2Label")}
            </p>
          </motion.div>
          <motion.div variants={statItem} className="flex flex-col gap-2">
            <span className="text-4xl md:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
              MIT
            </span>
            <p className="text-[10px] md:text-xs text-white/60 uppercase tracking-widest font-[family-name:var(--font-heading)]">
              {t("stat3Label")}
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
