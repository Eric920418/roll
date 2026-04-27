"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "motion/react";
import { gsap } from "@/lib/gsap-register";
import CounterAnimation from "@/components/ui/CounterAnimation";
import World from "@svg-maps/world";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

const mapData = [
  { key: "america", value: 26 },
  { key: "canada", value: 27 },
  { key: "africa", value: 12 },
  { key: "vietnam", value: 13 },
  { key: "turkey", value: 24 },
  { key: "taiwan", value: 100 },
  { key: "japan", value: 41 },
  { key: "cambodia", value: 3 },
] as const;

const comparisonData = {
  global: { value: 1000000, suffix: "+" },
  taiwan: { value: 20000, suffix: "⬆" },
};

const epicenterPillars = [
  {
    label: "CAPITAL",
    description:
      "Retail stock market investment volume has officially surpassed the UK.",
  },
  {
    label: "TECHNOLOGY",
    description:
      "Global epicenter for Semiconductor and Medical CDMO excellence.",
  },
  {
    label: "STRATEGY",
    description: "",
  },
];

export default function RollMap() {
  const t = useTranslations("RollMap");
  const tHero = useTranslations("Hero");
  const locale = useLocale() as Locale;
  const esgHref = pathForLocale("/esg", locale);
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);
  const whyTaiwanRef = useRef<HTMLDivElement>(null);
  const numbersBlockRef = useRef<HTMLDivElement>(null);
  const [globalCounterValue, setGlobalCounterValue] = useState(0);
  const [taiwanCounterValue, setTaiwanCounterValue] = useState(0);
  const [page3Active, setPage3Active] = useState(false);
  const [page3ClientsActive, setPage3ClientsActive] = useState(false);
  const page3Triggered = useRef(false);

  useEffect(() => {
    if (!sectionRef.current) return;

    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      // Pin + multi-page crossfade
      if (page1Ref.current && page2Ref.current && page3Ref.current) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: isMobile ? "+=300%" : "+=450%",
            pin: true,
            scrub: 0.8,
          },
        });

        // === Flip ROAD → ROLL (only the word, MAP stays static) ===
        const flipFronts =
          page1Ref.current.querySelectorAll(".flip-front");
        const flipBacks =
          page1Ref.current.querySelectorAll(".flip-back");

        // Flip out "ROAD"
        tl.to(flipFronts, {
          rotateX: 90,
          opacity: 0,
          duration: 0.2,
          ease: "none",
        });

        // Flip in "ROLL"
        tl.fromTo(
          flipBacks,
          { rotateX: -90, opacity: 0 },
          {
            rotateX: 0,
            opacity: 1,
            duration: 0.2,
            ease: "none",
          },
          "-=0.1",
        );

        // === Hold ROLL MAP ===
        tl.to({}, { duration: 0.25 });

        // === Page 1 → Page 2 ===
        tl.to(page1Ref.current, {
          opacity: 0,
          y: -60,
          duration: 0.4,
          ease: "none",
        });

        tl.to({}, { duration: 0.1 });

        tl.fromTo(
          page2Ref.current,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            ease: "none",
          },
        );

        // Why Taiwan: title first, then each line reveals one-by-one (scrub)
        if (whyTaiwanRef.current) {
          const title = whyTaiwanRef.current.querySelector(
            ".why-taiwan-title",
          );
          const lines =
            whyTaiwanRef.current.querySelectorAll(".why-taiwan-line");

          if (title) {
            tl.fromTo(
              title,
              { opacity: 0, y: 24 },
              { opacity: 1, y: 0, duration: 0.25, ease: "none" },
            );
          }

          if (lines.length) {
            tl.fromTo(
              lines,
              { opacity: 0, y: 18 },
              {
                opacity: 1,
                y: 0,
                duration: 0.3,
                ease: "none",
                stagger: 0.25,
              },
            );
          }
        }

        // Hold the text so user has time to read
        tl.to({}, { duration: 0.25 });

        // Numbers block enters — scrub-driven
        if (numbersBlockRef.current) {
          tl.fromTo(
            numbersBlockRef.current,
            { opacity: 0, y: 30 },
            { opacity: 1, y: 0, duration: 0.35, ease: "none" },
          );

          // Counter values tick up in parallel with opacity fade
          const globalObj = { val: 0 };
          const taiwanObj = { val: 0 };

          tl.to(
            globalObj,
            {
              val: comparisonData.global.value,
              duration: 0.35,
              ease: "none",
              onUpdate: () =>
                setGlobalCounterValue(Math.round(globalObj.val)),
            },
            "<",
          );

          tl.to(
            taiwanObj,
            {
              val: comparisonData.taiwan.value,
              duration: 0.35,
              ease: "none",
              onUpdate: () =>
                setTaiwanCounterValue(Math.round(taiwanObj.val)),
            },
            "<",
          );
        }

        // Hold Page 2
        tl.to({}, { duration: 0.2 });

        // === Page 2 → Page 3 ===
        tl.to(page2Ref.current, {
          opacity: 0,
          y: -60,
          duration: 0.4,
          ease: "none",
        });

        tl.to({}, { duration: 0.1 });

        tl.fromTo(
          page3Ref.current,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "none",
            onUpdate: function () {
              if (this.progress() >= 0.15 && !page3Triggered.current) {
                page3Triggered.current = true;
                setPage3Active(true);
                setTimeout(() => setPage3ClientsActive(true), 1200);
              }
            },
          },
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="rollmap-sr-heading"
      className="relative min-h-screen bg-white flex items-center justify-center overflow-hidden"
    >
      {/* SSR text version — visually hidden but present in DOM for LLMs & screen readers */}
      <div className="sr-only">
        <h2 id="rollmap-sr-heading">
          ROLL MAP — Foreign companies served by ROLL ON. across regions
        </h2>
        <p>
          ROLL ON. is a Taipei-based consulting firm. Below is the distribution
          of foreign companies we have supported, by region.
        </p>
        <dl>
          {mapData.map((item) => (
            <div key={item.key}>
              <dt>{t(item.key)}</dt>
              <dd>{item.value} companies</dd>
            </div>
          ))}
        </dl>

        <h3>{t("comparisonTitle")}</h3>
        <dl>
          <div>
            <dt>{t("globalLabel")}</dt>
            <dd>{comparisonData.global.value.toLocaleString()}+</dd>
          </div>
          <div>
            <dt>{t("taiwanLabel")}</dt>
            <dd>{comparisonData.taiwan.value.toLocaleString()}</dd>
          </div>
        </dl>
        <p>
          Why Taiwan, Why Now? Taiwan has reached a pivotal economic moment.
          Retail stock market investment has officially surpassed that of the
          United Kingdom, and Taiwan remains the global epicenter for
          Semiconductor and Medical CDMO manufacturing.
        </p>

        <h3>The New Epicenter of Global Growth</h3>
        <p>Beyond Manufacturing — A Hub of Capital and Innovation.</p>
        <dl>
          {epicenterPillars.map((p) => (
            <div key={p.label}>
              <dt>{p.label}</dt>
              <dd>{p.description || "Description coming soon."}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Background: stays fixed */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 600'%3E%3Cellipse cx='300' cy='250' rx='200' ry='150' fill='%237B1A2C' opacity='0.3'/%3E%3Cellipse cx='700' cy='200' rx='250' ry='180' fill='%237B1A2C' opacity='0.2'/%3E%3Cellipse cx='950' cy='300' rx='150' ry='120' fill='%237B1A2C' opacity='0.25'/%3E%3C/svg%3E")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </div>

      {/* Page 1: Hero + Map Data Grid (split layout) */}
      <div
        ref={page1Ref}
        className="absolute inset-0 flex flex-col md:flex-row z-10"
      >
        <a
          href={esgHref}
          aria-label="Go to ESG page"
          className="group absolute bottom-6 right-6 md:bottom-10 md:right-10 z-30 inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-white border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white shadow-xl transition-all duration-300 hover:scale-105"
        >
          <span className="font-bold text-lg md:text-xl tracking-[0.18em] font-[family-name:var(--font-heading)]">
            ESG
          </span>
        </a>
        {/* Left: Hero content */}
        <div className="flex-1 flex items-center bg-primary relative overflow-hidden">
          <div className="px-8 md:px-12 lg:px-16 xl:px-24 w-full">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative w-full max-w-[560px]"
            >
              <Image
                src="/vertical.png"
                alt="ROLL ON."
                width={700}
                height={547}
                priority
                className="w-full h-auto object-contain"
              />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="text-white/80 text-base md:text-lg lg:text-xl mt-6 md:mt-8 font-light tracking-wide font-[family-name:var(--font-heading)]"
            >
              {tHero("tagline")}
            </motion.p>
          </div>
          {/* Subtle gradient overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary-dark/50 to-transparent" />
        </div>

        {/* Right: Map Data with flip */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="flex-1 flex flex-col items-center justify-center bg-white px-8 md:px-12 lg:px-16"
        >
          {/* Title: only ROAD/ROLL flips, MAP stays static */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.45 }}
            className="mb-8 md:mb-14 w-full"
          >
            <h2
              ref={titleRef}
              className="text-center text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-dark tracking-tight font-[family-name:var(--font-heading)]"
            >
              <span className="inline-block relative" style={{ perspective: "800px" }}>
                <span
                  className="flip-front inline-block"
                  style={{ transformOrigin: "center bottom" }}
                >
                  ROAD
                </span>
                <span
                  className="flip-back inline-block absolute top-0 left-0 w-full text-center"
                  style={{
                    transformOrigin: "center bottom",
                    transform: "rotateX(-90deg)",
                    opacity: 0,
                  }}
                >
                  ROLL
                </span>
              </span>
              {" MAP"}
            </h2>
          </motion.div>

          {/* Grid — static numbers, no flip */}
          <div
            ref={gridRef}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 w-full max-w-xl"
          >
            {mapData.map((item, index) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.7,
                  ease: [0.22, 1, 0.36, 1],
                  delay: 0.6 + index * 0.08,
                }}
                className="map-item text-center"
              >
                <p className="text-sm md:text-base font-medium text-dark/60 mb-2 font-[family-name:var(--font-heading)]">
                  {t(item.key)}
                </p>
                <CounterAnimation
                  end={item.value}
                  className="text-2xl md:text-3xl lg:text-4xl font-bold text-dark font-[family-name:var(--font-heading)]"
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Page 2: Comparison */}
      <div
        ref={page2Ref}
        className="absolute inset-0 flex flex-col items-center justify-center px-8 md:px-16 lg:px-24 z-10 opacity-0"
      >
        {/* Real world map background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
          <svg
            viewBox={World.viewBox}
            className="w-[90%] h-[90%] max-w-5xl"
            preserveAspectRatio="xMidYMid meet"
            fill="#7B1A2C"
          >
            {World.locations.map(
              (location: { id: string; path: string; name: string }) => (
                <path key={location.id} d={location.path} />
              ),
            )}
          </svg>
        </div>

        <div className="w-full max-w-4xl mx-auto relative z-10">
          <div
            ref={whyTaiwanRef}
            className="mb-10 md:mb-14 text-center max-w-3xl mx-auto px-2"
          >
            <h2
              className="why-taiwan-title text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-dark tracking-tight mb-6 md:mb-8 font-[family-name:var(--font-heading)]"
              style={{ opacity: 0 }}
            >
              Why Taiwan, Why Now?
            </h2>
            <div className="space-y-3 md:space-y-4 text-sm md:text-base lg:text-lg text-dark/70 leading-relaxed font-[family-name:var(--font-body)]">
              <p className="why-taiwan-line" style={{ opacity: 0 }}>
                Taiwan has reached a pivotal economic moment.
              </p>
              <p className="why-taiwan-line" style={{ opacity: 0 }}>
                Our retail stock market investment has officially surpassed that
                of the UK.
              </p>
              <p className="why-taiwan-line" style={{ opacity: 0 }}>
                We remain the global epicenter for Semiconductor and Medical
                CDMO.
              </p>
            </div>
          </div>

          <div ref={numbersBlockRef} style={{ opacity: 0 }}>
            <h3 className="text-center text-lg md:text-xl font-medium text-dark/70 mb-8 md:mb-12 font-[family-name:var(--font-heading)]">
              {t("comparisonTitle")}
            </h3>

            <div className="h-32 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
              <div className="comparison-item flex-1 text-center md:text-right md:pr-20">
                <CounterAnimation
                  end={comparisonData.global.value}
                  suffix={comparisonData.global.suffix}
                  value={globalCounterValue}
                  className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-primary font-[family-name:var(--font-heading)]"
                />
                <p className="mt-6 text-sm md:text-base text-dark/60 font-[family-name:var(--font-body)]">
                  {t("globalLabel")}
                </p>
              </div>

              <div className="hidden md:block w-[1px] h-16 bg-dark/30" />
              <div className="block md:hidden h-px w-24 bg-dark/20" />

              <div className="comparison-item flex-1 text-center md:text-left md:pl-20">
                <CounterAnimation
                  end={comparisonData.taiwan.value}
                  suffix={comparisonData.taiwan.suffix}
                  value={taiwanCounterValue}
                  className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-primary font-[family-name:var(--font-heading)]"
                />
                <p className="mt-6 text-sm md:text-base text-dark/60 font-[family-name:var(--font-body)]">
                  {t("taiwanLabel")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Page 3: The New Epicenter of Global Growth */}
      <div
        ref={page3Ref}
        className="absolute inset-0 flex flex-col items-center justify-center px-8 md:px-16 lg:px-24 z-10 opacity-0"
      >
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center text-center">
          {/* Heading */}
          <div
            style={{
              opacity: page3Active ? 1 : 0,
              transform: page3Active ? "none" : "translateY(20px)",
              transition:
                "opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)",
            }}
            className="mb-4 md:mb-6"
          >
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-dark tracking-tight font-[family-name:var(--font-heading)]">
              The New Epicenter of Global Growth
            </h2>
          </div>

          {/* Sub-heading */}
          <p
            style={{
              opacity: page3Active ? 1 : 0,
              transform: page3Active ? "none" : "translateY(14px)",
              transition:
                "opacity 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s, transform 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s",
            }}
            className="text-base md:text-lg lg:text-xl text-dark/65 mb-12 md:mb-16 max-w-2xl font-[family-name:var(--font-body)]"
          >
            Beyond Manufacturing — A Hub of Capital and Innovation.
          </p>

          {/* Three pillars */}
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {epicenterPillars.map((pillar, i) => {
              const isStrategy = pillar.label === "STRATEGY";
              const reveal = isStrategy ? page3ClientsActive : page3Active;
              const delay = isStrategy ? 0 : 0.3 + i * 0.15;
              return (
                <div
                  key={pillar.label}
                  style={{
                    opacity: reveal ? 1 : 0,
                    transform: reveal ? "none" : "translateY(24px)",
                    transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
                  }}
                  className="flex flex-col gap-4 text-left p-6 md:p-7 rounded-xl border border-dark/10 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-[3px] h-5 bg-primary" />
                    <span className="text-[11px] md:text-xs font-bold tracking-[0.22em] uppercase text-primary font-[family-name:var(--font-heading)]">
                      {pillar.label}
                    </span>
                  </div>
                  {pillar.description ? (
                    <p className="text-sm md:text-base text-dark/75 leading-relaxed font-[family-name:var(--font-body)]">
                      {pillar.description}
                    </p>
                  ) : (
                    <p className="text-sm md:text-base text-dark/35 italic leading-relaxed font-[family-name:var(--font-body)]">
                      — description coming soon.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
}
