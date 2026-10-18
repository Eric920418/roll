import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { readAdminResponse } from "../src/lib/cms/admin-response";
import * as assets from "../src/lib/cms/rollon-v10";
import * as routes from "../src/lib/routes";

test("共用頁尾保留雙語指南與 NOVA，社群使用 CMS、清空隱藏並拒絕危險協定", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const require = createRequire(import.meta.url);
  let contact: Record<string, unknown> = {};
  const loaded = { exports: {} as { default: (props: { locale: "en" | "zh-tw"; path: string }) => Promise<import("react").ReactNode> } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/home/RollonFooter.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports,
    require: (id: string) => {
      if (id === "next/link") return { default: "a" };
      if (id === "./HomeContactForm") return { default: () => null };
      if (id === "./home.module.css") return { default: {} };
      if (id === "@/lib/routes") return routes;
      if (id === "@/lib/cms/content") return { getSetting: async () => contact };
      if (id === "@/lib/security/log") return {};
      if (id === "next-intl/server") return { getTranslations: async ({ locale }: { locale: string }) => {
        const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).HomeV10;
        return (key: string) => key.split(".").reduce((value, part) => value[part], messages);
      } };
      return require(id);
    },
  });
  for (const locale of ["en", "zh-tw"] as const) {
    const render = async () => renderToStaticMarkup(await loaded.exports.default({ locale, path: "/about" }));
    contact = {};
    const defaults = await render();
    for (const slug of routes.INSIGHT_SLUGS) assert.ok(defaults.includes(`href="${routes.pathForLocale(`/insights/${slug}`, locale)}"`));
    assert.ok(defaults.includes(`href="${routes.pathForLocale("/product", locale)}"`));
    assert.ok(defaults.includes('href="/zh-tw/about"'));
    assert.ok(defaults.includes('href="https://www.instagram.com/rollon.tw/"'));
    assert.ok(defaults.includes('href="https://www.linkedin.com/company/rollon/"'));
    assert.ok(defaults.includes(locale === "en" ? "Insights &amp; guides" : "深度指南"));
    contact = { instagram: "https://www.instagram.com/cms-profile/", linkedin: "" };
    const custom = await render();
    assert.ok(custom.includes('href="https://www.instagram.com/cms-profile/" target="_blank" rel="noopener noreferrer"'));
    assert.ok(!custom.includes("LinkedIn"));
    contact = { instagram: "javascript:alert(1)", linkedin: "data:text/html,bad" };
    const invalid = await render();
    assert.ok(!invalid.includes("Instagram") && !invalid.includes("LinkedIn"));
  }
});

const blob = "https://example.public.blob.vercel-storage.com/rollon-v10/photo.jpg";
test("五頁 44 個圖片位置有唯一名稱、存在的預設素材，覆寫只影響對應位置", () => {
  assert.equal(Object.values(assets.rollonAssets).flat().length, 44);
  for (const page of Object.keys(assets.rollonPages) as assets.RollonCmsPage[]) {
    const slots = assets.rollonAssets[page];
    assert.equal(new Set(slots.map(s => s.name)).size, slots.length);
    for (const slot of slots) {
      assert.ok(existsSync(`public${slot.src}`), slot.src);
      assert.equal(assets.resolveRollonAsset(page, {}, slot.src), slot.src);
      assert.equal(assets.resolveRollonAsset(page, { [slot.name]: blob }, slot.src), blob);
      assert.equal(assets.resolveRollonAsset(page, { [slot.name]: "" }, slot.src), slot.src);
      assert.equal(assets.resolveRollonAsset(page, { [slot.name]: "https://untrusted.example/image.jpg" }, slot.src), slot.src);
    }
  }
});
test("圖片設定拒絕偽造網域、任意內網 URL、未知欄位與非字串，允許清空恢復預設", () => {
  for (const value of ["javascript:alert(1)", "//evil.example/a.jpg", "http://localhost:3002/api/admin", "https://example.public.blob.vercel-storage.com.evil.test/a.jpg", "https://user:pass@example.public.blob.vercel-storage.com/a.jpg", null, 4]) {
    assert.equal(assets.validateRollonAssets("home", { "taipei-101": value }).length, 1);
  }
  assert.equal(assets.validateRollonAssets("home", { nonexistent: blob }).length, 1);
  assert.deepEqual(assets.validateRollonAssets("home", { "taipei-101": "" }), []);
  assert.deepEqual(assets.validateRollonAssets("home", { "taipei-101": blob }), []);
});
test("CMS 完整顯示 JSON／非 JSON／空回應與獨立追蹤碼，不誤報空成功", async () => {
  assert.deepEqual(await readAdminResponse(Response.json({ data: { saved: 1 } })), { saved: 1 });
  for (const status of [400, 401, 429, 500]) {
    await assert.rejects(readAdminResponse(Response.json({ error: "第一行\n第二行", requestId: "trace-test" }, { status })), { message: `HTTP ${status}: 第一行\n第二行\n追蹤碼 / Reference: trace-test` });
  }
  await assert.rejects(readAdminResponse(new Response("Bad gateway", { status: 502 })), { message: "HTTP 502: Bad gateway" });
  await assert.rejects(readAdminResponse(new Response("", { status: 200 })), /未回傳儲存結果/);
});

