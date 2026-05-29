import Image from "next/image";
import { getLocale } from "next-intl/server";
import ScrollReveal from "@/components/ui/ScrollReveal";
import { getVideos, getSetting } from "@/lib/cms/content";
import { pick } from "@/lib/cms/i18n";
import type { Locale } from "@/i18n/routing";

export default async function GoldenTicket() {
  const locale = (await getLocale()) as Locale;
  const [videos, gt] = await Promise.all([getVideos(), getSetting("goldenTicket")]);

  const channelTitle = (gt.channelTitle as string) || "GOLDEN TICKET";
  const subscribeUrl =
    (gt.subscribeUrl as string) || "https://www.youtube.com/@GOLDENTICKET-rollon";
  const avatar = (gt.avatar as string) || "/rollon-avatar.png";
  const clubImage = (gt.clubImage as string) || "/asia-founders-club.png";

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
                    src={avatar}
                    alt="ROLL ON"
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </div>
                <h3 className="text-white text-2xl md:text-3xl font-black tracking-tight font-[family-name:var(--font-heading)]">
                  {channelTitle}
                </h3>
              </div>

              <a
                href={subscribeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start bg-black text-white text-sm font-medium px-4 py-1.5 rounded-full hover:bg-neutral-800 transition-colors"
              >
                訂閱
              </a>

              {/* Video thumbnails row */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {videos.map((video) => {
                  const title = pick(video.title, locale);
                  return (
                    <a
                      key={video.id}
                      href={video.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-2 group"
                    >
                      <div className="relative aspect-[9/13] rounded-xl overflow-hidden bg-gradient-to-b from-neutral-600 via-neutral-800 to-black transition-transform group-hover:scale-[1.02]">
                        <Image
                          src={video.thumb}
                          alt={title}
                          fill
                          sizes="(max-width: 768px) 33vw, 150px"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-start gap-1">
                          <p className="text-white text-[11px] leading-snug line-clamp-2 flex-1 group-hover:text-white/90">
                            {title}
                          </p>
                          <span
                            aria-hidden="true"
                            className="text-white/60 text-base leading-none shrink-0 -mt-0.5"
                          >
                            ⋮
                          </span>
                        </div>
                        <p className="text-white/60 text-[10px]">
                          觀看次數：{video.views}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" className="flex-1 flex justify-center">
            <Image
              src={clubImage}
              alt="Asia Founders Club"
              width={800}
              height={800}
              sizes="(max-width: 768px) 256px, 320px"
              className="w-64 md:w-80 h-auto object-contain"
            />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
