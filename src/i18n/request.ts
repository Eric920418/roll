import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import { getMessageOverride } from "@/lib/cms/messages";
import { deepMerge } from "@/lib/cms/deep-merge";

const NOVA_NAMESPACES = ["Product", "Auth", "Quiz", "Dashboard"] as const;

function normalizeNovaBrand(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\bNova\b/g, "NOVA");
  }
  if (Array.isArray(value)) {
    return value.map(normalizeNovaBrand);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeNovaBrand(item)]),
    );
  }
  return value;
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!hasLocale(routing.locales, locale)) {
    locale = routing.defaultLocale;
  }

  // 靜態翻譯檔作為 base / fallback，DB 覆蓋值 deep-merge 其上。
  // 使現有所有 t() 呼叫無需改動即可被 CMS 編輯。
  const base = (await import(`../../messages/${locale}.json`)).default;
  const override = await getMessageOverride(locale);
  const messages = deepMerge(base as Record<string, unknown>, override);

  // NOVA 是正式全大寫品牌名。CMS 仍可編輯 SaaS 文案，但不可把品牌名覆寫成 Nova。
  for (const namespace of NOVA_NAMESPACES) {
    if (namespace in messages) {
      messages[namespace] = normalizeNovaBrand(messages[namespace]);
    }
  }

  return {
    locale,
    messages,
  };
});
