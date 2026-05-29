import { getMessageOverride } from "@/lib/cms/messages";
import { deepMerge } from "@/lib/cms/deep-merge";
import { flatten } from "@/lib/cms/messages-tree";
import { staticMessages } from "@/lib/cms/static-messages";
import TranslationsEditor, {
  type TransGroup,
} from "@/components/admin/TranslationsEditor";

export const dynamic = "force-dynamic";

export default async function TranslationsPage() {
  const [enOverride, zhOverride] = await Promise.all([
    getMessageOverride("en"),
    getMessageOverride("zh-tw"),
  ]);

  // 有效值 = 靜態 base 合併 DB 覆蓋
  const enFlat = flatten(deepMerge(staticMessages.en, enOverride));
  const zhFlat = flatten(deepMerge(staticMessages["zh-tw"], zhOverride));

  // 以 en 的鍵為主（兩個語系 key 結構相同），依 namespace 分組
  const byNs = new Map<string, TransGroup>();
  for (const path of Object.keys(enFlat)) {
    const ns = path.split(".")[0];
    if (!byNs.has(ns)) byNs.set(ns, { namespace: ns, items: [] });
    byNs.get(ns)!.items.push({
      path,
      en: enFlat[path] ?? "",
      zh: zhFlat[path] ?? "",
    });
  }
  const groups = Array.from(byNs.values());

  return (
    <div className="pb-20">
      <h1 className="text-2xl font-bold tracking-tight mb-1">文案翻譯</h1>
      <p className="text-neutral-500 text-sm mb-6">
        編輯全站 UI 文字（含 About / ESG 頁）。清空欄位則該鍵回退至預設值。
      </p>
      <TranslationsEditor groups={groups} />
    </div>
  );
}
