import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pdfRuntime } from "./helpers/pdf-runtime";
test("Credits loading states keep one currency name and offer retry in both languages", () => {
  for (const locale of ["en", "zh-tw"]) {
    const load = pdfRuntime({ react: { ...React, useEffect() {} }, "next-intl": { useLocale: () => locale }, "@/lib/member-fetch": { memberFetch() { throw new Error("Rendering must not request money operations"); } } });
    const Wallet = load<typeof import("../src/components/dashboard/TokenBalance")>("src/components/dashboard/TokenBalance.tsx").default;
    const html = renderToStaticMarkup(React.createElement(Wallet, { creditsMode: true, compact: true }));
    assert(html.includes(locale === "zh-tw" ? "點數" : "Credits")); assert(!html.includes("Token"));
    assert.match(html, /role="status"/); assert.match(html, /<button/);
    const legacy = renderToStaticMarkup(React.createElement(Wallet)); assert(legacy.includes("Token"));
  }
});
