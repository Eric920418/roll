"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

type CardProps = { num: string; title: string; body: string };

function PrincipleCard({ num, title, body }: CardProps) {
  return (
    <motion.div variants={card} className="px-6 md:px-10 py-8 md:py-12 flex flex-col">
      <div className="text-6xl md:text-7xl lg:text-8xl text-cream/35 font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)] leading-none">
        {num}
      </div>
      <h3 className="mt-6 md:mt-8 text-2xl md:text-3xl font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)]">
        {title}
      </h3>
      <p className="mt-4 md:mt-5 text-cream/85 leading-relaxed text-sm md:text-base font-[family-name:var(--font-body)]">
        {body}
      </p>
    </motion.div>
  );
}

export default function AboutPrinciples() {
  const t = useTranslations("AboutPage.principles");

  return (
    <section className="bg-primary text-cream py-20 md:py-28 px-5 md:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-12%" }}
        variants={container}
        className="max-w-7xl mx-auto grid md:grid-cols-3 md:divide-x divide-cream/40"
      >
        <PrincipleCard num="01" title={t("p1Title")} body={t("p1Body")} />
        <PrincipleCard num="02" title={t("p2Title")} body={t("p2Body")} />
        <PrincipleCard num="03" title={t("p3Title")} body={t("p3Body")} />
      </motion.div>
    </section>
  );
}
