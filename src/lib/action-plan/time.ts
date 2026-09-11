import type { Locale } from "@/i18n/routing";

export type ActionTimeMinutes = {
  minMinutes: number;
  maxMinutes: number;
};

export function legacyHoursForMinutes(time: ActionTimeMinutes): {
  minHours: number;
  maxHours: number;
} {
  return {
    minHours: Math.floor(time.minMinutes / 60),
    maxHours: Math.ceil(time.maxMinutes / 60),
  };
}

function formatDuration(minutes: number, locale: Locale): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (locale === "zh-tw") {
    if (hours === 0) return `${remainingMinutes} 分鐘`;
    if (remainingMinutes === 0) return `${hours} 小時`;
    return `${hours} 小時 ${remainingMinutes} 分鐘`;
  }

  if (hours === 0) return `${remainingMinutes}m`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function formatActionTime(time: ActionTimeMinutes, locale: Locale): string {
  const min = formatDuration(time.minMinutes, locale);
  if (time.minMinutes === time.maxMinutes) return min;
  return `${min}–${formatDuration(time.maxMinutes, locale)}`;
}
