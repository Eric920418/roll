import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getMessageOverride } from "@/lib/cms/messages";
import { deepMerge } from "@/lib/cms/deep-merge";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  // 靜態翻譯檔作為 base / fallback，DB 覆蓋值 deep-merge 其上。
  // 使現有所有 t() 呼叫無需改動即可被 CMS 編輯。
  const base = (await import(`../../messages/${locale}.json`)).default;
  const override = await getMessageOverride(locale);

  return {
    locale,
    messages: deepMerge(base as Record<string, unknown>, override),
  };
});
