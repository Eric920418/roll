"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import NovaLogo from "@/components/brand/NovaLogo";
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
    <aside className="flex shrink-0 flex-col gap-4 border-b border-dark/10 bg-white p-5 md:w-64 md:gap-6 md:border-b-0 md:border-r md:p-7">
      <div>
        <Link
          href={pathForLocale("/dashboard", locale)}
          aria-label="NOVA"
          className="inline-flex"
        >
          <NovaLogo
            variant="black"
            className="h-auto w-[132px]"
            sizes="132px"
          />
        </Link>
        <Link
          href={pathForLocale("/", locale)}
          className="mt-2 block text-[10px] font-semibold tracking-[0.22em] text-dark/40 transition-colors hover:text-dark/70"
        >
          {t("brand")}
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV.map(({ key, path, soon }) => {
          const active = isActive(path);
          return (
            <Link
              key={key}
              href={pathForLocale(path, locale)}
              className={`relative flex shrink-0 items-center justify-between gap-2 overflow-hidden rounded-xl px-4 py-2.5 text-sm font-semibold tracking-[0.05em] transition-colors font-[family-name:var(--font-heading)] ${
                active
                  ? "text-white"
                  : "text-dark/70 hover:bg-dark/[0.04]"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nova-dashboard-active-nav"
                  aria-hidden="true"
                  className="absolute inset-0 rounded-xl bg-primary"
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
