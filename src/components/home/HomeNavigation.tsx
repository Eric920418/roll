"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import styles from "./home.module.css";

export default function HomeNavigation({ locale, current = "home" }: { locale: Locale; current?: "home" | "approach" | "cases" | "taiwan" | "about" }) {
  const t = useTranslations("HomeV10.nav");
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = [
    { key: "home", href: pathForLocale("/", locale) },
    { key: "approach", href: pathForLocale("/approach", locale) },
    { key: "cases", href: pathForLocale("/cases", locale) },
    { key: "taiwan", href: pathForLocale("/taiwan", locale) },
    { key: "about", href: pathForLocale("/about", locale) },
  ] as const;

  const pagePath = current === "home" ? "/" : `/${current}`;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Link href={pathForLocale("/", locale)} className={styles.wordmark} aria-label="ROLL ON.">
          ROLL ON.
        </Link>
        <nav className={styles.desktopNav} aria-label={t("label")}>
          {links.map(({ key, href }) => (
            <Link key={key} href={href} className={key === current ? styles.activeNav : undefined} aria-current={key === current ? "page" : undefined}>
              {t(key)}
            </Link>
          ))}
          <Link href={pathForLocale("/product", locale)}>NOVA</Link>
          <a href="#contact" className={`${styles.button} ${styles.navBook}`}>{t("book")}</a>
        </nav>
        <button ref={toggle} type="button" className={styles.menuToggle} aria-expanded={open} aria-controls="home-mobile-nav" aria-label={open ? t("close") : t("open")} onClick={() => setOpen(!open)}>
          {open ? <XMarkIcon aria-hidden="true" /> : <Bars3Icon aria-hidden="true" />}
        </button>
        {open && (
          <nav id="home-mobile-nav" className={styles.mobileNav} aria-label={t("label")}>
            {links.map(({ key, href }) => (
              <Link key={key} href={href} aria-current={key === current ? "page" : undefined} onClick={() => setOpen(false)}>{t(key)}</Link>
            ))}
            <Link href={pathForLocale("/product", locale)} onClick={() => setOpen(false)}>NOVA</Link>
            <a href="#contact" onClick={() => setOpen(false)}>{t("book")}</a>
            <div className={styles.mobileLanguages}>
              <Link href={pathForLocale(pagePath, "en")} lang="en" hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>EN</Link>
              <Link href={pathForLocale(pagePath, "zh-tw")} lang="zh-TW" hrefLang="zh-TW" aria-current={locale === "zh-tw" ? "page" : undefined}>繁中</Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