test("設定 API 使用測試替身：登入保護、驗證失敗不寫入、成功只寫目標設定並失效快取", async () => {
  const require = createRequire(import.meta.url);
  let admin = false;
  const writes: Array<{ where: { key: string }; update: { value: unknown } }> = [];
  const invalidated: string[] = [];
  const loaded = { exports: {} as { PUT: (req: { json: () => Promise<unknown> }) => Promise<Response> } };
  const code = ts.transpileModule(readFileSync("src/app/api/admin/settings/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, {
    module: loaded, exports: loaded.exports,
    require: (id: string) => {
      if (id === "@/lib/cms/rollon-v10") return assets;
      if (id === "@/lib/security/http") return { browserMutationGuard: () => null };
      if (id === "@/lib/auth/guard") return { requireAdmin: async () => admin };
      if (id === "@/lib/prisma") return { prisma: { setting: { upsert: async (args: typeof writes[number]) => { writes.push(args); return args.update; } } } };
      if (id === "@/lib/api") return { ok: (data: unknown) => Response.json({ data }), fail: (error: string, status: number) => Response.json({ error }, { status }), unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }), failFromError: () => Response.json({ error: "unexpected" }, { status: 500 }) };
      if (id === "@/lib/cms/json") return { asJson: (v: unknown) => v };
      if (id === "@/lib/cms/revalidate") return { revalidateContent: (tag: string) => invalidated.push(tag) };
      if (id === "@/lib/cms/tags") return { SETTINGS_TAG: "settings-test" };
      return require(id);
    },
  });
  const put = (key: string, value: unknown) => loaded.exports.PUT({ json: async () => ({ key, value }) });
  assert.equal((await put("rollonV10.home", { "taipei-101": blob })).status, 401);
  admin = true;
  assert.equal((await put("rollonV10.invalid", {})).status, 400);
  assert.equal((await put("rollonV10.home", { "taipei-101": "https://bad.example/a" })).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await put("rollonV10.home", { "taipei-101": blob })).status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].where.key, "rollonV10.home");
  assert.deepEqual(writes[0].update.value, { "taipei-101": blob });
  assert.deepEqual(invalidated, ["settings-test"]);
});

test("管理設定表單：送出中防重送，失敗保留輸入與完整錯誤，可重試成功", async () => {
  const { Children, isValidElement } = await import("react");
  type Element = { type: unknown; props: Record<string, unknown> };
  const require = createRequire(import.meta.url);
  const state: unknown[] = [];
  let cursor = 0, calls = 0, refreshed = 0;
  let complete!: (response: Response) => void;
  const loaded = { exports: {} as { default: (props: object) => import("react").ReactNode } };
  runInNewContext(ts.transpileModule(readFileSync("src/components/admin/SettingsForm.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports, Error,
    fetch: () => { calls++; return new Promise<Response>(resolve => { complete = resolve; }); },
    require: (id: string) => {
      if (id === "react") return {
        useRef: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
        useState: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value: unknown) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      };
      if (id === "next/navigation") return { useRouter: () => ({ refresh: () => { refreshed++; } }) };
      if (id === "./ImageUploader") return { default: "image-uploader" };
      if (id === "@/lib/cms/admin-response") return { readAdminResponse };
      return require(id);
    },
  });
  function render() {
    cursor = 0;
    const nodes: Element[] = [];
    function visit(node: import("react").ReactNode) {
      Children.forEach(node, child => { if (isValidElement<{ children?: import("react").ReactNode }>(child)) { nodes.push(child as Element); visit(child.props.children); } });
    }
    visit(loaded.exports.default({ settingKey: "rollonV10.home", title: "圖片", fields: [{ name: "taipei-101", type: "image", label: "台北" }], initial: { "taipei-101": blob } }));
    return nodes;
  }
  const submit = () => (render().find(n => n.type === "form")!.props.onSubmit as (e: object) => Promise<void>)({ preventDefault() {} });
  const first = submit();
  await submit();
  assert.equal(calls, 1);
  assert.equal(render().find(n => n.type === "button")!.props.disabled, true);
  complete(Response.json({ error: "儲存失敗\n請重試", requestId: "trace-321" }, { status: 500 }));
  await first;
  assert.equal(render().find(n => n.type === "image-uploader")!.props.value, blob);
  assert.equal(render().find(n => n.props.role === "alert")!.props.children, "HTTP 500: 儲存失敗\n請重試\n追蹤碼 / Reference: trace-321");
  assert.equal(refreshed, 0);
  const retry = submit();
  complete(Response.json({ data: { key: "rollonV10.home" } }));
  await retry;
  assert.equal(refreshed, 1);
  assert.equal(render().find(n => n.props.role === "alert"), undefined);
  const uploading = render().find(n => n.type === "image-uploader")!;
  assert.equal(uploading.props.preservePrevious, true);
  (uploading.props.onUploadingChange as (active: boolean) => void)(true);
  await submit();
  assert.equal(calls, 2, "圖片上傳完成前不送出設定");
});

