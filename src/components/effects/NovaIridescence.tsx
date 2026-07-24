"use client";

import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";

const DEFAULT_COLOR = [188 / 255, 189 / 255, 198 / 255] as const;

const vertexShader = /* glsl */ `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv * 2.0 - 1.0) * uResolution.xy / mr;
  vec2 pointer = uMouse - vec2(0.5);
  uv += pointer * uAmplitude * 3.2;

  float t = uTime * uSpeed;
  float waveA = sin(uv.x * 3.4 + sin(uv.y * 2.2 - t * 1.8) * 1.35 + t * 1.15);
  float waveB = cos(uv.y * 4.1 - cos(uv.x * 2.7 + t * 1.25) * 1.1 - t * 0.9);
  float waveC = sin((uv.x + uv.y) * 5.2 - t * 2.35);
  float field = clamp(0.5 + waveA * 0.25 + waveB * 0.18 + waveC * 0.11, 0.0, 1.0);

  float chromeBody = mix(0.08, 0.82, smoothstep(0.02, 0.95, field));
  float edgeHighlight = pow(smoothstep(0.62, 0.98, field), 5.0);
  float darkFold = 1.0 - smoothstep(0.18, 0.46, field);

  float sweepPosition = fract(t * 0.28) * 1.5 - 0.25;
  float movingSweep = exp(-pow((vUv.x - sweepPosition) * 11.0, 2.0));
  movingSweep *= 0.55 + 0.45 * sin(vUv.y * 16.0 + t * 2.0);

  vec2 mouseUv = vec2(uMouse.x, 1.0 - uMouse.y);
  float pointerHighlight = exp(-dot(vUv - mouseUv, vUv - mouseUv) * 22.0);

  float luminance = chromeBody - darkFold * 0.13;
  luminance += edgeHighlight * 0.45;
  luminance += movingSweep * 0.68;
  luminance += pointerHighlight * uAmplitude * 2.6;
  luminance = clamp(luminance, 0.035, 1.0);

  vec3 color = mix(vec3(0.0), uColor, smoothstep(0.02, 0.82, luminance));
  color = mix(color, vec3(0.98), smoothstep(0.72, 1.0, luminance));

  gl_FragColor = vec4(color, 1.0);
}
`;

export interface NovaIridescenceProps {
  color?: readonly [number, number, number];
  speed?: number;
  amplitude?: number;
  mouseReact?: boolean;
  className?: string;
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

export default function NovaIridescence({
  color = DEFAULT_COLOR,
  speed = 0.62,
  amplitude = 0.035,
  mouseReact = true,
  className = "",
}: NovaIridescenceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const red = color[0];
  const green = color[1];
  const blue = color[2];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const nav = navigator as NavigatorWithHints;
    const lowPerformance =
      Boolean(nav.connection?.saveData) ||
      (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2);

    if (reducedMotion || lowPerformance) return;

    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    const targetMouse = { x: 0.5, y: 0.5 };
    const renderedMouse = { x: 0.5, y: 0.5 };
    let renderer: Renderer | null = null;
    let program: Program | null = null;
    let frameId = 0;
    let lastFrame = 0;
    let inViewport = true;
    let documentVisible = !document.hidden;
    let destroyed = false;

    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      });

      const gl = renderer.gl;
      const canvas = gl.canvas;
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      gl.clearColor(0, 0, 0, 0);

      const geometry = new Triangle(gl);
      const resolution = new Float32Array([1, 1, 1]);
      const mouse = new Float32Array([0.5, 0.5]);

      program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        transparent: true,
        cullFace: false,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(red, green, blue) },
          uResolution: { value: resolution },
          uMouse: { value: mouse },
          uAmplitude: { value: coarsePointer ? Math.min(amplitude, 0.018) : amplitude },
          uSpeed: { value: speed },
        },
      });

      const mesh = new Mesh(gl, { geometry, program });
      container.appendChild(canvas);

      const resize = () => {
        if (!renderer) return;
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        renderer.setSize(width, height);
        resolution[0] = gl.canvas.width;
        resolution[1] = gl.canvas.height;
        resolution[2] = gl.canvas.width / Math.max(1, gl.canvas.height);
      };

      const frameInterval = coarsePointer ? 1000 / 30 : 1000 / 60;

      const update = (time: number) => {
        frameId = 0;
        if (destroyed || !inViewport || !documentVisible || !renderer || !program) {
          return;
        }

        if (time - lastFrame >= frameInterval) {
          lastFrame = time;
          renderedMouse.x += (targetMouse.x - renderedMouse.x) * 0.075;
          renderedMouse.y += (targetMouse.y - renderedMouse.y) * 0.075;
          mouse[0] = renderedMouse.x;
          mouse[1] = renderedMouse.y;
          program.uniforms.uTime.value = time * 0.001;
          renderer.render({ scene: mesh });
        }

        frameId = requestAnimationFrame(update);
      };

      const syncAnimation = () => {
        const shouldRun = !destroyed && inViewport && documentVisible;
        if (shouldRun && frameId === 0) {
          frameId = requestAnimationFrame(update);
        } else if (!shouldRun && frameId !== 0) {
          cancelAnimationFrame(frameId);
          frameId = 0;
        }
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!mouseReact || coarsePointer) return;
        const rect = container.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          return;
        }
        targetMouse.x = (event.clientX - rect.left) / Math.max(1, rect.width);
        targetMouse.y = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      };

      const handleVisibility = () => {
        documentVisible = !document.hidden;
        syncAnimation();
      };

      const handleContextLost = (event: Event) => {
        event.preventDefault();
        inViewport = false;
        syncAnimation();
      };

      const resizeObserver =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(resize);
      resizeObserver?.observe(container);
      window.addEventListener("resize", resize, { passive: true });
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("visibilitychange", handleVisibility);
      canvas.addEventListener("webglcontextlost", handleContextLost);

      const intersectionObserver =
        typeof IntersectionObserver === "undefined"
          ? null
          : new IntersectionObserver(
              ([entry]) => {
                inViewport = entry.isIntersecting;
                syncAnimation();
              },
              { rootMargin: "80px" },
            );
      intersectionObserver?.observe(container);

      resize();
      syncAnimation();

      return () => {
        destroyed = true;
        if (frameId !== 0) cancelAnimationFrame(frameId);
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("visibilitychange", handleVisibility);
        canvas.removeEventListener("webglcontextlost", handleContextLost);
        geometry.remove();
        program?.remove();
        if (canvas.parentNode === container) container.removeChild(canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch {
      return;
    }
  }, [amplitude, blue, green, mouseReact, red, speed]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`h-full w-full pointer-events-none ${className}`}
    />
  );
}
