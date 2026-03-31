import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "zh-tw"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,
});
