"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

const videos = [
  {
    thumb: "/1.png",
    subtitleZh: "商機出來",
    subtitleEn: "opportunities",
    title: "不能忽視創新紮根？把模式帶進傳統市場才是…",
    views: "312 次",
  },
  {
    thumb: "/2.png",
    subtitleZh: "沒有很好的",
    subtitleEn: "they are not very good at",
    title: "要賣出去會更重要？創成式比地的關鍵就是…",
    views: "5 次",
  },
  {
    thumb: "/3.png",
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
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col gap-4 md:gap-8">
        <div className="flex flex-col md:flex-row items-center gap-8 sm:gap-12 md:gap-16">
          {/* YouTube channel preview */}
          <ScrollReveal direction="left" className="flex-1 w-full">
            <div className="w-full max-w-md flex flex-col gap-4">
              {/* Channel header */}
              <div className="flex items-center gap-3">
                <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 bg-white">
                  <Image
                    src="/Asia Founders Club.png"
                    alt="Golden Ticket"
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
                <h3 className="text-white text-2xl md:text-3xl font-black tracking-tight font-[family-name:var(--font-heading)]">
                  GOLDEN TICKET
                </h3>
              </div>

              <a
                href="https://www.youtube.com/@GOLDENTICKET-rollon"
                target="_blank"
                rel="noopener noreferrer"
                className="self-start bg-black text-white text-sm font-medium px-4 py-1.5 rounded-full hover:bg-neutral-800 transition-colors"
              >
                訂閱
              </a>

              {/* Video thumbnails row */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {videos.map((video, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="relative aspect-[9/13] rounded-xl overflow-hidden bg-gradient-to-b from-neutral-600 via-neutral-800 to-black">
                      <Image
                        src={video.thumb}
                        alt={video.title}
                        fill
                        sizes="(max-width: 768px) 33vw, 150px"
                        className="object-cover"
                      />
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

          <ScrollReveal direction="right" className="flex-1 flex justify-center">
            <Image
              src="/Asia Founders Club.png"
              alt="Asia Founders Club"
              width={800}
              height={800}
              className="w-64 md:w-80 h-auto object-contain"
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
