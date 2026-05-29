import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

export function messagesTag(locale: string) {
  return `messages-${locale}`;
}

/**
 * 取得指定語系的翻譯覆蓋（partial JSON）。
 * 以 unstable_cache 快取，避免每個 request 都打 Neon；
 * 編輯後由 API 呼叫 revalidateTag(messagesTag(locale)) 失效。
 */
export function getMessageOverride(locale: string) {
  return unstable_cache(
    async () => {
      const row = await prisma.setting.findUnique({
        where: { key: `messages.${locale}` },
      });
      return (row?.value as Record<string, unknown> | undefined) ?? {};
    },
    ["message-override", locale],
    { tags: [messagesTag(locale)], revalidate: 3600 },
  )();
}
