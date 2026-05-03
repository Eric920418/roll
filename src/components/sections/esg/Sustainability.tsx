"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 60, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
  },
};

export default function Sustainability() {
  const t = useTranslations("ESG.sustainability");

  const pillars = [
    { letter: "E", rest: "nvironment", desc: t("environmentDesc") },
    { letter: "S", rest: "ocial", desc: t("socialDesc") },
    { letter: "G", rest: "overnance", desc: t("governanceDesc") },
  ];

  return (
    <section className="bg-primary py-20 md:py-28">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-12%" }}
        variants={container}
        className="w-full max-w-6xl mx-auto px-5 md:px-8 flex flex-col gap-10 md:gap-14"
      >
        <motion.h2
          variants={item}
          className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.04em] font-[family-name:var(--font-heading)]"
        >
          {t("title")}
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
          {pillars.map((p, i) => (
            <motion.div
              key={i}
              variants={item}
              whileHover={{ y: -6 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              className="bg-white rounded-xl p-6 md:p-8 flex flex-col gap-5"
            >
              <h3 className="flex items-baseline font-[family-name:var(--font-heading)] leading-none">
                <span className="text-5xl md:text-6xl font-bold text-primary">
                  {p.letter}
                </span>
                <span className="text-xl md:text-2xl font-semibold text-dark">
                  {p.rest}
                </span>
              </h3>
              <div className="h-px bg-dark/10" />
              <p className="text-sm md:text-[15px] text-dark/70 leading-relaxed font-[family-name:var(--font-body)]">
                {p.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
