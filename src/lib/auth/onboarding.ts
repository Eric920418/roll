import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

// onboarding 步驟與路由 slug 的對應（Step 2=company, Step 3=requirements）。
export type StepSlug = "company" | "requirements";

export function stepSlug(step: number): StepSlug {
  return step >= 3 ? "requirements" : "company";
}

/** 依用戶 onboarding 狀態 + locale 算出登入/授權後應導向的路徑。 */
export function destinationFor(
  state: { completed: boolean; onboardingStep: number },
  locale: Locale,
): string {
  if (state.completed) return pathForLocale("/", locale);
  if (state.onboardingStep >= 4) return pathForLocale("/quiz", locale);
  return pathForLocale(`/onboarding/${stepSlug(state.onboardingStep)}`, locale);
}
