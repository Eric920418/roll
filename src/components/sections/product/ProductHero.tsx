"use client";

import { useRef } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion, type Variants } from "motion/react";
import NovaLogo from "@/components/brand/NovaLogo";

const NovaIridescence = dynamic(
  () => import("@/components/effects/NovaIridescence"),
  { ssr: false },
);

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

const cardItem: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

const FEATURES = ["fundraising", "hiring", "culture"] as const;

function Check() {
  return (
    <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-accent">
      <svg viewBox="0 0 20 20" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
        <path
          d="M4 10.5l3.5 3.5L16 5.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function ProductHero() {
  const t = useTranslations("Product");
  const sectionRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (reduceMotion || event.pointerType === "touch") return;
    const section = sectionRef.current;
    if (!section) return;

    const rect = section.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const normalizedY = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;

    for (let depth = 1; depth <= 3; depth += 1) {
      section.style.setProperty(
        `--nova-card-x-${depth}`,
        `${normalizedX * depth * 4}px`,
      );
      section.style.setProperty(
        `--nova-card-y-${depth}`,
        `${normalizedY * depth * 3}px`,
      );
    }
  }

  function resetParallax() {
    const section = sectionRef.current;
    if (!section) return;
    for (let depth = 1; depth <= 3; depth += 1) {
      section.style.setProperty(`--nova-card-x-${depth}`, "0px");
      section.style.setProperty(`--nova-card-y-${depth}`, "0px");
    }
  }

  return (
    <section
      ref={sectionRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetParallax}
      className="relative min-h-[680px] overflow-hidden bg-primary pb-16 pt-28 text-white md:flex md:min-h-[min(800px,100svh)] md:items-center md:pb-24 md:pt-36"
    >
      <div
        aria-hidden="true"
        className="nova-hero-fluid pointer-events-none absolute inset-0 z-0"
      >
        <NovaIridescence speed={0.5} amplitude={0.18} mouseReact />
      </div>
      <div
        aria-hidden="true"
        className="nova-hero-fluid-shade pointer-events-none absolute inset-0 z-[1]"
      />
      <div
        aria-hidden="true"
        className="nova-hero-ambient pointer-events-none absolute -left-[12%] top-[8%] z-[2] h-[56%] w-[58%]"
      />
      <div
        aria-hidden="true"
        className="nova-hero-ambient nova-hero-ambient-secondary pointer-events-none absolute -right-[18%] bottom-[-22%] z-[2] h-[64%] w-[64%]"
      />
      <motion.div
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
        variants={container}
        className="relative z-10 w-full max-w-6xl mx-auto px-5 md:px-8 grid md:grid-cols-2 gap-12 md:gap-10 items-center"
      >
        {/* 左：NOVA 金屬識別 + 副標 + CTA */}
        <div className="flex flex-col">
          <motion.div variants={item}>
            <div className="relative w-full max-w-[560px]">
              <NovaLogo
                variant="metal"
                priority
                alt={t("hero.brand")}
                sizes="(min-width: 768px) 560px, 88vw"
                className="relative z-10 h-auto w-full opacity-95 [filter:brightness(1.28)_contrast(1.04)_drop-shadow(0_16px_36px_rgba(0,0,0,0.42))]"
              />
              <div
                aria-hidden="true"
                className="nova-liquid-logo-glint pointer-events-none absolute inset-0 z-20"
              />
            </div>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
              {t("hero.byline")}
            </p>
          </motion.div>
          <motion.p
            variants={item}
            className="mt-7 max-w-md text-base leading-relaxed text-white/70 font-[family-name:var(--font-body)] md:mt-8 md:text-lg"
          >
            {t("hero.tagline")}
          </motion.p>
          <motion.div variants={item} className="mt-9 md:mt-10 flex items-center gap-4">
            <a
              href="#pricing"
              className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-primary transition-colors duration-300 hover:bg-accent md:px-9 md:text-base font-[family-name:var(--font-heading)]"
            >
              {t("hero.ctaPrimary")}
            </a>
            <span className="text-sm text-white/45 font-[family-name:var(--font-body)]">
              {t("hero.ctaNote")}
            </span>
          </motion.div>
        </div>

        {/* 右：3 張勾選功能卡 */}
        <div className="flex flex-col gap-4">
          {FEATURES.map((f, index) => (
            <motion.div
              key={f}
              variants={cardItem}
              className="nova-hero-card rounded-2xl"
              style={
                {
                  "--nova-card-x": `var(--nova-card-x-${index + 1}, 0px)`,
                  "--nova-card-y": `var(--nova-card-y-${index + 1}, 0px)`,
                  "--nova-card-delay": `${index * 0.85}s`,
                } as React.CSSProperties
              }
            >
              <div className="nova-hero-card-surface flex items-start gap-4 rounded-2xl border border-accent/30 bg-white/[0.055] px-6 py-5 backdrop-blur-[3px]">
                <Check />
                <div>
                  <h3 className="text-base font-bold tracking-[-0.02em] text-white font-[family-name:var(--font-heading)] md:text-lg">
                    {t(`features.${f}.title`)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/55 font-[family-name:var(--font-body)]">
                    {t(`features.${f}.desc`)}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
      <div
        aria-hidden="true"
        className="nova-hero-signal pointer-events-none absolute bottom-0 left-0 h-px w-full"
      />
    </section>
  );
}
