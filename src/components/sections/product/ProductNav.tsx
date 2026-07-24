"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import NovaLogo from "@/components/brand/NovaLogo";
import LanguageSwitch from "@/components/ui/LanguageSwitch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// NOVA 產品著陸頁專屬頂部列（與全站漢堡 Navbar 不同）：
// 左 NOVA logo → /product、by ROLL ON → 企業官網；右側為公開用戶 auth 與語言切換。
// 捲動超過 8px 時切成霧白玻璃背景；黑色 Hero 上的初始狀態使用白色識別。
export default function ProductNav() {
  const t = useTranslations("Product.nav");
  const locale = useLocale() as Locale;
  const rollOnHref = pathForLocale("/", locale);
  const productHref = pathForLocale("/product", locale);
  const loginHref = pathForLocale("/login", locale);
  const signupHref = pathForLocale("/signup", locale);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 z-50 w-full transition-colors duration-300 ${
        scrolled
          ? "bg-white/90 backdrop-blur-md border-b border-dark/5 shadow-[0_1px_20px_rgba(0,0,0,0.04)]"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 md:h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href={productHref} aria-label="NOVA" className="inline-flex">
            <NovaLogo
              variant={scrolled ? "black" : "white"}
              priority
              sizes="(min-width: 768px) 150px, 124px"
              className="h-auto w-[124px] md:w-[150px]"
            />
          </a>
          <a
            href={rollOnHref}
            className={`hidden border-l pl-3 text-[9px] font-semibold uppercase tracking-[0.18em] transition-colors sm:block ${
              scrolled
                ? "border-dark/15 text-dark/40 hover:text-dark/70"
                : "border-white/20 text-white/45 hover:text-white/80"
            }`}
          >
            {t("byline")}
          </a>
        </div>

        <div className="flex items-center gap-3 md:gap-5">
          <div className="hidden sm:block">
            <LanguageSwitch
              variant={scrolled ? "dark" : "light"}
              brand="nova"
            />
          </div>
          <a
            href={loginHref}
            className={`text-sm font-medium transition-colors duration-300 font-[family-name:var(--font-heading)] ${
              scrolled
                ? "text-dark/70 hover:text-primary"
                : "text-white/70 hover:text-white"
            }`}
          >
            {t("login")}
          </a>
          <a
            href={signupHref}
            className={`inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-300 md:px-6 md:py-2.5 font-[family-name:var(--font-heading)] ${
              scrolled
                ? "bg-primary text-white hover:bg-primary/80"
                : "bg-white text-primary hover:bg-accent"
            }`}
          >
            {t("signup")}
          </a>
        </div>
      </div>
      <span
        aria-hidden="true"
        className={`nova-metal-line pointer-events-none absolute inset-x-0 bottom-0 h-px transition-opacity duration-300 ${
          scrolled ? "opacity-30" : "opacity-65"
        }`}
      />
    </header>
  );
}
