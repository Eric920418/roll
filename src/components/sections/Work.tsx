"use client";

import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import ScrollReveal from "@/components/ui/ScrollReveal";

const projects = [
  {
    name: "Medix LLC",
    image: "/Medix-1.png",
    bgColor: "#FFFFFF",
    textColor: "#7B1A2C",
    descColor: "#4A4A4A",
  },
];

export default function Work() {
  const t = useTranslations("Work");

  return (
    <section id="work" className="bg-primary min-h-[70vh] flex items-center justify-center py-24 md:py-32">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-16">
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
                <div className="px-5 pt-5 md:px-8 md:pt-8">
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

           
              </motion.div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
