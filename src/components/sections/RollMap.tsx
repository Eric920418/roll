"use client";

import { useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { gsap } from "@/lib/gsap-register";
import CounterAnimation from "@/components/ui/CounterAnimation";
import World from "@svg-maps/world";

const mapData = [
  { key: "america", value: 26 },
  { key: "canada", value: 27 },
  { key: "africa", value: 12 },
  { key: "vietnam", value: 13 },
  { key: "turkey", value: 24 },
  { key: "taiwan", value: 100 },
  { key: "japan", value: 41 },
  { key: "cambodia", value: 3 },
] as const;

const comparisonData = {
  global: { value: 1200, suffix: "+" },
  taiwan: { value: 380, suffix: "+" },
};

const topCompanies = [
  { rank: 1, name: "TechVenture Inc.", valuation: "$4.2B" },
  { rank: 2, name: "NovaPharma", valuation: "$3.8B" },
  { rank: 3, name: "AeroLogix", valuation: "$2.9B" },
  { rank: 4, name: "FinBridge Capital", valuation: "$2.1B" },
  { rank: 5, name: "DataStream AI", valuation: "$1.7B" },
  { rank: 6, name: "Medix LLC", valuation: "$1.2B", isClient: true },
  { rank: 7, name: "Solo Automatic", valuation: "$980M", isClient: true },
];

export default function RollMap() {
  const t = useTranslations("RollMap");
  const sectionRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);
  const [page2Active, setPage2Active] = useState(false);
  const [page3Active, setPage3Active] = useState(false);
  const [page3ClientsActive, setPage3ClientsActive] = useState(false);
  const page2Triggered = useRef(false);
  const page3Triggered = useRef(false);

  useEffect(() => {
    if (!sectionRef.current) return;

    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      // Title reveal
      if (titleRef.current) {
        gsap.from(titleRef.current, {
          y: 80,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: titleRef.current,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
      }

      // Grid items staggered reveal
      if (gridRef.current) {
        const items = gridRef.current.querySelectorAll(".map-item");
        gsap.from(items, {
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 80%",
            toggleActions: "play none none none",
          },
        });
      }

      // Pin + 3-page crossfade
      if (page1Ref.current && page2Ref.current && page3Ref.current) {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: isMobile ? "+=250%" : "+=400%",
            pin: true,
            scrub: 0.8,
          },
        });

        // === Page 1 → Page 2 ===
        tl.to(page1Ref.current, {
          opacity: 0,
          y: -60,
          duration: 0.4,
          ease: "none",
        });

        tl.to({}, { duration: 0.1 });

        tl.fromTo(
          page2Ref.current,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "none",
            onUpdate: function () {
              if (this.progress() >= 0.15 && !page2Triggered.current) {
                page2Triggered.current = true;
                setPage2Active(true);
              }
            },
          },
        );

        // Hold Page 2
        tl.to({}, { duration: 0.3 });

        // === Page 2 → Page 3 ===
        tl.to(page2Ref.current, {
          opacity: 0,
          y: -60,
          duration: 0.4,
          ease: "none",
        });

        tl.to({}, { duration: 0.1 });

        tl.fromTo(
          page3Ref.current,
          { opacity: 0, y: 60 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            ease: "none",
            onUpdate: function () {
              if (this.progress() >= 0.15 && !page3Triggered.current) {
                page3Triggered.current = true;
                setPage3Active(true);
                setTimeout(() => setPage3ClientsActive(true), 1200);
              }
            },
          },
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen bg-white flex items-center justify-center overflow-hidden"
    >
      {/* Background: stays fixed */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 600'%3E%3Cellipse cx='300' cy='250' rx='200' ry='150' fill='%237B1A2C' opacity='0.3'/%3E%3Cellipse cx='700' cy='200' rx='250' ry='180' fill='%237B1A2C' opacity='0.2'/%3E%3Cellipse cx='950' cy='300' rx='150' ry='120' fill='%237B1A2C' opacity='0.25'/%3E%3C/svg%3E")`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </div>

      {/* Page 1: Title + Map Data Grid */}
      <div
        ref={page1Ref}
        className="absolute inset-0 flex flex-col items-center justify-center px-8 md:px-16 lg:px-24 z-10"
      >
        <h2
          ref={titleRef}
          className="text-center text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-dark tracking-tight mb-10 md:mb-20 font-[family-name:var(--font-heading)]"
        >
          {t("title")}
        </h2>

        <div
          ref={gridRef}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 max-w-4xl mx-auto"
        >
          {mapData.map((item) => (
            <div key={item.key} className="map-item text-center">
              <p className="text-sm md:text-base font-medium text-dark/60 mb-2 font-[family-name:var(--font-heading)]">
                {t(item.key)}
              </p>
              <CounterAnimation
                end={item.value}
                className="text-3xl md:text-4xl font-bold text-dark font-[family-name:var(--font-heading)]"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Page 2: Comparison */}
      <div
        ref={page2Ref}
        className="absolute inset-0 flex flex-col items-center justify-center px-8 md:px-16 lg:px-24 z-10 opacity-0"
      >
        {/* Real world map background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.05] pointer-events-none">
          <svg
            viewBox={World.viewBox}
            className="w-[90%] h-[90%] max-w-5xl"
            preserveAspectRatio="xMidYMid meet"
            fill="#7B1A2C"
          >
            {World.locations.map(
              (location: { id: string; path: string; name: string }) => (
                <path key={location.id} d={location.path} />
              ),
            )}
          </svg>
        </div>

        <div className="w-full max-w-4xl mx-auto relative z-10">
          <h3 className="text-lg md:text-xl font-medium text-dark/70 mb-8 md:mb-16 font-[family-name:var(--font-heading)]">
            {t("comparisonTitle")}
          </h3>

          <div className="h-32 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-4">
            <div className="comparison-item flex-1 text-center md:text-right md:pr-20">
              <CounterAnimation
                end={comparisonData.global.value}
                suffix={comparisonData.global.suffix}
                start={page2Active}
                className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-primary font-[family-name:var(--font-heading)]"
              />
              <p className="mt-6 text-sm md:text-base text-dark/60 font-[family-name:var(--font-body)]">
                {t("globalLabel")}
              </p>
            </div>

            <div className="hidden md:block w-[1px] h-16 bg-dark/30" />
            <div className="block md:hidden h-px w-24 bg-dark/20" />

            <div className="comparison-item flex-1 text-center md:text-left md:pl-20">
              <CounterAnimation
                end={comparisonData.taiwan.value}
                suffix={comparisonData.taiwan.suffix}
                start={page2Active}
                className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#2D3A8C] font-[family-name:var(--font-heading)]"
              />
              <p className="mt-6 text-sm md:text-base text-dark/60 font-[family-name:var(--font-body)]">
                {t("taiwanLabel")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Page 3: Company Ranking */}
      <div
        ref={page3Ref}
        className="absolute inset-0 flex flex-col items-center justify-center px-8 md:px-16 lg:px-24 z-10 opacity-0"
      >
        <div className="w-full max-w-2xl mx-auto">

          {/* Header bar */}
          <div
            className="flex items-center justify-between mb-12"
            style={{
              opacity: page3Active ? 1 : 0,
              transform: page3Active ? "none" : "translateY(10px)",
              transition: "opacity 0.6s cubic-bezier(0.33,1,0.68,1), transform 0.6s cubic-bezier(0.33,1,0.68,1)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-[3px] h-5 bg-primary" />
              <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-primary font-[family-name:var(--font-heading)]">
                {t("rankingTitle")}
              </span>
            </div>
            <div className="flex items-center gap-8">
              <span className="text-[9px] font-medium tracking-[0.18em] uppercase text-dark/[0.28] font-[family-name:var(--font-heading)]">
                {t("company")}
              </span>
              <span className="text-[9px] font-medium tracking-[0.18em] uppercase text-dark/[0.28] font-[family-name:var(--font-heading)]">
                {t("valuation")}
              </span>
            </div>
          </div>

          {/* Ruled header line */}
          <div
            style={{
              height: "1px",
              opacity: page3Active ? 1 : 0,
              background: "linear-gradient(90deg, var(--color-primary) 0%, rgba(26,26,26,0.12) 100%)",
              transition: "opacity 0.5s ease 0.05s",
            }}
          />

          {/* Ranks 1–5 */}
          {topCompanies
            .filter((c) => !c.isClient)
            .map((company, i) => (
              <div
                key={company.rank}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.8rem 1fr auto",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(26,26,26,0.055)",
                  padding: "0.85rem 0",
                  opacity: page3Active ? 1 : 0,
                  transform: page3Active ? "none" : "translateY(14px)",
                  transition: `opacity 0.5s cubic-bezier(0.33,1,0.68,1) ${0.1 + i * 0.085}s, transform 0.5s cubic-bezier(0.33,1,0.68,1) ${0.1 + i * 0.085}s`,
                }}
              >
                <span
                  className="font-[family-name:var(--font-heading)] select-none tabular-nums"
                  style={{
                    fontSize: "clamp(0.65rem, 1.1vw, 0.72rem)",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: i === 0 ? "rgba(212,165,116,0.85)" : "rgba(26,26,26,0.2)",
                    lineHeight: 1,
                  }}
                >
                  {String(company.rank).padStart(2, "0")}
                </span>
                <span
                  className="font-[family-name:var(--font-heading)] pl-2"
                  style={{
                    fontSize: "clamp(0.82rem, 1.4vw, 0.96rem)",
                    fontWeight: i === 0 ? 600 : 500,
                    letterSpacing: "-0.01em",
                    color: i === 0 ? "rgba(26,26,26,0.88)" : "rgba(26,26,26,0.52)",
                  }}
                >
                  {company.name}
                </span>
                <span
                  className="font-[family-name:var(--font-heading)] tabular-nums"
                  style={{
                    fontSize: "clamp(0.75rem, 1.15vw, 0.84rem)",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    color: i === 0 ? "rgba(26,26,26,0.55)" : "rgba(26,26,26,0.25)",
                  }}
                >
                  {company.valuation}
                </span>
              </div>
            ))}

          {/* Reveal separator with diamond */}
          <div
            style={{
              position: "relative",
              margin: "1.6rem 0 1.4rem",
              opacity: page3ClientsActive ? 1 : 0,
              transition: "opacity 0.7s ease 0s",
            }}
          >
            <div
              style={{
                height: "1px",
                background: "linear-gradient(90deg, transparent 0%, rgba(123,26,44,0.35) 40%, rgba(123,26,44,0.35) 60%, transparent 100%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) rotate(45deg)",
                width: "5px",
                height: "5px",
                background: "var(--color-primary)",
                opacity: page3ClientsActive ? 1 : 0,
                transition: "opacity 0.4s ease 0.3s",
              }}
            />
          </div>

          {/* Ranks 6–7: OUR CLIENT */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            {topCompanies
              .filter((c) => c.isClient)
              .map((company, i) => (
                <div
                  key={company.rank}
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "2.8rem 1fr auto",
                    alignItems: "center",
                    padding: "1rem 1.1rem 1rem 1rem",
                    borderRadius: "6px",
                    overflow: "hidden",
                    opacity: page3ClientsActive ? 1 : 0,
                    transform: page3ClientsActive ? "none" : "translateY(18px) scale(0.985)",
                    transition: `opacity 0.75s cubic-bezier(0.22,1,0.36,1) ${0.4 + i * 0.18}s, transform 0.75s cubic-bezier(0.22,1,0.36,1) ${0.4 + i * 0.18}s`,
                  }}
                >
                  {/* Deep background */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(118deg, #6B1626 0%, #4E0F1B 55%, #3D0C15 100%)",
                      borderRadius: "6px",
                    }}
                  />
                  {/* Left accent stripe */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{
                      background: "linear-gradient(180deg, var(--color-accent) 0%, rgba(212,165,116,0.4) 100%)",
                      borderRadius: "6px 0 0 6px",
                    }}
                  />
                  {/* Top shimmer edge */}
                  <div
                    className="absolute top-0 right-0 h-px"
                    style={{
                      left: "3px",
                      background: "linear-gradient(90deg, rgba(212,165,116,0.5) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)",
                    }}
                  />

                  <span
                    className="relative z-10 font-[family-name:var(--font-heading)] select-none tabular-nums"
                    style={{
                      fontSize: "clamp(0.65rem, 1.1vw, 0.72rem)",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      color: "rgba(212,165,116,0.55)",
                      lineHeight: 1,
                    }}
                  >
                    {String(company.rank).padStart(2, "0")}
                  </span>

                  <div className="relative z-10 flex items-center gap-2.5 pl-2">
                    <span
                      className="font-[family-name:var(--font-heading)]"
                      style={{
                        fontSize: "clamp(0.85rem, 1.45vw, 1rem)",
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        color: "rgba(255,255,255,0.93)",
                      }}
                    >
                      {company.name}
                    </span>
                    <span
                      className="font-[family-name:var(--font-heading)]"
                      style={{
                        fontSize: "8px",
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--color-accent)",
                        border: "1px solid rgba(212,165,116,0.38)",
                        background: "rgba(212,165,116,0.08)",
                        padding: "3px 7px",
                        borderRadius: "3px",
                        whiteSpace: "nowrap",
                        lineHeight: "1.4",
                      }}
                    >
                      {t("ourClient")}
                    </span>
                  </div>

                  <span
                    className="relative z-10 font-[family-name:var(--font-heading)] tabular-nums"
                    style={{
                      fontSize: "clamp(0.78rem, 1.2vw, 0.88rem)",
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      color: "rgba(255,255,255,0.72)",
                    }}
                  >
                    {company.valuation}
                  </span>
                </div>
              ))}
          </div>

          {/* Footer note */}
          <div
            className="flex items-center justify-end gap-2"
            style={{
              marginTop: "1.4rem",
              opacity: page3ClientsActive ? 1 : 0,
              transition: "opacity 0.5s ease 0.8s",
            }}
          >
            <div className="w-4 h-px bg-dark/[0.18]" />
            <span
              className="font-[family-name:var(--font-heading)]"
              style={{
                fontSize: "9px",
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(26,26,26,0.25)",
              }}
            >
              {t("byValuation")} · {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
