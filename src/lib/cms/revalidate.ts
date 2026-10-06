import { revalidatePath, revalidateTag } from "next/cache";

/**
 * 內容變更後統一失效快取：
 * - revalidateTag(tag, { expire: 0 })：立即失效，下一次讀取取得更新內容
 * - revalidatePath("/", "layout")：清前台所有頁面（含各 locale segment）
 */
export function revalidateContent(...tags: string[]) {
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  revalidatePath("/", "layout");
}
