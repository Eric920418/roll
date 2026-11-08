"use client";

import Image from "next/image";
import Link from "next/link";
import { MEETING_URL, meetingLabel } from "@/lib/public-contact";
import { REPORT_PAGE } from "@/lib/reports/catalog";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { useTranslations, useLocale } from "next-intl";
import NovaLogo from "@/components/brand/NovaLogo";
import ScrollReveal from "@/components/ui/ScrollReveal";

export type ContactInfo = {
  email: string;
  address: string;
  instagram: string;
  linkedin: string;
};

export default function FooterClient({
  contact,
  brand = "rollon",
}: {
  contact: ContactInfo;
  brand?: "rollon" | "nova";
}) {
  const t = useTranslations("Footer");
  const Reveal = brand === "nova" ? "div" : ScrollReveal;
  const locale = useLocale();

  return (
    <footer
      id="contact"
      data-brand={brand}
      className={`min-h-[50vh] overflow-hidden text-white flex items-end justify-center ${
        brand === "nova" ? "bg-primary" : "bg-[#2b1326]"
      }`}
    >
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col pt-12 ">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 md:gap-24">
          {/* Left: Brand Info */}
          <Reveal {...(brand === "nova" ? {} : {direction: "left" as const})} className="h-full">
            <div className="h-full flex flex-col justify-between gap-8">
              <div>
                <div className="mb-6">
                  {brand === "nova" ? (
                    <div>
                      <NovaLogo
                        variant="white"
                        className="h-auto w-[220px] md:w-[260px]"
                        sizes="(min-width: 768px) 260px, 220px"
                      />
                      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
                        by ROLL ON
                      </p>
                    </div>
                  ) : (
                    <Image
                      src="/horizontal.png"
                      alt="ROLL ON."
                      width={240}
                      height={60}
                      className="h-10 md:h-14 w-auto"
                    />
                  )}
                </div>
                <div className="space-y-2 text-white/40 text-sm">
                  {contact.email && <p>{contact.email}</p>}
                  {contact.address && <p>{contact.address}</p>}
                </div>
              </div>
              <div className="flex items-center gap-4">
                {contact.instagram && (
                  <a
                    href={contact.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram"
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <Image
                      src="/IG.png"
                      alt="Instagram"
                      width={28}
                      height={28}
                      className="w-7 h-7 object-contain"
                    />
                  </a>
                )}
                {contact.linkedin && (
                  <a
                    href={contact.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="LinkedIn"
                    className="opacity-70 hover:opacity-100 transition-opacity"
                  >
                    <Image
                      src="/Linkedin.png"
                      alt="LinkedIn"
                      width={28}
                      height={28}
                      className="w-7 h-7 object-contain"
                    />
                  </a>
                )}
              </div>
            </div>
          </Reveal>

          {/* Right: Contact Form */}
          <Reveal {...(brand === "nova" ? {} : {direction: "right" as const})}>
            <div>
              <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-10 font-[family-name:var(--font-heading)]">
                {meetingLabel(locale)}
              </h3>
              <a href={MEETING_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded border border-white/60 px-5 py-3 text-sm font-semibold">{meetingLabel(locale)} ↗</a>
            </div>
          </Reveal>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 bg-[#4a101d] p-5 text-sm text-[#ead6ad]"><Link className="inline-flex min-h-11 items-center underline underline-offset-4" href={pathForLocale(REPORT_PAGE, locale as Locale)}>{locale === "zh-tw" ? "下載 2026 第四季台灣市場進入報告" : "Download our Q4 2026 Taiwan Market Report"} →</Link><span className="text-xs text-white">From visions to big impacts</span></div>
        {/* Copyright */}
        <div className="mt-8 pt-6 md:mt-16 md:pt-8 border-t border-white/10 text-center text-white/40 text-sm">
          <p>{t("copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
