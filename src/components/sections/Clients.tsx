"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

const clients = [
  { name: "INSPO", logo: "/inspo.png" },
  { name: "Medix", logo: "/Medix.png" },
  { name: "R.co", logo: "/R.co.png" },
  // { name: "Solo Automotive", logo: "/solo.png" },
  { name: "Teotihuacan", logo: "/Teotihuacan.png" },
];

export default function Clients() {
  const t = useTranslations("Clients");

  return (
    <section className="bg-primary min-h-[70vh] flex items-center justify-center py-24 md:py-32">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-16">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <div className="flex flex-wrap items-center gap-6 sm:gap-10 md:gap-14">
          {clients.map((client, i) => (
            <ScrollReveal key={client.name} delay={i * 0.1}>
              <div className="w-28 h-20 md:w-36 md:h-24 flex items-center justify-center">
                <img
                  src={client.logo}
                  alt={client.name}
                  className="max-w-full max-h-full object-contain brightness-0 invert opacity-70 hover:opacity-100 transition-opacity duration-300"
                />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
