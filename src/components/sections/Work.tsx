"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import ScrollReveal from "@/components/ui/ScrollReveal";

const caseItems = [
  {
    image: "/IMG_0418.JPG",
    description:
      "Since our trip in January, things have been moving fast. We've been seeing strong traction across the APJ region in our minimally invasive surgery segment.",
  },
  {
    image: "/IMG_0419.JPG",
    description:
      "Chase met with more than 10 investors and expanded our reach into 3 different countries. One question we constantly asked: how well do we map to local demand?",
  },
  {
    image: "/IMG_0420.JPG",
    description:
      "Today Medix is truly pushing milestones. We have officially entered the Vietnam market — this step not only solidifies our presence in another key region but also opens more paths forward.",
  },
];

export default function Work() {
  const t = useTranslations("Work");
  const [expanded, setExpanded] = useState(true);

  return (
    <section
      id="work"
      className="bg-primary min-h-[70vh] flex items-center justify-center py-12 md:py-16"
    >
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-10">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={0.1}>
          <div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-between pb-3 border-b border-white/30 hover:border-white/60 transition-colors"
              aria-expanded={expanded}
              aria-controls="medix-case-items"
            >
              <h3 className="text-xl md:text-2xl font-semibold text-white font-[family-name:var(--font-heading)]">
                Medix LLC
              </h3>
              <span
                aria-hidden="true"
                className={`text-white text-2xl leading-none transition-transform duration-300 ${
                  expanded ? "rotate-45" : ""
                }`}
              >
                +
              </span>
            </button>

            <div
              id="medix-case-items"
              className={`grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 overflow-hidden transition-[max-height,opacity] duration-500 ease-out ${
                expanded
                  ? "opacity-100 max-h-[1400px]"
                  : "opacity-0 max-h-0 mt-0"
              }`}
            >
              {caseItems.map((item, i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="aspect-[3/4] relative overflow-hidden rounded-sm bg-white/10">
                    <img
                      src={item.image}
                      alt={`Medix LLC ${i + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <p className="text-xs md:text-sm text-white/70 leading-relaxed">
                    {item.description}{" "}
                    <Link
                      href="/cases/medix"
                      className="text-white underline underline-offset-2 hover:text-white/90"
                    >
                      learn more
                    </Link>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
