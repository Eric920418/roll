"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";

export default function Hero() {
  const t = useTranslations("Hero");

  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center bg-primary overflow-hidden"
    >
      <div className="container mx-auto px-8 md:px-16 lg:px-24">
        <div className="max-w-4xl">
          {/* ROLL ON. Title */}
          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-white text-7xl md:text-8xl lg:text-9xl font-bold leading-[0.9] tracking-tight font-[family-name:var(--font-heading)]"
          >
            ROLL
            <br />
            ON.
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="text-white/80 text-lg md:text-xl mt-8 font-light tracking-wide font-[family-name:var(--font-heading)]"
          >
            {t("tagline")}
          </motion.p>
        </div>
      </div>

      {/* Subtle gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary-dark/50 to-transparent" />
    </section>
  );
}
