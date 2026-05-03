"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "@/lib/gsap-register";

const WORDS = ["ROLL ON.", "ROLL UP."] as const;

// TODO[USER-TUNE]: 調整節奏到你滿意為止 — 這四個常數決定整段動畫的「個性」
//   typeMs       打字時每字元間隔，越小越急促（codigo 約 80–120）
//   deleteMs     刪除時每字元間隔，通常比 typeMs 快一倍，刪比寫快才像真人
//   holdMs       字打完後停留時間，給觀眾讀完再刪 — 太短會讓人焦慮、太長會悶
//   lineDelayMs  第二、第三排相對第一排的延遲，做出 codigo 那種「殘影瀑布」
const TIMING = {
  typeMs: 95,
  deleteMs: 55,
  holdMs: 1500,
  lineDelayMs: 220,
};

type Phase = "hold" | "delete" | "type";

function useTypewriterCycle(words: readonly string[], startDelay: number) {
  const [text, setText] = useState(words[0]);

  useEffect(() => {
    // Respect prefers-reduced-motion — 不啟動循環，停在 useState 初始值（words[0]）
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wordIndex = 0;
    let charIndex = words[0].length;
    let phase: Phase = "hold";

    const schedule = (ms: number) => {
      timer = setTimeout(tick, ms);
    };

    const tick = () => {
      if (cancelled) return;

      if (phase === "hold") {
        phase = "delete";
        schedule(TIMING.holdMs);
        return;
      }

      if (phase === "delete") {
        const current = words[wordIndex];
        charIndex = Math.max(0, charIndex - 1);
        setText(current.slice(0, charIndex));
        if (charIndex === 0) {
          wordIndex = (wordIndex + 1) % words.length;
          phase = "type";
        }
        schedule(TIMING.deleteMs);
        return;
      }

      // phase === "type"
      const next = words[wordIndex];
      charIndex = Math.min(next.length, charIndex + 1);
      setText(next.slice(0, charIndex));
      if (charIndex === next.length) {
        phase = "hold";
      }
      schedule(TIMING.typeMs);
    };

    schedule(startDelay);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [words, startDelay]);

  return text;
}

function TypewriterLine({
  className,
  startDelay,
}: {
  className: string;
  startDelay: number;
}) {
  const text = useTypewriterCycle(WORDS, startDelay);
  //   = NBSP，避免空字串時整排塌陷讓 baseline 跳動
  return (
    <div className={className} aria-hidden="true">
      {text || " "}
    </div>
  );
}

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

  return (
    <section
      ref={sectionRef}
      className="bg-primary text-cream py-24 md:py-32 px-5 md:px-8 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <div className="font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)] leading-[0.9] select-none whitespace-nowrap text-[14vw] md:text-[10vw] lg:text-[9vw]">
          {/* SR-only 真實品牌字，給螢幕閱讀器與 SEO */}
          <span className="sr-only">{t("stackedWordmark")}</span>

          <TypewriterLine
            className="about-stack-line text-cream"
            startDelay={0}
          />
          <TypewriterLine
            className="about-stack-line text-cream/45"
            startDelay={TIMING.lineDelayMs}
          />
          <TypewriterLine
            className="about-stack-line text-cream/20"
            startDelay={TIMING.lineDelayMs * 2}
          />
        </div>

        <div className="flex flex-col">
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
