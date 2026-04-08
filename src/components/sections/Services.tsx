"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

const services = [
  { key: "fundraising", descKey: "fundraisingDesc" },
  { key: "globalExpansion", descKey: "globalExpansionDesc" },
  { key: "marketing", descKey: "marketingDesc" },
  { key: "legalSupport", descKey: "legalSupportDesc" },
  { key: "salesChannel", descKey: "salesChannelDesc" },
  { key: "community", descKey: "communityDesc" },
] as const;

export default function Services() {
  const t = useTranslations("Services");

  return (
    <section id="services" className="bg-primary min-h-screen flex items-center justify-center">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-16">
        {/* Title */}
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        {/* Content: Services Grid + Investor Access */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-12">
          {/* Services Grid - Left */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6 sm:gap-x-6 sm:gap-y-8 md:gap-x-10 md:gap-y-10 flex-1">
            {services.map((service, i) => (
              <ScrollReveal key={service.key} delay={i * 0.1}>
                <div className="cursor-pointer">
                  {/* White circle */}
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white mb-4" />
                  <h3 className="font-bold text-sm md:text-base text-white mb-1 font-[family-name:var(--font-heading)]">
                    {t(service.key)}
                  </h3>
                  <p className="text-xs md:text-sm text-white/60 font-[family-name:var(--font-chinese)]">
                    {t(service.descKey)}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          {/* Investor Access Card - Right */}
          <ScrollReveal delay={0.6}>
            <a
              href="mailto:Vivian.lee@roll-grp.com"
              className="border border-white rounded-lg p-8 md:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-500 group md:w-56 md:self-stretch h-full hover:bg-white/5"
            >
              <h3 className="text-lg md:text-xl font-bold text-white mb-6 font-[family-name:var(--font-heading)] tracking-wide">
                {t("investorAccess")}
              </h3>
              <svg
                className="w-8 h-8 text-white group-hover:translate-x-1 group-hover:translate-y-1 transition-transform duration-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 7l10 10M17 17H9m8 0V9"
                />
              </svg>
            </a>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
