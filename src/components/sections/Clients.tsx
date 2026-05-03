import Image from "next/image";
import { getTranslations } from "next-intl/server";
import ScrollReveal from "@/components/ui/ScrollReveal";

const clients = [
  { name: "Max", logo: "/Max.png" },
  { name: "Solo automatic", logo: "/solo.png" },
  { name: "INSPO", logo: "/inspo.png" },
  { name: "Medix", logo: "/Medix.png" },
  { name: "R.co", logo: "/R.co.png" },
  // { name: "Solo Automotive", logo: "/solo.png" },
  { name: "Teotihuacan", logo: "/Teotihuacan.png" },
];

export default async function Clients() {
  const t = await getTranslations("Clients");

  return (
    <section className="bg-primary flex items-center justify-center py-8 md:py-10">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-4 md:gap-8">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white tracking-[-0.04em] font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <div className="flex flex-wrap items-center gap-6 sm:gap-10 md:gap-14">
          {clients.map((client, i) => (
            <ScrollReveal key={client.name} delay={i * 0.1}>
              <div className="relative w-28 h-20 md:w-36 md:h-24">
                <Image
                  src={client.logo}
                  alt={client.name}
                  fill
                  sizes="(max-width: 768px) 112px, 144px"
                  className="object-contain brightness-0 invert opacity-100"
                />
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
