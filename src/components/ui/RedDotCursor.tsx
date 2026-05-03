"use client";

import { useEffect, useRef, useState } from "react";

const HOVER_SELECTOR =
  'a, button, input, textarea, select, summary, [role="button"], [role="link"], label[for], [data-cursor-hover]';

// Returns true if the given color string parses as a "dark" surface (red/black/dark).
// Uses simple luminance threshold on the rgba components.
function isDarkBg(color: string): boolean {
  if (!color || color === "transparent" || color === "rgba(0, 0, 0, 0)") return false;
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return false;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = parts;
  if (a < 0.4) return false;
  // Perceptual luminance (Rec. 709)
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.5;
}

function nearestOpaqueBg(target: Element | null): string {
  let el: Element | null = target;
  while (el && el !== document.body) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== "transparent" && !c.startsWith("rgba(0, 0, 0, 0)")) {
      return c;
    }
    el = el.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor;
}

export default function RedDotCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const targetX = useRef(0);
  const targetY = useRef(0);
  const currentX = useRef(0);
  const currentY = useRef(0);
  const [enabled, setEnabled] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [onDark, setOnDark] = useState(false);

  useEffect(() => {
    // Disable on touch devices
    if (typeof window === "undefined") return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    if (!fine) return;
    setEnabled(true);

    document.documentElement.classList.add("custom-cursor-active");

    const onMove = (e: MouseEvent) => {
      targetX.current = e.clientX;
      targetY.current = e.clientY;

      // Detect hover on interactive elements
      const target = e.target as Element | null;
      const isHover = !!target?.closest(HOVER_SELECTOR);
      setHovering(isHover);

      // Detect dark background under cursor
      const stack = document.elementsFromPoint(e.clientX, e.clientY);
      // Skip the cursor's own elements
      const under = stack.find(
        (el) => el !== dotRef.current && el !== ringRef.current,
      );
      const bg = nearestOpaqueBg(under ?? null);
      setOnDark(isDarkBg(bg));
    };

    const onLeave = () => {
      if (dotRef.current) dotRef.current.style.opacity = "0";
      if (ringRef.current) ringRef.current.style.opacity = "0";
    };
    const onEnter = () => {
      if (dotRef.current) dotRef.current.style.opacity = "1";
      if (ringRef.current) ringRef.current.style.opacity = "1";
    };

    const tick = () => {
      // Easing — dot follows tightly, ring lags slightly
      currentX.current += (targetX.current - currentX.current) * 0.35;
      currentY.current += (targetY.current - currentY.current) * 0.35;
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${targetX.current}px, ${targetY.current}px, 0) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${currentX.current}px, ${currentY.current}px, 0) translate(-50%, -50%)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.documentElement.classList.remove("custom-cursor-active");
    };
  }, []);

  if (!enabled) return null;

  // Color: white on dark backgrounds, primary red on light backgrounds
  const color = onDark ? "#ffffff" : "var(--color-primary)";
  const dotSize = hovering ? 20 : 10;
  const ringSize = hovering ? 56 : 36;

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden="true"
        className="fixed top-0 left-0 z-[9999] pointer-events-none rounded-full"
        style={{
          width: ringSize,
          height: ringSize,
          border: `1.5px solid ${color}`,
          opacity: 0.45,
          transition:
            "width 0.22s cubic-bezier(0.22,1,0.36,1), height 0.22s cubic-bezier(0.22,1,0.36,1), border-color 0.18s ease",
          willChange: "transform",
          mixBlendMode: "normal",
        }}
      />
      <div
        ref={dotRef}
        aria-hidden="true"
        className="fixed top-0 left-0 z-[9999] pointer-events-none rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          background: color,
          transition:
            "width 0.22s cubic-bezier(0.22,1,0.36,1), height 0.22s cubic-bezier(0.22,1,0.36,1), background 0.18s ease",
          willChange: "transform",
        }}
      />
    </>
  );
}
