"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import NovaLogo from "@/components/brand/NovaLogo";

export default function ProductCTA() {
  const t = useTranslations("Product.cta");
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  const reflectionX = useTransform(scrollYProgress, [0, 1], ["-65%", "85%"]);

  return (
    <section
      ref={sectionRef}
      className="relative overflow-hidden bg-primary px-5 py-20 md:px-8 md:py-28"
    >
      <motion.div
        aria-hidden="true"
        className="nova-cta-reflection pointer-events-none absolute -inset-y-1/2 left-0 w-[42%]"
        style={{ x: reduceMotion ? 0 : reflectionX }}
      />
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-12%" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 max-w-5xl mx-auto flex flex-col items-start gap-6 md:gap-8"
      >
        <NovaLogo
          variant="white"
          alt={t("brand")}
          sizes="(min-width: 768px) 520px, 88vw"
          className="h-auto w-full max-w-[520px]"
        />
        <p className="-mt-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
          {t("byline")}
        </p>

        <div className="flex flex-col gap-1.5">
          <p className="text-xl md:text-2xl font-bold text-white tracking-[-0.02em] font-[family-name:var(--font-heading)]">
            {t("line1")}
          </p>
          <p className="text-base md:text-lg text-white/70 font-[family-name:var(--font-body)]">
            {t("line2")}
          </p>
        </div>

        <a
          href="#contact"
          className="group mt-2 inline-flex items-center gap-2 rounded-full bg-white text-primary px-9 md:px-10 py-3.5 md:py-4 text-sm md:text-base font-semibold font-[family-name:var(--font-heading)] hover:bg-cream transition-colors duration-300"
        >
          {t("button")}
          <span
            aria-hidden="true"
            className="text-base leading-none transition-transform duration-300 group-hover:translate-x-0.5 group-hover:translate-y-0.5"
          >
            ↘
          </span>
        </a>
      </motion.div>
    </section>
  );
}
