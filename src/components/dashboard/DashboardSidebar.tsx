"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], display: "swap" });
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

import { RewardBadge, useRewards } from "./rewards/RewardsProvider";

type NavKey =
  | "overview"
  | "profile"
  | "insights"
  | "agenda"
  | "account"
  | "investors"
  | "feedback"
  | "rewards";

// 各 nav 項對應的 path（未加 locale 前綴）。新增頁面時在此擴充即可。
// soon: 尚未上線的占位頁，側欄標「即將」小標，點進去是 coming-soon 頁。
const NAV: { key: NavKey; path: string; soon?: boolean }[] = [
  { key: "overview", path: "/dashboard" },
  { key: "profile", path: "/dashboard/profile" },
  { key: "agenda", path: "/dashboard/agenda" },
  { key: "insights", path: "/dashboard/insights" },
  { key: "investors", path: "/dashboard/investors" },
  { key: "rewards", path: "/dashboard/rewards" },
  { key: "account", path: "/dashboard/account" },
  { key: "feedback", path: "/dashboard/feedback" },
];

export default function DashboardSidebar({
  locale,
  planLabel,
  userLabel,
}: {
  locale: Locale;
  planLabel: string;
  userLabel: string;
}) {
  const t = useTranslations("Dashboard");
  const rt = useTranslations("Rewards");
  const rewards = useRewards();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [loggingOut, setLoggingOut] = useState(false);

  // overview 用完全比對（避免被子路由吃掉 active），其餘用前綴比對
  function isActive(path: string): boolean {
    const href = pathForLocale(path, locale);
    if (path === "/dashboard") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push(pathForLocale("/", locale));
      router.refresh();
    }
  }

  return (
    <aside style={{ fontFamily: `${inter.style.fontFamily}, var(--font-chinese), sans-serif` }} className="flex shrink-0 flex-col gap-4 border-b border-dark/10 bg-white p-5 md:w-60 md:gap-7 md:border-b-0 md:border-r">
      <div>
        <Link
          href={pathForLocale("/dashboard", locale)}
          aria-label="NOVA"
          className="inline-flex"
        >
          <span className="text-[26px] font-semibold leading-none tracking-[0.04em]">NOVA</span>
        </Link>
        <Link
          href={pathForLocale("/", locale)}
          className="mt-1.5 block text-[11px] font-normal tracking-[0.06em] text-[#8A8A85] transition-colors hover:text-dark/70"
        >
          by ROLL ON
        </Link>
      </div>

      <nav className="flex gap-0 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV.map(({ key, path, soon }) => {
          const active = isActive(path);
          return (
            <Link
              key={key}
              href={pathForLocale(path, locale)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-11 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-[14px] font-medium tracking-normal transition-colors md:min-h-10 ${key === "rewards" ? "md:mt-4 md:before:absolute md:before:-top-2 md:before:inset-x-0 md:before:border-t md:before:border-dark/10" : ""} ${
                active
                  ? "text-white"
                  : "text-[#55554F] hover:bg-dark/[0.04]"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nova-dashboard-active-nav"
                  aria-hidden="true"
                  className="absolute inset-x-0 inset-y-0 rounded-lg bg-black md:inset-y-[3px]"
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              )}
              <span className="relative z-10">{t(`nav.${key}`)}</span>
              {key === "rewards" && <RewardBadge />}
              {soon && (
                <span
                  className={`relative z-10 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
                    active ? "bg-white/20 text-white" : "bg-accent/20 text-accent"
                  }`}
                >
                  {t("comingSoon.badge")}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {rewards.error && <div role="alert" className="break-words rounded-xl bg-red-50 p-3 text-xs text-red-700"><p>{rewards.error}</p><button type="button" className="min-h-11 underline" onClick={() => void rewards.refresh()}>{rt("retry")}</button></div>}

      <div className="mt-auto flex flex-row items-center gap-3 border-t border-dark/10 pt-3 md:flex-col md:items-stretch md:pt-5">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-sm text-dark/60" title={userLabel}>
            {userLabel}
          </span>
          <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold tracking-wide text-primary font-[family-name:var(--font-heading)]">
            {planLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="min-h-11 shrink-0 rounded-xl border border-dark/15 px-4 py-2.5 text-sm font-semibold tracking-[0.05em] text-dark/70 transition-colors hover:bg-dark/[0.03] disabled:opacity-60 font-[family-name:var(--font-heading)]"
        >
          {t("logout")}
        </button>
      </div>
    </aside>
  );
}
