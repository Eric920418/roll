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

type CardProps = { num: string; title: string; body: React.ReactNode };

function PrincipleCard({ num, title, body }: CardProps) {
  return (
    <motion.div
      variants={card}
      className="bg-primary text-cream rounded-lg px-7 md:px-8 py-12 md:py-16 flex flex-col items-center text-center min-h-[420px] md:min-h-[480px]"
    >
      <div className="text-6xl md:text-7xl lg:text-8xl text-cream/30 font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)] leading-none">
        {num}
      </div>
      <h3 className="mt-6 md:mt-8 text-2xl md:text-3xl font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)] text-cream">
        {title}
      </h3>
      <div className="mt-8 md:mt-10 text-cream/85 leading-relaxed text-sm md:text-base font-[family-name:var(--font-body)] whitespace-pre-line max-w-[28ch]">
        {body}
      </div>
    </motion.div>
  );
}

export default function AboutPrinciples() {
  const t = useTranslations("AboutPage.principles");

  // Bold spans (e.g. "unfair advantage", "value, not price.") 來自 i18n 的 <b> 標籤
  const renderBody = (key: "p1Body" | "p2Body" | "p3Body") =>
    t.rich(key, {
      b: (chunks) => <strong className="font-bold text-cream">{chunks}</strong>,
    });

  return (
    <section className="bg-cream py-20 md:py-28 px-5 md:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-12%" }}
        variants={container}
        className="max-w-7xl mx-auto grid md:grid-cols-3 gap-4 md:gap-5"
      >
        <PrincipleCard num="01" title={t("p1Title")} body={renderBody("p1Body")} />
        <PrincipleCard num="02" title={t("p2Title")} body={renderBody("p2Body")} />
        <PrincipleCard num="03" title={t("p3Title")} body={renderBody("p3Body")} />
      </motion.div>
    </section>
  );
}
