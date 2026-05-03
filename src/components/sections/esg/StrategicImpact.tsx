"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function StrategicImpact() {
  const t = useTranslations("ESG.strategicImpact");

  const titleText = t("title");
  const titleBase = titleText.replace(/\.$/, "");
  const hasDot = titleText.endsWith(".");
  const titleWords = titleBase.split(" ");
  const titleLeadingWords = titleWords.slice(0, -1).join(" ");
  const titleLastWord = titleWords.slice(-1)[0];

  const internationalItems = [
    { title: t("intItem1Title"), desc: t("intItem1Desc") },
    { title: t("intItem2Title"), desc: t("intItem2Desc") },
    { title: t("intItem3Title"), desc: t("intItem3Desc") },
    { title: t("intItem4Title"), desc: t("intItem4Desc") },
  ];

  const taiwanItems = [
    { title: t("twItem1Title"), desc: t("twItem1Desc") },
    { title: t("twItem2Title"), desc: t("twItem2Desc") },
    { title: t("twItem3Title"), desc: t("twItem3Desc") },
  ];

  return (
    <section className="bg-white py-20 md:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-12%" }}
        variants={container}
        className="w-full max-w-6xl mx-auto px-5 md:px-8 flex flex-col gap-6 md:gap-10"
      >
        <motion.h2
          variants={item}
          className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-dark tracking-[-0.04em] leading-[0.95] font-[family-name:var(--font-heading)]"
        >
          <span className="block">{titleLeadingWords}</span>
          <span className="block">
            {titleLastWord}
            {hasDot && <span className="text-primary">.</span>}
          </span>
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-14">
          <motion.div variants={item} className="flex flex-col gap-5">
            <span className="inline-flex self-start px-4 py-1.5 rounded-full border border-primary/30 text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-semibold font-[family-name:var(--font-heading)]">
              {t("forIntBadge")}
            </span>
            <h3 className="text-2xl md:text-3xl font-semibold text-dark leading-snug font-[family-name:var(--font-heading)]">
              {t("forIntHeading")}
            </h3>
            <div className="flex flex-col divide-y divide-dark/10">
              {internationalItems.map((it, i) => (
                <div key={i} className="py-4 flex flex-col gap-1.5">
                  <h4 className="text-base md:text-lg font-semibold text-dark font-[family-name:var(--font-heading)]">
                    {it.title}
                  </h4>
                  <p className="text-xs md:text-sm text-dark/60 leading-relaxed font-[family-name:var(--font-body)]">
                    {it.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div variants={item} className="flex flex-col gap-5">
            <span className="inline-flex self-start px-4 py-1.5 rounded-full border border-primary/30 text-[10px] md:text-[11px] uppercase tracking-widest text-primary font-semibold font-[family-name:var(--font-heading)]">
              {t("forTwBadge")}
            </span>
            <h3 className="text-2xl md:text-3xl font-semibold text-dark leading-snug font-[family-name:var(--font-heading)]">
              {t("forTwHeading")}
            </h3>
            <div className="flex flex-col divide-y divide-dark/10">
              {taiwanItems.map((it, i) => (
                <div key={i} className="py-4 flex flex-col gap-1.5">
                  <h4 className="text-base md:text-lg font-semibold text-dark font-[family-name:var(--font-heading)]">
                    {it.title}
                  </h4>
                  <p className="text-xs md:text-sm text-dark/60 leading-relaxed font-[family-name:var(--font-body)]">
                    {it.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
