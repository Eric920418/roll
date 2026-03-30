"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";

interface LanguageSwitchProps {
  variant?: "light" | "dark";
}

export default function LanguageSwitch({ variant = "light" }: LanguageSwitchProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = () => {
    const nextLocale = locale === "zh-tw" ? "en" : "zh-tw";
    const segments = pathname.split("/");

    if (segments[1] === "en" || segments[1] === "zh-tw") {
      segments.splice(1, 1);
    }

    const newPath =
      nextLocale === "zh-tw"
        ? segments.join("/") || "/"
        : `/${nextLocale}${segments.join("/") || "/"}`;

    router.push(newPath);
  };

  return (
    <button
      onClick={switchLocale}
      className={`text-sm font-medium tracking-wider transition-colors duration-300 cursor-pointer font-[family-name:var(--font-heading)] ${
        variant === "dark"
          ? "text-[#1A1A1A]/70 hover:text-[#D4A574]"
          : "text-white/80 hover:text-white"
      }`}
    >
      {locale === "zh-tw" ? "ENGLISH" : "中文"}
    </button>
  );
}
