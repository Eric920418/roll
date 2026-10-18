import Link from "next/link";
import { requireAdminPage } from "@/lib/auth/guard";
import { getSetting } from "@/lib/cms/content";
import { getMessageOverride } from "@/lib/cms/messages";
import { deepMerge } from "@/lib/cms/deep-merge";
import { flatten } from "@/lib/cms/messages-tree";
import { staticMessages } from "@/lib/cms/static-messages";
import { isRollonPage, rollonPages, rollonAssets, rollonSettingKey, resolveRollonAsset } from "@/lib/cms/rollon-v10";
import { logSecurityError, publicErrorMessage } from "@/lib/security/log";
import SettingsForm from "@/components/admin/SettingsForm";
import TranslationsEditor from "@/components/admin/TranslationsEditor";

export const dynamic = "force-dynamic";

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdminPage();
  const params = await searchParams;
  const page = isRollonPage(params.page) ? params.page : "home";
  const config = rollonPages[page];
  let data;
  try {
    data = await Promise.all([getSetting(rollonSettingKey(page)), getMessageOverride("en"), getMessageOverride("zh-tw")]);
  } catch (error) {
    return <p role="alert" className="whitespace-pre-wrap text-red-700">{publicErrorMessage(logSecurityError("admin.website.read", error))}</p>;
  }
  const [images, enOverride, zhOverride] = data;
  const enFlat = flatten(deepMerge(staticMessages.en, enOverride));
  const zhFlat = flatten(deepMerge(staticMessages["zh-tw"], zhOverride));
  const namespaces = page === "home" ? [config.namespace, "Metadata"] : [config.namespace];
  const groups = namespaces.map(namespace => ({ namespace, items: Object.keys(enFlat).filter(path => path.startsWith(`${namespace}.`)).map(path => ({ path, en: enFlat[path], zh: zhFlat[path] ?? "" })) }));
  return <div className="pb-24">
    <h1 className="mb-2 text-2xl font-bold">新版官網</h1>
    <p className="mb-4 text-sm text-neutral-600">五頁文字、數字、照片及 Logo 在此管理。中英文圖片共用；版面與區塊順序固定依 PDF，文案請保留原稿換行。</p>
    <nav aria-label="官網管理頁面" className="mb-5 flex flex-wrap gap-2">
      {Object.entries(rollonPages).map(([key, item]) => <Link key={key} href={`/admin/website?page=${key}`} aria-current={key === page ? "page" : undefined} className={`rounded-lg border px-4 py-2 text-sm ${key === page ? "bg-neutral-900 text-white" : "bg-white"}`}>{item.label}</Link>)}
    </nav>
    <div className="mb-6 flex flex-wrap gap-4 text-sm underline">
      <Link href={config.path} target="_blank">預覽英文 ↗</Link>
      <Link href={page === "home" ? "/zh-tw" : `/zh-tw${config.path}`} target="_blank">預覽繁中 ↗</Link>
      <Link href="/admin/settings">聯絡資訊</Link><Link href="/admin/messages">聯絡表單收件</Link>
      <Link href="/admin/translations?namespace=Product">NOVA 文案</Link><Link href="/product" target="_blank">預覽 NOVA ↗</Link>
    </div>
    <details key={`${page}-images`} className="mb-8 rounded-xl border border-neutral-200 bg-white p-5">
      <summary className="cursor-pointer font-semibold">{config.label}：照片與 Logo（{rollonAssets[page].length} 個位置）</summary>
      <p className="my-4 text-sm text-neutral-600">替換後按「儲存」才更新前台；清空圖片後儲存，恢復 PDF 預設素材。上傳不刪除舊圖，以免未儲存或其他頁面仍使用時失效。</p>
      <SettingsForm key={page} settingKey={rollonSettingKey(page)} title="圖片設定" initial={Object.fromEntries(rollonAssets[page].map(slot => [slot.name, resolveRollonAsset(page, images, slot.src)]))} fields={rollonAssets[page].map(slot => ({ name: slot.name, label: slot.label, type: "image", folder: "rollon-v10" }))} />
    </details>
    <h2 className="mb-4 text-lg font-semibold">{config.label}：中英文文案</h2>
    <p className="mb-5 text-sm text-neutral-500">首頁包含全站新版導覽、聯絡表單與頁尾文字；清空文案後儲存會恢復預設值。修改後請開啟預覽確認長度及換行。</p>
    <TranslationsEditor key={page} groups={groups} />
  </div>;
}
