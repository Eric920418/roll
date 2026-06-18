"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import LanguageSwitch from "@/components/ui/LanguageSwitch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// 產品著陸頁專屬頂部列（與全站漢堡 Navbar 不同）：
// 左 logo → 首頁，右 Login → /login、Sign Up → /signup（公開用戶 auth）+ 語言切換。
// 捲動超過 8px 時加上玻璃背景，初始在淺色 Hero 上維持透明。
export default function ProductNav() {
  const t = useTranslations("Product.nav");
  const locale = useLocale() as Locale;
  const homeHref = pathForLocale("/", locale);
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
        <a
          href={homeHref}
          aria-label="ROLL ON."
          className="text-xl md:text-2xl font-extrabold tracking-[-0.04em] text-primary font-[family-name:var(--font-heading)]"
        >
          ROLL ON.
        </a>

        <div className="flex items-center gap-3 md:gap-5">
          <div className="hidden sm:block">
            <LanguageSwitch variant="dark" />
          </div>
          <a
            href={loginHref}
            className="text-sm font-medium text-dark/70 hover:text-primary transition-colors duration-300 font-[family-name:var(--font-heading)]"
          >
            {t("login")}
          </a>
          <a
            href={signupHref}
            className="inline-flex items-center rounded-full bg-primary text-white px-5 md:px-6 py-2 md:py-2.5 text-sm font-semibold font-[family-name:var(--font-heading)] hover:bg-primary-dark transition-colors duration-300"
          >
            {t("signup")}
          </a>
        </div>
      </div>
    </header>
  );
}
