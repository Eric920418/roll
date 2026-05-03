"use client";

import { useRef, useEffect } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { gsap, ScrollTrigger } from "@/lib/gsap-register";
import World from "@svg-maps/world";

interface MapLocation {
  id: string;
  name: string;
  path: string;
}

import taiwanRaw from "@svg-maps/taiwan";
const taiwan = taiwanRaw as unknown as {
  viewBox: string;
  locations: MapLocation[];
};

// Taipei City center (in @svg-maps/taiwan coordinate system)
const TAIPEI = { cx: 882, cy: 381 };

// Offshore islands to exclude from detailed Taiwan map
const EXCLUDED = ["kinmen-county", "lienchiang-county"];

// === World map coordinate system: viewBox 0 0 1010 666 ===
// Positions derived from actual SVG country data + geographic projection

// Taiwan center on world map
const TW_WORLD = { x: 811, y: 395 };

// City positions (geographic accuracy verified against SVG country data)
const BRIDGE_CITIES = [
  {
    nameKey: "tokyo",
    x: 855,
    y: 358,
    cpx: 845,
    cpy: 368,
    labelDx: 14,
    labelDy: 4,
    anchor: "start" as const,
  },
  {
    nameKey: "seoul",
    x: 830,
    y: 353,
    cpx: 808,
    cpy: 366,
    labelDx: 0,
    labelDy: -14,
    anchor: "middle" as const,
  },
  {
    nameKey: "shanghai",
    x: 812,
    y: 372,
    cpx: 799,
    cpy: 380,
    labelDx: -14,
    labelDy: 3,
    anchor: "end" as const,
  },
  {
    nameKey: "singapore",
    x: 770,
    y: 462,
    cpx: 802,
    cpy: 436,
    labelDx: 0,
    labelDy: 18,
    anchor: "middle" as const,
  },
  {
    nameKey: "hoChiMinh",
    x: 778,
    y: 440,
    cpx: 800,
    cpy: 424,
    labelDx: 14,
    labelDy: 5,
    anchor: "start" as const,
  },
  {
    nameKey: "bangkok",
    x: 762,
    y: 428,
    cpx: 794,
    cpy: 418,
    labelDx: -14,
    labelDy: 4,
    anchor: "end" as const,
  },
];

// Manifesto line keys — revealed one by one on scroll
const MANIFESTO_KEYS = ["line1", "line2", "line3", "line4", "line5"] as const;

