"use client";

import { useTranslations } from "next-intl";
import ScrollReveal from "@/components/ui/ScrollReveal";

export default function Footer() {
  const t = useTranslations("Footer");

  return (
    <footer id="contact" className="bg-[#2b1326] text-white min-h-[50vh] flex items-end justify-center ">
      <div className="w-full max-w-5xl mx-auto px-8 flex flex-col" style={{ gap: '4rem' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
          {/* Left: Brand Info */}
          <ScrollReveal direction="left">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold mb-6 font-[family-name:var(--font-heading)]">
                ROLL ON.
              </h2>
              <div className="space-y-2 text-white/60 text-sm">
                <p>info@roll-on.com</p>
                <p>+886 2-XXXX-XXXX</p>
              </div>
            </div>
          </ScrollReveal>

          {/* Right: Contact Form */}
          <ScrollReveal direction="right">
            <div>
              <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-10 font-[family-name:var(--font-heading)]">
                {t("contactUs")}
              </h3>
              <form
                className="space-y-8"
                onSubmit={(e) => {
                  e.preventDefault();
                }}
              >
                <div className="group relative">
                  <input
                    type="text"
                    placeholder={t("name")}
                    required
                    className="w-full bg-transparent border-b border-white/20 pb-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/80 transition-all duration-500 font-[family-name:var(--font-heading)]"
                  />
                  <div className="absolute bottom-0 left-0 h-px w-0 bg-white group-focus-within:w-full transition-all duration-500" />
                </div>
                <div className="group relative">
                  <input
                    type="email"
                    placeholder={t("email")}
                    required
                    className="w-full bg-transparent border-b border-white/20 pb-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/80 transition-all duration-500 font-[family-name:var(--font-heading)]"
                  />
                  <div className="absolute bottom-0 left-0 h-px w-0 bg-white group-focus-within:w-full transition-all duration-500" />
                </div>
                <div className="group relative">
                  <textarea
                    placeholder={t("message")}
                    rows={3}
                    required
                    className="w-full bg-transparent border-b border-white/20 pb-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/80 transition-all duration-500 resize-none font-[family-name:var(--font-heading)]"
                  />
                  <div className="absolute bottom-0 left-0 h-px w-0 bg-white group-focus-within:w-full transition-all duration-500" />
                </div>
                <div className="pt-2">
                  <button
                    type="submit"
                    className="group/btn relative overflow-hidden border border-white/30 text-white text-xs uppercase tracking-[0.25em] py-4 px-10 font-[family-name:var(--font-heading)] transition-all duration-500 hover:border-white/60 hover:tracking-[0.35em]"
                  >
                    <span className="relative z-10 transition-colors duration-500 group-hover/btn:text-[#2b1326]">
                      {t("send")}
                    </span>
                    <div className="absolute inset-0 bg-white translate-y-full group-hover/btn:translate-y-0 transition-transform duration-500 ease-out" />
                  </button>
                </div>
              </form>
            </div>
          </ScrollReveal>
        </div>

        {/* Copyright */}
        <div className="mt-16 pt-8 border-t border-white/10 text-center text-white/40 text-sm">
          <p>{t("copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
