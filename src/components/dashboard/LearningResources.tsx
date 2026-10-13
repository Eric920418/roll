"use client";
import { useLocale } from "next-intl";
import type { WorkspaceKind } from "@/lib/action-plan/workspace";

const videos: Partial<Record<WorkspaceKind, { platform: "YouTube" | "TED"; href: string }>> = {
  interview: { platform: "YouTube", href: "https://www.youtube.com/watch?v=z1iF1c8w5Lg" },
  pilot: { platform: "YouTube", href: "https://www.youtube.com/watch?v=w7g08dVTwaE" },
  positioning: { platform: "TED", href: "https://www.ted.com/talks/simon_sinek_how_great_leaders_inspire_action" },
};

export default function LearningResources({ question, kind }: { question: string; kind: WorkspaceKind | null }) {
  const zh = useLocale() === "zh-tw";
  const video = kind ? videos[kind] : undefined;
  return <section className="rounded-xl bg-dark/[0.035] p-4" aria-label={zh ? "學習資源" : "Learning resources"}>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-dark/55">{zh ? "學習資源" : "Learning resources"}</p>
    <h4 className="mt-2 text-sm font-bold">{question}</h4>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {video ? <a href={video.href} target="_blank" rel="noopener noreferrer" aria-label={`${question} · ${video.platform} · ${zh ? "觀看影片（在新分頁開啟）" : "Watch video (opens in a new tab)"}`} className="block min-h-11 rounded-lg border border-dark/10 bg-white p-3 transition-colors hover:border-dark/40 focus-visible:outline-2 focus-visible:outline-offset-2"><p className="text-sm font-semibold">{video.platform}</p><p className="mt-1 text-xs text-dark/65">{zh ? "觀看影片" : "Watch video"} ↗</p></a> : <div className="rounded-lg border border-dark/10 bg-white p-3"><p className="text-sm font-semibold">YouTube</p><p className="mt-1 text-xs text-dark/55">{zh ? "學習資源待補上" : "Resources coming soon"}</p></div>}
      <div className="rounded-lg border border-dark/10 bg-white p-3"><p className="text-sm font-semibold">Spotify</p><p className="mt-1 text-xs text-dark/55">{zh ? "學習資源待補上" : "Resources coming soon"}</p></div>
    </div>
  </section>;
}
