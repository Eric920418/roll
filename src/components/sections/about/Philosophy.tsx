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

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text.split("\n\n").map((p, i) => (
        <p key={i} className={`${className ?? ""} ${i > 0 ? "mt-5" : ""}`}>
          {p}
        </p>
      ))}
    </>
  );
}

export default function AboutPhilosophy() {
  const t = useTranslations("AboutPage.philosophy");

  return (
    <section className="bg-cream text-dark py-24 md:py-32 px-5 md:px-8">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-15%" }}
        variants={container}
        className="max-w-6xl mx-auto"
      >
        <motion.h2
          variants={item}
          className="text-4xl md:text-6xl lg:text-7xl font-extrabold text-primary leading-[1.05] tracking-[-0.04em] font-[family-name:var(--font-heading)]"
        >
          {t("title")}
          <span className="text-primary">.</span>
        </motion.h2>

        <motion.p
          variants={item}
          className="mt-8 max-w-3xl text-base md:text-lg text-dark/85 leading-relaxed font-[family-name:var(--font-body)]"
        >
          {t("intro")}
        </motion.p>

        <motion.hr
          variants={item}
          className="my-14 md:my-20 border-primary/20"
        />

        <div className="grid md:grid-cols-2 gap-10 md:gap-16">
          <motion.div variants={item} className="border-l-4 border-primary pl-6 md:pl-8">
            <h3 className="text-3xl md:text-4xl font-extrabold text-primary tracking-[-0.04em] font-[family-name:var(--font-heading)]">
              {t("forwardMotionTitle")}
            </h3>
            <div className="mt-5 text-dark/85 leading-relaxed text-sm md:text-base font-[family-name:var(--font-body)]">
              <Paragraphs text={t("forwardMotionBody")} />
            </div>
          </motion.div>

          <motion.div variants={item} className="border-l-4 border-primary pl-6 md:pl-8">
            <h3 className="text-3xl md:text-4xl font-extrabold text-primary tracking-[-0.04em] font-[family-name:var(--font-heading)]">
              {t("visionImpactTitle")}
            </h3>
            <div className="mt-5 text-dark/85 leading-relaxed text-sm md:text-base font-[family-name:var(--font-body)]">
              <Paragraphs text={t("visionImpactBody")} />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
