"use client";

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "@/lib/gsap-register";

export default function AboutRollUpSpirit() {
  const t = useTranslations("AboutPage.rollUpSpirit");
  const sectionRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (!sectionRef.current) return;
      gsap.from(".about-stack-line", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.15,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 75%",
          once: true,
        },
      });
      gsap.from(".about-spirit-text", {
        opacity: 0,
        x: 30,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 65%",
          once: true,
        },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const wordmark = t("stackedWordmark");

  return (
    <section
      ref={sectionRef}
      className="bg-cream text-dark py-24 md:py-32 px-5 md:px-8 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <div className="flex flex-col leading-[0.85] font-[family-name:var(--font-display)] tracking-[-0.02em] select-none">
          <span className="about-stack-line whitespace-nowrap text-[14vw] md:text-[8vw] lg:text-[8.5vw] text-dark">
            {wordmark}
          </span>
          <span className="about-stack-line whitespace-nowrap text-[14vw] md:text-[8vw] lg:text-[8.5vw] text-dark/40">
            {wordmark}
          </span>
          <span className="about-stack-line whitespace-nowrap text-[14vw] md:text-[8vw] lg:text-[8.5vw] text-dark/15">
            {wordmark}
          </span>
        </div>

        <div className="flex flex-col">
          <h2 className="about-spirit-text text-3xl md:text-5xl font-bold text-primary leading-tight tracking-tight font-[family-name:var(--font-heading)]">
            {t("title")}
            <span className="text-primary">.</span>
          </h2>
          <p className="about-spirit-text mt-6 text-base md:text-lg text-dark/80 leading-relaxed font-[family-name:var(--font-body)]">
            {t("body")}
          </p>
        </div>
      </div>
    </section>
  );
}
