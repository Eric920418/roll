"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";
import { gsap } from "@/lib/gsap-register";
import LanguageSwitch from "@/components/ui/LanguageSwitch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

interface StaggeredMenuItem {
  label: string;
  ariaLabel: string;
  link: string;
}

const COLORS = {
  primary: "#7B1A2C",
  primaryLight: "#C8364B",
  primaryDark: "#5A1220",
  accent: "#D4A574",
  dark: "#1A1A1A",
  light: "#F5F5F5",
};

export default function Navbar() {
  const t = useTranslations("Nav");
  const locale = useLocale() as Locale;
  const homePath = pathForLocale("/", locale);

  const items: StaggeredMenuItem[] = [
    { label: t("home"), ariaLabel: t("home"), link: homePath },
    { label: t("service"), ariaLabel: t("service"), link: `${homePath}#services` },
    { label: t("cases"), ariaLabel: t("cases"), link: `${homePath}#work` },
    { label: t("esg"), ariaLabel: t("esg"), link: pathForLocale("/esg", locale) },
    { label: t("contact"), ariaLabel: t("contact"), link: `${homePath}#contact` },
  ];

  const position: "left" | "right" = "right";
  const layerColors = [COLORS.primaryDark, COLORS.primary];
  const accentColor = COLORS.accent;
  const menuButtonColor = "#fff";
  const openMenuButtonColor = COLORS.dark;

  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  const headerRef = useRef<HTMLElement | null>(null);
  const lastScrollY = useRef(0);
  const headerHidden = useRef(false);
  const headerTween = useRef<gsap.core.Tween | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const preLayersRef = useRef<HTMLDivElement | null>(null);
  const preLayerElsRef = useRef<HTMLElement[]>([]);

  const line1Ref = useRef<HTMLSpanElement | null>(null);
  const line2Ref = useRef<HTMLSpanElement | null>(null);
  const line3Ref = useRef<HTMLSpanElement | null>(null);

  const openTlRef = useRef<gsap.core.Timeline | null>(null);
  const closeTweenRef = useRef<gsap.core.Tween | null>(null);
  const spinTweenRef = useRef<gsap.core.Timeline | null>(null);
  const colorTweenRef = useRef<gsap.core.Tween | null>(null);

  const toggleBtnRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef(false);
  const itemEntranceTweenRef = useRef<gsap.core.Tween | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const panel = panelRef.current;
      const preContainer = preLayersRef.current;
      const l1 = line1Ref.current;
      const l2 = line2Ref.current;
      const l3 = line3Ref.current;

      if (!panel || !l1 || !l2 || !l3) return;

      let preLayers: HTMLElement[] = [];
      if (preContainer) {
        preLayers = Array.from(
          preContainer.querySelectorAll(".sm-prelayer")
        ) as HTMLElement[];
      }
      preLayerElsRef.current = preLayers;

      const offscreen = (position as string) === "left" ? -100 : 100;
      gsap.set([panel, ...preLayers], { xPercent: offscreen });

      gsap.set([l1, l2, l3], { transformOrigin: "50% 50%" });

      if (toggleBtnRef.current)
        gsap.set(toggleBtnRef.current, { color: menuButtonColor });
    });
    return () => ctx.revert();
  }, []);

  const buildOpenTimeline = useCallback(() => {
    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return null;

    openTlRef.current?.kill();
    if (closeTweenRef.current) {
      closeTweenRef.current.kill();
      closeTweenRef.current = null;
    }
    itemEntranceTweenRef.current?.kill();

    const itemEls = Array.from(
      panel.querySelectorAll(".sm-panel-itemLabel")
    ) as HTMLElement[];
    const numberEls = Array.from(
      panel.querySelectorAll(".sm-panel-list[data-numbering] .sm-panel-item")
    ) as HTMLElement[];
    const socialTitle = panel.querySelector(
      ".sm-socials-title"
    ) as HTMLElement | null;
    const socialLinks = Array.from(
      panel.querySelectorAll(".sm-socials-link")
    ) as HTMLElement[];
    const langSwitch = panel.querySelector(
      ".sm-lang-switch"
    ) as HTMLElement | null;

    const layerStates = layers.map((el) => ({
      el,
      start: Number(gsap.getProperty(el, "xPercent")),
    }));
    const panelStart = Number(gsap.getProperty(panel, "xPercent"));

    if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });
    if (numberEls.length)
      gsap.set(numberEls, { ["--sm-num-opacity" as string]: 0 });
    if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
    if (socialLinks.length) gsap.set(socialLinks, { y: 25, opacity: 0 });
    if (langSwitch) gsap.set(langSwitch, { opacity: 0, y: 10 });

    const tl = gsap.timeline({ paused: true });

    layerStates.forEach((ls, i) => {
      tl.fromTo(
        ls.el,
        { xPercent: ls.start },
        { xPercent: 0, duration: 0.5, ease: "power4.out" },
        i * 0.07
      );
    });

    const lastTime = layerStates.length
      ? (layerStates.length - 1) * 0.07
      : 0;
    const panelInsertTime = lastTime + (layerStates.length ? 0.08 : 0);
    const panelDuration = 0.65;

    tl.fromTo(
      panel,
      { xPercent: panelStart },
      { xPercent: 0, duration: panelDuration, ease: "power4.out" },
      panelInsertTime
    );

    if (itemEls.length) {
      const itemsStart = panelInsertTime + panelDuration * 0.15;
      tl.to(
        itemEls,
        {
          yPercent: 0,
          rotate: 0,
          duration: 1,
          ease: "power4.out",
          stagger: { each: 0.1, from: "start" },
        },
        itemsStart
      );

      if (numberEls.length) {
        tl.to(
          numberEls,
          {
            duration: 0.6,
            ease: "power2.out",
            ["--sm-num-opacity" as string]: 1,
            stagger: { each: 0.08, from: "start" },
          },
          itemsStart + 0.1
        );
      }
    }

    if (socialTitle || socialLinks.length) {
      const socialsStart = panelInsertTime + panelDuration * 0.4;
      if (socialTitle)
        tl.to(
          socialTitle,
          { opacity: 1, duration: 0.5, ease: "power2.out" },
          socialsStart
        );
      if (socialLinks.length) {
        tl.to(
          socialLinks,
          {
            y: 0,
            opacity: 1,
            duration: 0.55,
            ease: "power3.out",
            stagger: { each: 0.08, from: "start" },
            onComplete: () => { gsap.set(socialLinks, { clearProps: "opacity" }); },
          },
          socialsStart + 0.04
        );
      }
    }

    if (langSwitch) {
      tl.to(
        langSwitch,
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
        panelInsertTime + panelDuration * 0.5
      );
    }

    openTlRef.current = tl;
    return tl;
  }, []);

  const playOpen = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    const tl = buildOpenTimeline();
    if (tl) {
      tl.eventCallback("onComplete", () => {
        busyRef.current = false;
      });
      tl.play(0);
    } else {
      busyRef.current = false;
    }
  }, [buildOpenTimeline]);

  const playClose = useCallback((onDone?: () => void) => {
    openTlRef.current?.kill();
    openTlRef.current = null;
    itemEntranceTweenRef.current?.kill();

    const panel = panelRef.current;
    const layers = preLayerElsRef.current;
    if (!panel) return;

    const all: HTMLElement[] = [...layers, panel];
    closeTweenRef.current?.kill();

    const offscreen = (position as string) === "left" ? -100 : 100;

    closeTweenRef.current = gsap.to(all, {
      xPercent: offscreen,
      duration: 0.4,
      ease: "power3.in",
      overwrite: "auto",
      stagger: { each: 0.04, from: "end" },
      onComplete: () => {
        const itemEls = Array.from(
          panel.querySelectorAll(".sm-panel-itemLabel")
        ) as HTMLElement[];
        if (itemEls.length) gsap.set(itemEls, { yPercent: 140, rotate: 10 });

        const numberEls = Array.from(
          panel.querySelectorAll(
            ".sm-panel-list[data-numbering] .sm-panel-item"
          )
        ) as HTMLElement[];
        if (numberEls.length)
          gsap.set(numberEls, { ["--sm-num-opacity" as string]: 0 });

        const socialTitle = panel.querySelector(
          ".sm-socials-title"
        ) as HTMLElement | null;
        const socialLinks = Array.from(
          panel.querySelectorAll(".sm-socials-link")
        ) as HTMLElement[];
        if (socialTitle) gsap.set(socialTitle, { opacity: 0 });
        if (socialLinks.length)
          gsap.set(socialLinks, { y: 25, opacity: 0 });

        const langSwitch = panel.querySelector(
          ".sm-lang-switch"
        ) as HTMLElement | null;
        if (langSwitch) gsap.set(langSwitch, { opacity: 0, y: 10 });

        busyRef.current = false;
        onDone?.();
      },
    });
  }, []);

  const animateIcon = useCallback((opening: boolean) => {
    const l1 = line1Ref.current;
    const l2 = line2Ref.current;
    const l3 = line3Ref.current;
    if (!l1 || !l2 || !l3) return;

    spinTweenRef.current?.kill();

    if (opening) {
      spinTweenRef.current = gsap
        .timeline({ defaults: { ease: "power4.out", duration: 0.45 } })
        .to(l1, { y: 7, rotate: 45 }, 0)
        .to(l2, { opacity: 0, scaleX: 0, duration: 0.25 }, 0)
        .to(l3, { y: -7, rotate: -45 }, 0);
    } else {
      spinTweenRef.current = gsap
        .timeline({ defaults: { ease: "power3.inOut", duration: 0.35 } })
        .to(l1, { y: 0, rotate: 0 }, 0)
        .to(l2, { opacity: 1, scaleX: 1 }, 0)
        .to(l3, { y: 0, rotate: 0 }, 0);
    }
  }, []);

  const animateColor = useCallback(
    (opening: boolean) => {
      const btn = toggleBtnRef.current;
      if (!btn) return;
      colorTweenRef.current?.kill();
      const targetColor = opening ? openMenuButtonColor : menuButtonColor;
      colorTweenRef.current = gsap.to(btn, {
        color: targetColor,
        delay: opening ? 0.18 : 0,
        duration: opening ? 0.3 : 0.2,
        ease: "power2.out",
      });
    },
    []
  );

  const showHeader = useCallback(() => {
    if (headerHidden.current) {
      headerHidden.current = false;
      headerTween.current?.kill();
      headerTween.current = gsap.to(headerRef.current, {
        yPercent: 0,
        duration: 0.3,
        ease: "power3.out",
      });
    }
  }, []);

  const toggleMenu = useCallback(() => {
    const target = !openRef.current;
    openRef.current = target;

    if (target) {
      showHeader();
      setOpen(true);
      playOpen();
    } else {
      playClose(() => setOpen(false));
    }

    animateIcon(target);
    animateColor(target);
  }, [playOpen, playClose, animateIcon, animateColor, showHeader]);

  const closeMenu = useCallback(() => {
    if (openRef.current) {
      openRef.current = false;
      playClose(() => setOpen(false));
      animateIcon(false);
      animateColor(false);
    }
  }, [playClose, animateIcon, animateColor]);

  // Hide header on scroll down, show on scroll up
  React.useEffect(() => {
    const threshold = 10;

    const handleScroll = () => {
      // Don't hide when menu is open
      if (openRef.current) return;

      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;
      lastScrollY.current = currentY;

      // At the very top, always show
      if (currentY <= 0) {
        if (headerHidden.current) {
          headerHidden.current = false;
          headerTween.current?.kill();
          headerTween.current = gsap.to(headerRef.current, {
            yPercent: 0,
            duration: 0.3,
            ease: "power3.out",
          });
        }
        return;
      }

      if (delta > threshold && !headerHidden.current) {
        // Scrolling down — hide
        headerHidden.current = true;
        headerTween.current?.kill();
        headerTween.current = gsap.to(headerRef.current, {
          yPercent: -100,
          duration: 0.3,
          ease: "power3.in",
        });
      } else if (delta < -threshold && headerHidden.current) {
        // Scrolling up — show
        headerHidden.current = false;
        headerTween.current?.kill();
        headerTween.current = gsap.to(headerRef.current, {
          yPercent: 0,
          duration: 0.3,
          ease: "power3.out",
        });
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open, closeMenu]);

  return (
    <div
      className={`sm-scope fixed top-0 left-0 z-50 w-screen ${
        open ? "h-screen overflow-hidden" : "h-0"
      }`}
      style={{ pointerEvents: open ? "auto" : "none" }}
    >
      <div
        className="staggered-menu-wrapper pointer-events-none relative w-full h-full z-40"
        style={
          { "--sm-accent": accentColor } as React.CSSProperties
        }
        data-position={position}
        data-open={open || undefined}
      >
        {/* Pre-layers */}
        <div
          ref={preLayersRef}
          className="sm-prelayers absolute top-0 right-0 bottom-0 pointer-events-none z-[5]"
          aria-hidden="true"
        >
          {layerColors.map((c, i) => (
            <div
              key={i}
              className="sm-prelayer absolute top-0 right-0 h-full w-full"
              style={{ background: c }}
            />
          ))}
        </div>

        {/* Header with logo + toggle */}
        <header
          ref={headerRef}
          className="fixed top-0 left-0 w-full flex items-center justify-between p-4 pointer-events-none z-20 will-change-transform"
          style={{ backgroundColor: COLORS.primary }}
          aria-label="Main navigation header"
        >
          <div
            className="flex items-center select-none pointer-events-auto"
            aria-label="Logo"
          >
            <a
              href={homePath}
              className="no-underline flex items-center"
              onClick={closeMenu}
            >
              <Image
                src="/horizontal.png"
                alt="ROLL ON."
                width={160}
                height={40}
                className=" h-6 lg:h-8  w-auto"
                priority
              />
            </a>
          </div>

          <button
            ref={toggleBtnRef}
            className="relative w-10 h-10 flex flex-col items-center justify-center gap-[6px] bg-transparent border-0 cursor-pointer pointer-events-auto"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="staggered-menu-panel"
            onClick={toggleMenu}
            type="button"
          >
            <span
              ref={line1Ref}
              className="block w-6 h-[2px] bg-current rounded-full [will-change:transform]"
            />
            <span
              ref={line2Ref}
              className="block w-6 h-[2px] bg-current rounded-full [will-change:transform]"
            />
            <span
              ref={line3Ref}
              className="block w-6 h-[2px] bg-current rounded-full [will-change:transform]"
            />
          </button>
        </header>

        {/* Menu Panel */}
        <aside
          id="staggered-menu-panel"
          ref={panelRef}
          className="absolute top-0 right-0 h-full flex flex-col p-[3.5em_1.5em_1.5em_1.5em] md:p-[6em_2em_2em_2em] overflow-y-auto z-10 pointer-events-auto"
          style={{
            background: COLORS.light,
          }}
          aria-hidden={!open}
        >
          <div className="flex-1 flex flex-col gap-5">
            <ul
              className="sm-panel-list list-none m-0 p-0 flex flex-col gap-6"
              role="list"
              data-numbering={true}
            >
              {items.map((it, idx) => (
                <li
                  className="relative overflow-hidden leading-none"
                  key={it.label + idx}
                >
                  <a
                    className="sm-panel-item relative font-semibold text-[1.8rem] md:text-[2.2rem] lg:text-[2.6rem] cursor-pointer leading-none tracking-[-1.5px] uppercase inline-block no-underline transition-colors duration-150"
                    href={it.link}
                    aria-label={it.ariaLabel}
                    data-index={idx + 1}
                    onClick={closeMenu}
                    style={{ color: COLORS.dark }}
                  >
                    <span className="sm-panel-itemLabel inline-block [transform-origin:50%_100%] will-change-transform">
                      {it.label}
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            {/* Language switch inside panel */}
            <div className="sm-lang-switch mt-auto pt-8 border-t" style={{ borderColor: COLORS.accent + "40" }}>
              <LanguageSwitch variant="dark" />
            </div>
          </div>
        </aside>
      </div>

      <style>{`
.sm-scope .sm-prelayers {
  width: clamp(320px, 50vw, 600px);
}
.sm-scope [data-position='left'] .sm-prelayers {
  right: auto;
  left: 0;
}
.sm-scope #staggered-menu-panel {
  width: clamp(320px, 50vw, 600px);
}
.sm-scope [data-position='left'] #staggered-menu-panel {
  right: auto;
  left: 0;
}
.sm-scope .sm-panel-item:hover {
  color: ${COLORS.accent} !important;
}
.sm-scope .sm-panel-list[data-numbering] {
  counter-reset: smItem;
}
.sm-scope .sm-panel-list[data-numbering] .sm-panel-item::after {
  counter-increment: smItem;
  content: counter(smItem, decimal-leading-zero);
  position: relative;
  top: -1.2em;
  margin-left: 0.3em;
  font-size: 14px;
  font-weight: 400;
  color: ${COLORS.accent};
  letter-spacing: 0;
  pointer-events: none;
  user-select: none;
  opacity: var(--sm-num-opacity, 0);
  vertical-align: super;
}
@media (max-width: 1024px) {
  .sm-scope .sm-prelayers,
  .sm-scope #staggered-menu-panel {
    width: 100%;
    left: 0;
    right: 0;
  }
}
      `}</style>
    </div>
  );
}
