"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "@/lib/gsap-register";

const PHRASES = ["ROLL ON.", "ROLL UP."] as const;
const TYPE_MS = 90;
const DELETE_MS = 55;
const HOLD_MS = 1400;

export default function AboutRollUpSpirit() {
  const t = useTranslations("AboutPage.rollUpSpirit");
  const sectionRef = useRef<HTMLElement | null>(null);
  const [text, setText] = useState("");
  const [caretOn, setCaretOn] = useState(true);

  // Typewriter loop: type → hold → delete → next phrase
  useEffect(() => {
    let phraseIdx = 0;
    let charIdx = 0;
    let mode: "typing" | "holding" | "deleting" = "typing";
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const target = PHRASES[phraseIdx];
      if (mode === "typing") {
        charIdx += 1;
        setText(target.slice(0, charIdx));
        if (charIdx >= target.length) {
          mode = "holding";
          timer = setTimeout(tick, HOLD_MS);
          return;
        }
        timer = setTimeout(tick, TYPE_MS);
      } else if (mode === "holding") {
        mode = "deleting";
        timer = setTimeout(tick, DELETE_MS);
      } else {
        charIdx -= 1;
        setText(target.slice(0, charIdx));
        if (charIdx <= 0) {
          phraseIdx = (phraseIdx + 1) % PHRASES.length;
          mode = "typing";
          timer = setTimeout(tick, TYPE_MS * 3);
          return;
        }
        timer = setTimeout(tick, DELETE_MS);
      }
    };

    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, []);

  // Blinking caret
  useEffect(() => {
    const id = setInterval(() => setCaretOn((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  // Right-side title/body fade in on scroll
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (!sectionRef.current) return;
      gsap.from(".about-spirit-text", {
        opacity: 0,
        x: 30,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
          once: true,
        },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="bg-cream text-dark py-24 md:py-32 px-5 md:px-8 overflow-hidden"
    >
      <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <div
          className="font-extrabold tracking-[-0.04em] font-[family-name:var(--font-heading)] leading-[0.9] select-none whitespace-nowrap text-[14vw] md:text-[10vw] lg:text-[9vw] text-dark"
          aria-live="polite"
        >
          <span>{text}</span>
          <span
            aria-hidden="true"
            className="inline-block align-baseline ml-[0.05em] text-primary"
            style={{ opacity: caretOn ? 1 : 0, transition: "opacity 60ms linear" }}
          >
            |
          </span>
        </div>

        <div className="flex flex-col">
          <h2 className="about-spirit-text text-3xl md:text-5xl font-extrabold text-primary leading-tight tracking-[-0.04em] font-[family-name:var(--font-heading)]">
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
