"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

const events = [
  {
    date: "Fri. 24 APR",
    image: null,
    title: "Title1",
    address:
      "Address/Address/Address/Address/Address/Address/Address",
  },
  {
    date: "Fri. 24 APR",
    image: null,
    title: "Title1",
    address:
      "Address/Address/Address/Address/Address/Address/Address",
  },
  {
    date: "Fri. 24 APR",
    image: null,
    title: "Title1",
    address:
      "Address/Address/Address/Address/Address/Address/Address",
  },
];

export default function Events() {
  const t = useTranslations("Events");

  return (
    <section
      id="events"
      className="bg-primary flex items-center justify-center py-12 md:py-16"
    >
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-10">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {events.map((event, i) => (
            <ScrollReveal key={i} delay={i * 0.1}>
              <div className="flex flex-col gap-3">
                <div className="relative aspect-square rounded-2xl overflow-hidden bg-white/20">
                  <span className="absolute top-4 left-4 bg-black text-white text-[11px] font-medium px-3 py-1.5 rounded-full z-10">
                    {event.date}
                  </span>
                  {event.image && (
                    <img
                      src={event.image}
                      alt={event.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                </div>
                <h3 className="text-white text-lg md:text-xl font-semibold font-[family-name:var(--font-heading)]">
                  {event.title}
                </h3>
                <p className="text-white/55 text-[11px] leading-relaxed break-all">
                  {event.address}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
