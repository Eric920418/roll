"use client";
import { useLocale } from "next-intl";

export default function LearningResources({ question }: { question: string }) {
  const zh = useLocale() === "zh-tw";
  return <section className="rounded-xl bg-dark/[0.035] p-4" aria-label={zh ? "學習資源" : "Learning resources"}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-dark/55">{zh ? "學習資源" : "Learning resources"}</p>
    <h4 className="mt-2 text-sm font-bold">{question}</h4>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{["YouTube", "Spotify"].map(platform => <div key={platform} className="rounded-lg border border-dark/10 bg-white p-3"><p className="text-sm font-semibold">{platform}</p><p className="mt-1 text-xs text-dark/55">{zh ? "學習資源待補上" : "Resources coming soon"}</p></div>)}</div>
  </section>;
}
