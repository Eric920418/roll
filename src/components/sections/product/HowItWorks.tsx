"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const STEPS = ["s1", "s2", "s3"] as const;

export default function HowItWorks() {
  const t = useTranslations("Product.steps");

  return (
    <section className="bg-white py-20 md:py-28 px-5 md:px-8">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center text-3xl md:text-5xl font-extrabold text-dark tracking-[-0.04em] font-[family-name:var(--font-heading)]"
        >
          {t("title")}
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-12%" }}
          variants={container}
          className="mt-14 md:mt-20 grid md:grid-cols-3 gap-10 md:gap-8"
        >
          {STEPS.map((s) => (
            <motion.div key={s} variants={item} className="flex flex-col">
              <div className="text-5xl md:text-6xl font-extrabold text-primary/90 tracking-[-0.04em] font-[family-name:var(--font-heading)] leading-none">
                {t(`${s}.num`)}
              </div>
              <h3 className="mt-6 text-xl md:text-2xl font-bold text-dark tracking-[-0.02em] font-[family-name:var(--font-heading)]">
                {t(`${s}.title`)}
              </h3>
              <p className="mt-3 text-sm md:text-base text-dark/60 leading-relaxed font-[family-name:var(--font-body)] max-w-xs">
                {t(`${s}.desc`)}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