export default function TaiwanMap() {
  const tAbout = useTranslations("About");
  const tMap = useTranslations("TaiwanMap");
  const sectionRef = useRef<HTMLElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const taiwanRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const worldMapRef = useRef<HTMLDivElement>(null);
  const manifestoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sectionRef.current || !mapContainerRef.current) return;

    const isMobile = window.innerWidth < 768;

    const ctx = gsap.context(() => {
      const bridgeLines =
        sectionRef.current!.querySelectorAll(".bridge-line");
      const cityMarkers =
        sectionRef.current!.querySelectorAll(".city-marker");
      const manifestoLines =
        sectionRef.current!.querySelectorAll(".manifesto-line");

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: isMobile ? "+=4000" : "+=7000",
          pin: true,
          scrub: 1,
        },
      });

      const introLine1 = sectionRef.current!.querySelector(".intro-line-1");
      const introLine2 = sectionRef.current!.querySelector(".intro-line-2");

      // Phase 0: Intro text — "Ideas are everywhere..."
      tl.fromTo(
        introLine1,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }
      )
        .fromTo(
          introLine2,
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
          "-=0.2"
        )
        // Hold intro text
        .to({}, { duration: 0.8 })
        // Fade out intro
        .to(introRef.current, {
          opacity: 0,
          duration: 0.5,
          ease: "power2.in",
        })

      // Phase 1: Taiwan zoom in (1.5-2.5x bigger than before, slightly above center)
      .fromTo(
        taiwanRef.current,
        { scale: 0.4, opacity: 0, y: -40 },
        { scale: 2, opacity: 1, y: -60, duration: 1.2, ease: "power2.inOut" }
      )
        // "Roll on" label at Taipei
        .fromTo(
          labelRef.current,
          { opacity: 0, scale: 0.5 },
          { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" },
          "-=0.3"
        )
        // Pause
        .to({}, { duration: 0.6 })

        // Phase 2: Zoom OUT — Taiwan shrinks to its world-map dot, world map fades in
        .to(taiwanRef.current, {
          scale: 0.12,
          opacity: 0,
          y: 0,
          duration: 1.4,
          ease: "power2.inOut",
        })
        .to(labelRef.current, { opacity: 0, duration: 0.3 }, "<")
        .to(
          worldMapRef.current,
          { opacity: 1, duration: 1, ease: "power1.in" },
          "<+0.2"
        )

        // Phase 3: Bridges radiate from Taiwan on world map
        .fromTo(
          bridgeLines,
          { strokeDashoffset: 500, opacity: 0.5 },
          {
            strokeDashoffset: 0,
            opacity: 0.9,
            duration: 1.4,
            stagger: 0.1,
            ease: "power2.out",
          },
          "<+0.5"
        )
        // City markers fade in
        .fromTo(
          cityMarkers,
          { opacity: 0 },
          {
            opacity: 1,
            duration: 0.6,
            stagger: 0.08,
            ease: "power2.out",
          },
          "<+0.4"
        )
        // Hold so user reads the bridge map
        .to({}, { duration: 0.6 })

        // Phase 3.5: FADE OUT lines & cities, prepare for manifesto
        .to(bridgeLines, {
          opacity: 0,
          duration: 0.7,
          ease: "power2.inOut",
        })
        .to(
          cityMarkers,
          { opacity: 0, duration: 0.6, ease: "power2.inOut" },
          "<"
        )
        // World map dims down for text legibility
        .to(
          worldMapRef.current,
          { opacity: 0.25, duration: 0.6, ease: "power2.inOut" },
          "<"
        )

        // Phase 4: Manifesto — line by line emerges over the dimmed map
        .to(manifestoRef.current, { opacity: 1, duration: 0.3 }, "-=0.3")
        .fromTo(
          manifestoLines,
          { opacity: 0, y: 28 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.5,
            ease: "power2.out",
          },
          "<"
        );
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const locations = taiwan.locations.filter(
    (loc) => !EXCLUDED.includes(loc.id)
  );

  return (
    <section
      ref={sectionRef}
      className="relative h-screen bg-primary overflow-hidden"
    >
      <div
        ref={mapContainerRef}
        className="absolute inset-0 flex items-center justify-center"
      >
        {/* Intro text — appears before Taiwan map */}
        <div
          ref={introRef}
          className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
        >
          <div className="text-center px-6">
            <p
              className="intro-line-1 opacity-0 text-white/90 text-2xl md:text-4xl lg:text-5xl font-bold tracking-wide leading-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tMap("introLine1")}
            </p>
            <p
              className="intro-line-2 opacity-0 text-white/70 text-lg md:text-2xl lg:text-3xl mt-4 md:mt-6 tracking-wide"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              {tMap("introLine2")}
            </p>
          </div>
        </div>

        {/* World map + bridges + cities — single SVG for coordinate alignment */}
        <div
          ref={worldMapRef}
          className="absolute inset-0 flex items-center justify-center opacity-0"
        >
          <svg
            viewBox={(World as unknown as { viewBox: string }).viewBox}
            className="w-[95%] h-[90%] max-w-7xl"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Country outlines */}
            {(
              World as unknown as { locations: MapLocation[] }
            ).locations.map((loc) => (
              <path
                key={loc.id}
                d={loc.path}
                fill="white"
                fillOpacity={loc.id === "tw" ? 0.15 : 0.04}
                stroke="white"
                strokeOpacity={loc.id === "tw" ? 0.2 : 0.06}
                strokeWidth={loc.id === "tw" ? 0.5 : 0.3}
              />
            ))}

            {/* Taiwan pulsing dot on world map */}
            <circle
              cx={TW_WORLD.x}
              cy={TW_WORLD.y}
              r="3"
              fill="#C8364B"
            />
            <circle
              cx={TW_WORLD.x}
              cy={TW_WORLD.y}
              r="6"
              fill="#C8364B"
              fillOpacity="0.3"
            >
              <animate
                attributeName="r"
                values="6;10;6"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="fill-opacity"
                values="0.3;0.1;0.3"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>

            {/* Bridge lines — curves from Taiwan to each city */}
            {BRIDGE_CITIES.map((city) => (
              <path
                key={city.nameKey}
                className="bridge-line"
                d={`M${TW_WORLD.x},${TW_WORLD.y} Q${city.cpx},${city.cpy} ${city.x},${city.y}`}
                fill="none"
                stroke="white"
                strokeWidth="0.8"
                strokeDasharray="500"
                strokeDashoffset="500"
                opacity="0.5"
              />
            ))}

            {/* City markers with labels */}
            {BRIDGE_CITIES.map((city) => (
              <g
                key={`m-${city.nameKey}`}
                className="city-marker"
                opacity="0"
              >
                {/* Outer glow */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r="5"
                  fill="white"
                  fillOpacity="0.1"
                />
                {/* Dot */}
                <circle
                  cx={city.x}
                  cy={city.y}
                  r="2"
                  fill="white"
                  fillOpacity="0.9"
                />
                {/* City name */}
                <text
                  x={city.x + city.labelDx}
                  y={city.y + city.labelDy}
                  textAnchor={city.anchor}
                  fill="white"
                  fillOpacity="0.7"
                  fontSize="7"
                  fontWeight="500"
                  letterSpacing="0.06em"
                  style={{ fontFamily: "var(--font-heading)" }}
                >
                  {tMap(city.nameKey)}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Taiwan detailed SVG + label wrapper — label positioned relative to SVG */}
        <div ref={taiwanRef} className="relative z-10" style={{ transformOrigin: "center center" }}>
          <svg
            viewBox="270 310 732 980"
            className="w-48 md:w-64 lg:w-80 h-auto"
          >
            {locations.map((loc) => (
              <path
                key={loc.id}
                d={loc.path}
                fill="white"
                fillOpacity={loc.id === "taipei-city" ? 0.25 : 0.1}
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            ))}
            {/* Taipei ground pulse halo */}
            <circle
              cx={TAIPEI.cx}
              cy={TAIPEI.cy}
              r="20"
              fill="#C8364B"
              fillOpacity="0.3"
            >
              <animate
                attributeName="r"
                values="20;32;20"
                dur="2s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="fill-opacity"
                values="0.3;0.1;0.3"
                dur="2s"
                repeatCount="indefinite"
              />
            </circle>
            {/* Taipei location pin — Material "place" icon, tip anchored at TAIPEI */}
            <g
              transform={`translate(${TAIPEI.cx - 24} ${TAIPEI.cy - 44}) scale(2)`}
              style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))" }}
            >
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                fill="#C8364B"
                stroke="white"
                strokeWidth="0.8"
              />
            </g>
          </svg>

          {/* Roll on label — positioned relative to SVG coordinate system */}
          {/* Taipei is at (882,381) in viewBox "270 310 732 980" */}
          {/* left: (882-270)/732 ≈ 83.6%, top: (381-310)/980 ≈ 7.2% */}
          <div
            ref={labelRef}
            className="absolute opacity-0 w-36 md:w-48 lg:w-56"
            style={{
              top: "7.2%",
              left: "83.6%",
              transform: "translate(-100%, -50%)",
            }}
          >
            <Image
              src="/horizontal.png"
              alt="ROLL ON."
              width={1341}
              height={245}
              priority
              className="w-full h-auto object-contain"
            />
          </div>
        </div>

        {/* Manifesto text — line by line reveal */}
        <div
          ref={manifestoRef}
          className="absolute inset-0 flex items-center justify-center z-30 opacity-0 pointer-events-none"
        >
          <div className="text-center px-6 max-w-2xl">
            {MANIFESTO_KEYS.map((key) => {
              const line = tAbout(key);
              return (
                <p
                  key={key}
                  className="manifesto-line opacity-0 text-white/90 text-base md:text-lg lg:text-xl leading-relaxed mb-3 font-[family-name:var(--font-chinese)]"
                  style={{
                    fontWeight: line.startsWith("ROLL ON") ? 700 : 400,
                    letterSpacing: line.startsWith("ROLL ON")
                      ? "0.05em"
                      : "0.02em",
                  }}
                >
                  {line}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
