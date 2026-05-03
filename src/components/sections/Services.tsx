import Image from "next/image";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

const services = [
  {
    key: "fundraising",
    descKey: "fundraisingDesc",
    slug: "fundraising",
    icon: "/1-fundraising.png",
  },
  {
    key: "globalExpansion",
    descKey: "globalExpansionDesc",
    slug: "market-entry",
    icon: "/2-global expansion.png",
  },
  {
    key: "marketing",
    descKey: "marketingDesc",
    slug: "marketing",
    icon: "/3-Marketing.png",
  },
  {
    key: "legalSupport",
    descKey: "legalSupportDesc",
    slug: "legal",
    icon: "/4-legal support.png",
  },
  {
    key: "salesChannel",
    descKey: "salesChannelDesc",
    slug: "sales-channel",
    icon: "/5-sales channel development.png",
  },
  {
    key: "community",
    descKey: "communityDesc",
    slug: "investor-access",
    icon: "/6-all nighter community.png",
  },
] as const;

export default async function Services() {
  const t = await getTranslations("Services");
  const locale = (await getLocale()) as Locale;

  return (
    <section id="services" className="bg-primary flex items-center justify-center py-12 md:py-16">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-4 md:gap-8">
        {/* Title */}
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.04em] font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        {/* Content: Services Grid + Investor Access */}
        <div className="flex flex-col md:flex-row gap-6 md:gap-12">
          {/* Services Grid - Left */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-6 sm:gap-x-6 sm:gap-y-8 md:gap-x-10 md:gap-y-10 flex-1">
            {services.map((service, i) => (
              <ScrollReveal key={service.key} delay={i * 0.1}>
                <Link
                  href={pathForLocale(`/services/${service.slug}`, locale)}
                  className="block cursor-pointer group"
                >
                  {/* Icon badge — white circle 內嵌 service icon */}
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white mb-4 transition-transform duration-300 group-hover:scale-110 overflow-hidden flex items-center justify-center">
                    <Image
                      src={service.icon}
                      alt=""
                      width={48}
                      height={48}
                      aria-hidden="true"
                      className="w-3/4 h-3/4 object-contain select-none"
                    />
                  </div>
                  <h3 className="font-bold text-sm md:text-base text-white mb-1 font-[family-name:var(--font-heading)] group-hover:text-accent transition-colors">
                    {t(service.key)}
                  </h3>
                  <p className="text-xs md:text-sm text-white/60 font-[family-name:var(--font-chinese)]">
                    {t(service.descKey)}
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>

          {/* Investor Access Card - Right */}
          <ScrollReveal delay={0.6}>
            <Link
              href={pathForLocale("/services/investor-access", locale)}
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
            </Link>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
