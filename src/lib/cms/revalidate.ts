import { revalidatePath, revalidateTag } from "next/cache";

/**
 * 內容變更後統一失效快取：
 * - revalidateTag(tag, "max")：標記 unstable_cache 標籤過期（SWR 語義，Next 16 新簽名）
 * - revalidatePath("/", "layout")：清前台所有頁面（含各 locale segment）
 */
export function revalidateContent(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag, "max");
  revalidatePath("/", "layout");
}
