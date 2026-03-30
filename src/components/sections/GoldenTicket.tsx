"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

export default function GoldenTicket() {
  const t = useTranslations("GoldenTicket");

  return (
    <section className="bg-primary min-h-[70vh] flex items-center justify-center py-24 md:py-32">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-16">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <div className="flex flex-col md:flex-row items-center gap-8 sm:gap-12 md:gap-16">
          {/* Video Player */}
          <ScrollReveal direction="left" className="flex-1 w-full">
            <div className="relative aspect-video bg-dark rounded-2xl overflow-hidden flex items-center justify-center cursor-pointer group max-w-md">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent" />
              {/* Play button */}
              <div className="relative w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center group-hover:bg-white/30 transition-all duration-300">
                <svg
                  className="w-6 h-6 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </ScrollReveal>

          {/* Signature */}
          <ScrollReveal direction="right" className="flex-1 flex justify-center">
            <svg
              viewBox="0 0 200 150"
              className="w-48 md:w-64 h-auto text-white/80"
            >
              {/* Stylized signature path */}
              <path
                d="M30,120 C40,80 60,40 80,50 C100,60 70,100 90,90 C110,80 100,40 120,50 C140,60 130,100 150,80 C160,70 170,60 180,70"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
