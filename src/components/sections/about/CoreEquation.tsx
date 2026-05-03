"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

function EquationCell({ label, body }: { label: string; body: string }) {
  return (
    <motion.div variants={item} className="flex flex-col gap-3 md:gap-4">
      <div className="text-4xl md:text-5xl lg:text-6xl text-primary font-[family-name:var(--font-display)] leading-none tracking-tight">
        {label}
      </div>
      <p className="text-sm md:text-base text-dark/80 leading-relaxed font-[family-name:var(--font-body)] max-w-[28ch]">
        {body}
      </p>
    </motion.div>
  );
}

function Symbol({ char }: { char: string }) {
  return (
    <motion.div
      variants={item}
      aria-hidden="true"
      className="text-4xl md:text-5xl lg:text-6xl text-primary font-[family-name:var(--font-display)] leading-none flex items-start pt-1 md:pt-0"
    >
      {char}
    </motion.div>
  );
}

export default function AboutCoreEquation() {
  const t = useTranslations("AboutPage.coreEquation");

  return (
    <section className="bg-cream text-dark py-20 md:py-28 px-5 md:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-15%" }}
        variants={container}
        className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-y-10 md:gap-x-10 items-start"
      >
        <EquationCell label={t("rollOnLabel")} body={t("rollOnBody")} />
        <Symbol char="+" />
        <EquationCell label={t("rollUpLabel")} body={t("rollUpBody")} />
        <Symbol char="=" />
        <EquationCell label={t("impactLabel")} body={t("impactBody")} />
      </motion.div>
    </section>
  );
}