test("新版官網管理依頁面顯示對應圖片與雙語文案，權限檢查先於讀取", async () => {
  const { Children, isValidElement } = await import("react");
  const require = createRequire(import.meta.url);
  const baseEn = JSON.parse(readFileSync("messages/en.json", "utf8"));
  const baseZh = JSON.parse(readFileSync("messages/zh-tw.json", "utf8"));
  const { deepMerge } = await import("../src/lib/cms/deep-merge");
  const { flatten } = await import("../src/lib/cms/messages-tree");
  let authorized = false;
  const loaded = { exports: {} as { default: (props: object) => Promise<import("react").ReactNode> } };
  runInNewContext(ts.transpileModule(readFileSync("src/app/admin/(dashboard)/website/page.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports,
    require: (id: string) => {
      if (id === "@/lib/auth/guard") return { requireAdminPage: async () => { authorized = true; } };
      if (id === "@/lib/cms/content") return { getSetting: async () => { assert.equal(authorized, true); return { "taipei-101": blob }; } };
      if (id === "@/lib/cms/messages") return { getMessageOverride: async () => ({}) };
      if (id === "@/lib/cms/rollon-v10") return assets;
      if (id === "@/lib/cms/deep-merge") return { deepMerge };
      if (id === "@/lib/cms/messages-tree") return { flatten };
      if (id === "@/lib/cms/static-messages") return { staticMessages: { en: baseEn, "zh-tw": baseZh } };
      if (id === "@/lib/security/log") return { logSecurityError: () => "test-id", publicErrorMessage: () => "test-error" };
      if (id === "@/components/admin/SettingsForm") return { default: "settings-form" };
      if (id === "@/components/admin/TranslationsEditor") return { default: "translations-editor" };
      if (id === "next/link") return { default: "a" };
      return require(id);
    },
  });
  for (const page of Object.keys(assets.rollonPages) as assets.RollonCmsPage[]) {
    authorized = false;
    const nodes: Array<{ type: unknown; props: Record<string, unknown> }> = [];
    function visit(node: import("react").ReactNode) {
      Children.forEach(node, child => { if (isValidElement<{ children?: import("react").ReactNode }>(child)) { nodes.push(child as typeof nodes[number]); visit(child.props.children); } });
    }
    visit(await loaded.exports.default({ searchParams: Promise.resolve({ page }) }));
    const form = nodes.find(n => n.type === "settings-form")!;
    assert.equal(form.props.settingKey, `rollonV10.${page}`);
    assert.equal((form.props.fields as unknown[]).length, assets.rollonAssets[page].length);
    const groups = nodes.find(n => n.type === "translations-editor")!.props.groups as Array<{ namespace: string; items: Array<{ en: string; zh: string }> }>;
    assert.equal(groups[0].namespace, assets.rollonPages[page].namespace);
    assert.ok(groups[0].items.length > 40);
    assert.ok(groups[0].items.every(item => typeof item.en === "string" && typeof item.zh === "string"));
    assert.ok(nodes.some(n => n.props.href === "/admin/translations?namespace=Product"));
  }
});
