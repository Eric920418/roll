"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import ScrollReveal from "@/components/ui/ScrollReveal";

const projects = [
  {
    name: "Medix LLC",
    description: "The safety goods company",
    image: "/images/medix.jpg",
    bgColor: "#FFFFFF",
    textColor: "#7B1A2C",
    descColor: "#4A4A4A",
  },
  {
    name: "Solo automatic",
    description: "COLLECTION OF LUXURY CARS",
    image: "/images/solo.jpg",
    bgColor: "#3A3A3A",
    textColor: "#FFFFFF",
    descColor: "rgba(255,255,255,0.6)",
  },
];

export default function Work() {
  const t = useTranslations("Work");

  return (
    <section id="work" className="bg-primary min-h-[70vh] flex items-center justify-center py-24 md:py-32">
      <div className="w-full max-w-5xl mx-auto px-8 flex flex-col" style={{ gap: '4rem' }}>
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {projects.map((project, i) => (
            <ScrollReveal
              key={project.name}
              delay={i * 0.2}
              direction={i === 0 ? "left" : "right"}
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.3 }}
                className="group cursor-pointer overflow-hidden rounded-sm flex flex-col h-full"
                style={{ backgroundColor: project.bgColor }}
              >
                <div className="px-8 pt-8">
                  <h3
                    className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)]"
                    style={{ color: project.textColor }}
                  >
                    {project.name}
                  </h3>
                </div>

                <div className="flex-1 flex items-center justify-center px-8 py-6 min-h-[200px] md:min-h-[280px]">
                  <img
                    src={project.image}
                    alt={project.name}
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>

                <div className="px-8 pb-8">
                  <p
                    className="text-sm font-[family-name:var(--font-heading)] uppercase tracking-wider"
                    style={{ color: project.descColor }}
                  >
                    {project.description}
                  </p>
                </div>
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
