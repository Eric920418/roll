"use client";

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "@/lib/gsap-register";

export default function AboutHero() {
  const t = useTranslations("AboutPage.hero");
  const sectionRef = useRef<HTMLElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const wordmarkRef = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (!ballRef.current || !dotRef.current || !wordmarkRef.current || !taglineRef.current) return;

    const ctx = gsap.context(() => {
      const computeAndAnimate = () => {
        const dotEl = dotRef.current!;
        const ballEl = ballRef.current!;
        const sectionEl = sectionRef.current!;

        const dotRect = dotEl.getBoundingClientRect();
        const sectionRect = sectionEl.getBoundingClientRect();

        // Ball must match the CSS dot exactly so the handoff is invisible.
        const ballSize = dotRect.width;
        ballEl.style.width = `${ballSize}px`;
        ballEl.style.height = `${ballSize}px`;

        // Target = exact center of the CSS dot.
        const targetX = dotRect.left + dotRect.width / 2 - sectionRect.left - ballSize / 2;
        const targetY = dotRect.top + dotRect.height / 2 - sectionRect.top - ballSize / 2;

        // Start off-screen left at same Y as the dot
        const startX = -ballSize - 100;
        const distance = targetX - startX;

        gsap.set(ballEl, {
          x: startX,
          y: targetY,
          rotation: 0,
          opacity: 1,
        });
        gsap.set(wordmarkRef.current, { opacity: 0 });
        gsap.set(dotRef.current, { opacity: 0 });
        gsap.set(taglineRef.current, { opacity: 0, y: 16 });

        const tl = gsap.timeline();

        // Roll the ball: travel + rotate, decelerate at the end
        tl.to(ballEl, {
          x: targetX,
          rotation: (distance / (Math.PI * ballSize)) * 360,
          duration: 2.6,
          ease: "power3.out",
        });

        // Tiny settle bounce
        tl.to(ballEl, {
          y: targetY - 6,
          duration: 0.18,
          ease: "power2.out",
        }).to(ballEl, {
          y: targetY,
          duration: 0.32,
          ease: "bounce.out",
        });

        // Wordmark text fades in
        tl.to(
          wordmarkRef.current,
          { opacity: 1, duration: 0.7, ease: "power2.out" },
          ">-0.05",
        );

        // Real dot fades in over the ball; ball fades out (seamless handoff)
        tl.to(dotRef.current, { opacity: 1, duration: 0.4 }, "<");
        tl.to(ballEl, { opacity: 0, duration: 0.4 }, "<");

        // Tagline fades in last
        tl.to(
          taglineRef.current,
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          ">-0.1",
        );
      };

      // Wait for fonts so dot bounding rect is correct
      const fontReady =
        typeof document !== "undefined" && document.fonts?.ready
          ? document.fonts.ready
          : Promise.resolve();
      fontReady.then(() => {
        computeAndAnimate();
      });

      // Recompute on resize
      const onResize = () => {
        gsap.killTweensOf([ballRef.current, wordmarkRef.current, dotRef.current, taglineRef.current]);
        computeAndAnimate();
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative bg-white text-dark min-h-[88vh] flex flex-col items-center justify-center px-5 md:px-8 pt-32 pb-20 overflow-hidden"
    >
      {/* Rolling ball — absolutely positioned, GSAP-controlled */}
      <div
        ref={ballRef}
        aria-hidden="true"
        className="absolute top-0 left-0 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 32% 30%, #C8364B 0%, #7B1A2C 60%, #5A1220 100%)",
          boxShadow:
            "0 6px 18px rgba(123,26,44,0.40), inset -2px -3px 5px rgba(0,0,0,0.28), inset 2px 3px 5px rgba(255,255,255,0.14)",
        }}
      />

      <div className="relative flex flex-col items-center text-center">
        <h1
          ref={wordmarkRef}
          className="text-[18vw] md:text-[14vw] lg:text-[12vw] leading-[0.9] tracking-[-0.04em] font-extrabold font-[family-name:var(--font-heading)]"
          style={{ opacity: 0 }}
        >
          {t("wordmark")}
          {/* The "period" is a controlled circle (not a glyph) so its visual
              size matches the rolling ball exactly during the handoff. */}
          <span
            ref={dotRef}
            aria-hidden="true"
            className="inline-block rounded-full bg-primary"
            style={{
              width: "0.18em",
              height: "0.18em",
              marginLeft: "0.04em",
              verticalAlign: "baseline",
              opacity: 0,
            }}
          />
        </h1>
        <p
          ref={taglineRef}
          className="mt-6 md:mt-8 text-primary uppercase tracking-[0.22em] text-xs md:text-sm font-[family-name:var(--font-heading)]"
          style={{ opacity: 0 }}
        >
          {t("tagline")}
        </p>
      </div>
    </section>
  );
}
