"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.15 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function RollingForward() {
  const t = useTranslations("ESG.rollingForward");

  const years = [
    { label: t("year1Label"), title: t("year1Title"), desc: t("year1Desc") },
    { label: t("year3Label"), title: t("year3Title"), desc: t("year3Desc") },
    { label: t("year5Label"), title: t("year5Title"), desc: t("year5Desc") },
  ];

  return (
    <section className="bg-white py-20 md:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-12%" }}
        variants={container}
        className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-10 md:gap-14"
      >
        <motion.h2
          variants={item}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-dark tracking-tight font-[family-name:var(--font-heading)]"
        >
          {t("title")}
        </motion.h2>

        <div className="flex flex-col">
          {years.map((y, i) => (
            <motion.div
              key={i}
              variants={item}
              className="grid grid-cols-[4rem_1fr] md:grid-cols-[7rem_1fr] gap-5 md:gap-10 items-start py-6 md:py-8 border-b border-dark/10 last:border-b-0"
            >
              <span className="text-xs md:text-sm uppercase tracking-widest text-primary font-semibold pt-1 font-[family-name:var(--font-heading)]">
                {y.label}
              </span>
              <div className="flex flex-col gap-3">
                <h3 className="text-xl md:text-2xl lg:text-3xl font-semibold text-dark leading-snug font-[family-name:var(--font-heading)]">
                  {y.title}
                </h3>
                <p className="text-sm md:text-base text-dark/65 leading-relaxed max-w-3xl font-[family-name:var(--font-body)]">
                  {y.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
