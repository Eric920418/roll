"use client";

import { useTranslations } from "next-intl";
import { motion, type Variants } from "motion/react";

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};

type Plan = { key: "pro" | "business" | "enterprise"; featured?: boolean };

const PLANS: Plan[] = [
  { key: "pro" },
  { key: "business", featured: true },
  { key: "enterprise" },
];

const FEATS = ["f1", "f2", "f3"] as const;

function Check({ featured }: { featured?: boolean }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full ${
        featured ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
      }`}
    >
      <svg viewBox="0 0 20 20" fill="none" className="w-3 h-3" aria-hidden="true">
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

export default function Pricing() {
  const t = useTranslations("Product.pricing");

  return (
    <section id="pricing" className="bg-cream py-20 md:py-28 px-5 md:px-8 scroll-mt-24">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="text-center text-3xl md:text-5xl font-extrabold text-dark tracking-[-0.04em] font-[family-name:var(--font-heading)]"
        >
          {t("title")}
        </motion.h2>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-10%" }}
          variants={container}
          className="mt-14 md:mt-24 grid md:grid-cols-3 gap-5 md:gap-6 items-stretch"
        >
          {PLANS.map(({ key, featured }) => (
            <motion.div
              key={key}
              variants={card}
              className={`relative flex flex-col rounded-2xl px-7 md:px-8 py-9 md:py-10 ${
                featured
                  ? "bg-primary text-white shadow-[0_24px_60px_-20px_rgba(123,26,44,0.55)] md:-translate-y-4"
                  : "bg-white text-dark border border-dark/5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
              }`}
            >
              {featured && (
                <span className="absolute top-5 right-5 rounded-full bg-accent text-dark text-[11px] font-bold uppercase tracking-[0.12em] px-3 py-1 font-[family-name:var(--font-heading)]">
                  {t("badge")}
                </span>
              )}

              <h3
                className={`text-lg font-bold tracking-[-0.02em] font-[family-name:var(--font-heading)] ${
                  featured ? "text-white" : "text-dark"
                }`}
              >
                {t(`${key}.name`)}
              </h3>

              <div className="mt-4 flex items-end gap-2">
                <span className="text-4xl lg:text-5xl font-extrabold tracking-[-0.04em] leading-none whitespace-nowrap font-[family-name:var(--font-heading)]">
                  {t(`${key}.price`)}
                </span>
                {t(`${key}.unit`) && (
                  <span
                    className={`pb-1 text-sm font-[family-name:var(--font-body)] ${
                      featured ? "text-white/70" : "text-dark/50"
                    }`}
                  >
                    {t(`${key}.unit`)}
                  </span>
                )}
              </div>

              <ul className="mt-8 flex flex-col gap-4">
                {FEATS.map((f) => (
                  <li key={f} className="flex items-center gap-3">
                    <Check featured={featured} />
                    <span
                      className={`text-sm leading-snug font-[family-name:var(--font-body)] ${
                        featured ? "text-white/90" : "text-dark/70"
                      }`}
                    >
                      {t(`${key}.${f}`)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-9 md:mt-auto md:pt-9">
                <a
                  href="#contact"
                  className={`flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold font-[family-name:var(--font-heading)] transition-colors duration-300 ${
                    featured
                      ? "bg-white text-primary hover:bg-cream"
                      : "bg-primary text-white hover:bg-primary-dark"
                  }`}
                >
                  {t(`${key}.cta`)}
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
