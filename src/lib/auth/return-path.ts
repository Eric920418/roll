import type { Locale } from "@/i18n/routing";

export function safeInvestorInvitePath(value: string | null, locale: Locale): string | null {
  if (!value) return null;
  const prefix = locale === "zh-tw" ? "/zh-tw" : "";
  return new RegExp(`^${prefix}/investor/invite/[A-Za-z0-9_-]{40,}$`).test(value)
    ? value
    : null;
}
