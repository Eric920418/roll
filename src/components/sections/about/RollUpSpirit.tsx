"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "@/lib/gsap-register";

export default function AboutRollUpSpirit() {
  const t = useTranslations("AboutPage.rollUpSpirit");
  const sectionRef = useRef<HTMLElement | null>(null);

  // Stacked wordmark fade-in via GSAP ScrollTrigger
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (!sectionRef.current) return;
      gsap.from(".about-stack-line", {
        y: 40,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.18,
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

  // Suppress unused warning if title was hidden — keep it accessible via sr-only
  useEffect(() => void t, [t]);

  const wordmark = t("stackedWordmark");

  return (
    <section
      ref={sectionRef}
      className="bg-primary text-cream py-24 md:py-32 px-5 md:px-8 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <div className="font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)] leading-[0.9] select-none whitespace-nowrap text-[14vw] md:text-[10vw] lg:text-[9vw]">
          <div className="about-stack-line text-cream">{wordmark}</div>
          <div className="about-stack-line text-cream/45">{wordmark}</div>
          <div className="about-stack-line text-cream/20">{wordmark}</div>
        </div>

        <div className="flex flex-col">
          {/* Title kept for accessibility but visually hidden per design */}
          <h2 className="sr-only">{t("title")}</h2>
          <div className="about-spirit-text text-base md:text-lg text-cream/90 leading-relaxed font-[family-name:var(--font-body)] space-y-5 whitespace-pre-line">
            <p>
              {t.rich("body", {
                b: (chunks) => (
                  <strong className="font-bold text-cream">{chunks}</strong>
                ),
              })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
