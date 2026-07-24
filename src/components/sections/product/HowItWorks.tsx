"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  motion,
  useReducedMotion,
  useScroll,
  type Variants,
} from "motion/react";

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
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start 78%", "end 58%"],
  });

  return (
    <section
      ref={sectionRef}
      className="bg-white py-20 md:py-28 px-5 md:px-8"
    >
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={reduceMotion ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center text-3xl md:text-5xl font-extrabold text-dark tracking-[-0.04em] font-[family-name:var(--font-heading)]"
        >
          {t("title")}
        </motion.h2>

        <motion.div
          initial={reduceMotion ? false : "hidden"}
          whileInView="visible"
          viewport={{ once: true, margin: "-12%" }}
          variants={container}
          className="relative mt-14 grid gap-12 md:mt-20 md:grid-cols-3 md:gap-8"
        >
          <div
            aria-hidden="true"
            className="absolute bottom-4 left-[23px] top-6 w-px overflow-hidden bg-dark/10 md:hidden"
          >
            <motion.span
              className="block h-full w-full origin-top bg-accent"
              style={{ scaleY: reduceMotion ? 1 : scrollYProgress }}
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute left-[4%] right-[4%] top-[29px] hidden h-px overflow-hidden bg-dark/10 md:block"
          >
            <motion.span
              className="block h-full w-full origin-left bg-accent"
              style={{ scaleX: reduceMotion ? 1 : scrollYProgress }}
            />
          </div>

          {STEPS.map((s) => (
            <motion.div
              key={s}
              variants={item}
              className="relative flex flex-col pl-14 md:pl-0"
            >
              <div className="relative z-10 -ml-14 w-fit bg-white pr-3 text-5xl font-extrabold leading-none tracking-[-0.04em] text-primary/90 font-[family-name:var(--font-heading)] md:ml-0 md:px-3 md:text-6xl">
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
