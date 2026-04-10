"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

const videos = [
  {
    subtitleZh: "商機出來",
    subtitleEn: "opportunities",
    title: "不能忽視創新紮根？把模式帶進傳統市場才是…",
    views: "312 次",
  },
  {
    subtitleZh: "沒有很好的",
    subtitleEn: "they are not very good at",
    title: "要賣出去會更重要？創成式比地的關鍵就是…",
    views: "5 次",
  },
  {
    subtitleZh: "在裡面其實",
    subtitleEn: "within it",
    title: "冷門市場才是機會？為什麼越小眾越容易成功",
    views: "5 次",
  },
];

export default function GoldenTicket() {
  const t = useTranslations("GoldenTicket");

  return (
    <section className="bg-primary min-h-[70vh] flex items-center justify-center py-12 md:py-16">
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-8 md:gap-16">
        <ScrollReveal>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white font-[family-name:var(--font-heading)]">
            {t("title")}
          </h2>
        </ScrollReveal>

        <div className="flex flex-col md:flex-row items-center gap-8 sm:gap-12 md:gap-16">
          {/* YouTube channel preview */}
          <ScrollReveal direction="left" className="flex-1 w-full">
            <div className="w-full max-w-md flex flex-col gap-4">
              {/* Channel header */}
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-2xl leading-none font-[family-name:var(--font-heading)]">
                    R.
                  </span>
                </div>
                <h3 className="text-white text-2xl md:text-3xl font-black tracking-tight font-[family-name:var(--font-heading)]">
                  GOLDEN TICKET
                </h3>
              </div>

              {/* Subscribe button */}
              <button
                type="button"
                className="self-start bg-black text-white text-sm font-medium px-4 py-1.5 rounded-full hover:bg-neutral-800 transition-colors"
              >
                訂閱
              </button>

              {/* Video thumbnails row */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {videos.map((video, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    {/* Thumbnail */}
                    <div className="relative aspect-[9/13] rounded-xl overflow-hidden bg-gradient-to-b from-neutral-600 via-neutral-800 to-black">
                      {/* Subtitle overlay */}
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 bg-black/85 px-2 py-1 rounded text-center whitespace-nowrap">
                        <div className="text-white text-[10px] font-semibold leading-tight">
                          {video.subtitleZh}
                        </div>
                        <div className="text-yellow-300 text-[9px] leading-tight mt-0.5">
                          {video.subtitleEn}
                        </div>
                      </div>
                    </div>
                    {/* Title + meta */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-start gap-1">
                        <p className="text-white text-[11px] leading-snug line-clamp-2 flex-1">
                          {video.title}
                        </p>
                        <button
                          type="button"
                          aria-label="更多選項"
                          className="text-white/60 text-base leading-none shrink-0 -mt-0.5"
                        >
                          ⋮
                        </button>
                      </div>
                      <p className="text-white/60 text-[10px]">
                        觀看次數：{video.views}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Signature */}
          <ScrollReveal direction="right" className="flex-1 flex justify-center">
            <svg
              viewBox="0 0 200 150"
              className="w-48 md:w-64 h-auto text-white/80"
            >
              {/* Stylized signature path */}
              <path
                d="M30,120 C40,80 60,40 80,50 C100,60 70,100 90,90 C110,80 100,40 120,50 C140,60 130,100 150,80 C160,70 170,60 180,70"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
