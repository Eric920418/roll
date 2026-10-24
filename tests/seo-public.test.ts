import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import sitemap from "../src/app/sitemap";
import * as routes from "../src/lib/routes";
import { loadContent } from "../src/lib/mdx";

const require = createRequire(import.meta.url);
const messages = Object.fromEntries(["en", "zh-tw"].map(locale => [locale, JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"))]));
function translator(locale: string, namespace: string) {
  return (key: string) => `${namespace}.${key}`.split(".").reduce((value, part) => value[part], messages[locale]);
}
function loadModule(file: string, mocks: Record<string, unknown>) {
  const loaded = { exports: {} as Record<string, (...args: never[]) => unknown> };
  runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports,
    require: (id: string) => Object.hasOwn(mocks, id) ? mocks[id] : require(id),
  });
  return loaded.exports;
}

test("sitemap 包含 50 個雙語 canonical URL、對等 hreflang 與實際 MDX 更新日，CMS 未知時間不偽造", async () => {
  const first = await sitemap();
  assert.equal(first.length, 50);
  assert.equal(new Set(first.map(item => item.url)).size, 50);
  assert.deepEqual(first, await sitemap());
  for (const locale of ["en", "zh-tw"] as const) {
    for (const path of ["", "/services", "/insights", "/product", "/esg"]) {
      const entry = first.find(item => item.url === routes.absoluteUrl(path, locale));
      assert.ok(entry, `${locale} ${path}`);
      assert.equal(new URL(entry.url).host, "www.rollgrp.com");
      assert.deepEqual(entry.alternates?.languages, { en: routes.absoluteUrl(path, "en"), "zh-TW": routes.absoluteUrl(path, "zh-tw") });
    }
    assert.equal(first.find(item => item.url === routes.absoluteUrl("/product", locale))?.lastModified, undefined);
    for (const route of routes.allContentRoutes()) {
      const { frontmatter } = await loadContent(route.type, route.slug, locale);
      assert.equal(first.find(item => item.url === routes.absoluteUrl(routes.buildRoutePath(route.type, route.slug), locale))?.lastModified, frontmatter.updatedAt);
    }
  }
});

test("首頁 SEO 獨立於舊 Metadata CMS 品牌，title、OG、圖片參數與 canonical 一致", async () => {
  const page = loadModule("src/app/[locale]/page.tsx", {
    "next-intl/server": { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => translator(locale, namespace) },
    "@/components/home/HomeV10": { default: "div" }, "@/lib/routes": routes,
  });
  for (const locale of ["en", "zh-tw"] as const) {
    const metadata = await (page.generateMetadata as (args: object) => Promise<import("next").Metadata>)({ params: Promise.resolve({ locale }) });
    const title = messages[locale].HomeV10.meta.title;
    assert.equal((metadata.title as { absolute: string }).absolute, title);
    assert.equal(metadata.openGraph?.title, title);
    assert.equal(metadata.alternates?.canonical, routes.absoluteUrl("", locale));
    const og = metadata.openGraph?.images as Array<{ url: string }>;
    assert.equal(new URL(og[0].url).searchParams.get("title"), title);
    assert.ok(!title.includes("NOVA"));
  }
});

test("雙語列表渲染全部既有 MDX，服務與指南連結保留語系及語言切換路徑", async () => {
  const component = loadModule("src/components/content/ContentIndex.tsx", {
    "next/link": { default: "a" }, "next-intl/server": { getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => translator(locale, namespace) },
    "@/lib/routes": routes, "@/lib/mdx": { loadContent },
    "@/components/home/HomeNavigation": { default: "nav" }, "@/components/home/RollonFooter": { default: "footer" },
    "@/components/home/font": { inter: { variable: "" } }, "@/components/home/home.module.css": { default: {} }, "./index.module.css": { default: {} },
  });
  for (const locale of ["en", "zh-tw"] as const) for (const kind of ["services", "insights"] as const) {
    const node = await (component.default as (props: object) => Promise<ReactNode>)({ kind, locale });
    const html = renderToStaticMarkup(node);
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    const type = kind === "services" ? "service" : "insight";
    const slugs = kind === "services" ? routes.SERVICE_SLUGS : routes.INSIGHT_SLUGS;
    for (const slug of slugs) assert.ok(html.includes(`href="${routes.pathForLocale(routes.buildRoutePath(type, slug), locale)}"`));
    assert.ok(html.includes(`path="/${kind}"`));
    const metadata = await (component.indexMetadata as (kind: string, locale: string) => Promise<import("next").Metadata>)(kind, locale);
    assert.equal(metadata.alternates?.canonical, routes.absoluteUrl(`/${kind}`, locale));
  }
});
