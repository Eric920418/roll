import type { Locale } from "@/i18n/routing";

export function safeLoginReturnPath(value: string | null, locale: Locale): string | null {
  if (!value) return null;
  const prefix = locale === "zh-tw" ? "/zh-tw" : "";
  if (new RegExp("^" + prefix + "/roundtables/[A-Za-z0-9_-]{1,200}$").test(value)) return value;
  return new RegExp(`^${prefix}/investor/invite/[A-Za-z0-9_-]{40,}$`).test(value)
    ? value
    : null;
}
