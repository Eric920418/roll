import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { pick } from "@/lib/quiz/locale";
import type { Locale } from "@/i18n/routing";

export type VideoView = {
  href: string;
  thumb: string;
  title: unknown; // Prisma Json 雙語
  views: string;
};

// ROLL ON 教學影片卡（取自 Video model 第一支；縮圖為 Vercel Blob URL）。
export default async function TutorialVideoCard({
  locale,
  video,
}: {
  locale: Locale;
  video: VideoView | null;
}) {
  const t = await getTranslations({ locale, namespace: "Dashboard.home.video" });

  if (!video) {
    return (
      <div className="nova-dashboard-card flex h-full flex-col rounded-2xl border border-dark/10 bg-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary font-[family-name:var(--font-heading)]">
          {t("eyebrow")}
        </p>
        <p className="mt-3 flex-1 text-sm text-dark/60">{t("empty")}</p>
      </div>
    );
  }

  const title = pick(video.title, locale);

  return (
    <a
      href={video.href}
      target="_blank"
      rel="noopener noreferrer"
      className="nova-dashboard-card group flex h-full flex-col overflow-hidden rounded-2xl border border-dark/10 bg-white"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-dark/5">
        <Image
          src={video.thumb}
          alt={title}
          fill
          sizes="(max-width: 1024px) 100vw, 400px"
          className="object-cover transition-transform group-hover:scale-[1.03]"
        />
        <span className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white backdrop-blur-sm font-[family-name:var(--font-heading)]">
          {t("eyebrow")}
        </span>
        {/* 播放鍵 */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg transition-transform group-hover:scale-105">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="line-clamp-2 flex-1 text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
          {title}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-dark/50">{video.views}</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:text-primary-dark font-[family-name:var(--font-heading)]">
            {t("watch")}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </a>
  );
}
