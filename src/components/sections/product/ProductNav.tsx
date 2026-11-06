"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import NovaLogo from "@/components/brand/NovaLogo";
import LanguageSwitch from "@/components/ui/LanguageSwitch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import s from "./landing.module.css";
export default function ProductNav() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", [open, setOpen] = useState(false);
  const links = [["how", zh ? "如何使用" : "What we do"], ["cases", zh ? "實務案例" : "Case studies"], ["community", zh ? "社群與節目" : "Community"], ["pricing", zh ? "方案價格" : "Pricing"]];
  return <header className={s.nav}>
    <a className={s.brand} href={pathForLocale("/product", locale)} aria-label="NOVA AI"><NovaLogo variant="black" priority className="h-auto w-28" /><span>BY ROLL ON</span></a>
    <button type="button" className={s.menuButton} aria-expanded={open} aria-controls="nova-navigation" onClick={() => setOpen(!open)}>{zh ? "選單" : "Menu"} {open ? "−" : "+"}</button>
    <nav id="nova-navigation" className={`${s.navLinks} ${open ? s.navOpen : ""}`} aria-label={zh ? "NOVA 導覽" : "NOVA navigation"}>{links.map(([id, label]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{label}</a>)}<LanguageSwitch variant="dark" brand="nova" /><a href={pathForLocale("/login", locale)}>{zh ? "登入" : "Log in"}</a><a className={s.darkButton} href={pathForLocale("/signup", locale)}>{zh ? "免費開始" : "Start free trial"}</a></nav>
  </header>;
}
