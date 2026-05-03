"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function AboutPhilosophy() {
  const t = useTranslations("AboutPage.philosophy");

  return (
    <section className="bg-primary text-cream py-24 md:py-32 px-5 md:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-15%" }}
        variants={container}
        className="max-w-6xl mx-auto"
      >
        <motion.h2
          variants={item}
          className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-[-0.04em] font-[family-name:var(--font-heading)]"
        >
          {t("title")}
          <span className="text-cream/50">.</span>
        </motion.h2>

        <motion.p
          variants={item}
          className="mt-8 max-w-3xl text-base md:text-lg text-cream/85 leading-relaxed font-[family-name:var(--font-body)]"
        >
          {t("intro")}
        </motion.p>

        <motion.hr
          variants={item}
          className="my-14 md:my-20 border-cream/25"
        />

        <div className="grid md:grid-cols-2 gap-10 md:gap-16">
          <motion.div variants={item} className="border-l-2 border-cream/40 pl-6">
            <h3 className="text-2xl md:text-3xl font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)]">
              {t("forwardMotionTitle")}
            </h3>
            <p className="mt-5 text-cream/85 leading-relaxed text-sm md:text-base font-[family-name:var(--font-body)]">
              {t("forwardMotionBody")}
            </p>
          </motion.div>

          <motion.div variants={item} className="border-l-2 border-cream/40 pl-6">
            <h3 className="text-2xl md:text-3xl font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)]">
              {t("visionImpactTitle")}
            </h3>
            <p className="mt-5 text-cream/85 leading-relaxed text-sm md:text-base font-[family-name:var(--font-body)]">
              {t("visionImpactBody")}
            </p>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
