import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Children, isValidElement, type ReactNode } from "react";

test("Hub 候補失敗可重試，成功與既有登記不重送，登記沿用聯絡訊息契約", async () => {
  const state: unknown[] = [];
  let cursor = 0, calls = 0, success = false;
  const require = createRequire(import.meta.url);
  const loaded = { exports: {} as { default: (props: object) => ReactNode } };
  const code = ts.transpileModule(readFileSync("src/components/dashboard/home/InvestorHubCard.tsx", "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    module: loaded, exports: loaded.exports,
    require: (id: string) => {
      if (id === "react") return { useState: (initial: unknown) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value: unknown) => { state[index] = value; }];
      } };
      if (id === "next-intl") return { useLocale: () => "en", useTranslations: () => (key: string) => key };
      return require(id);
    },
    fetch: async (url: string, options: { method: string; body: string }) => {
      calls++;
      assert.equal(url, "/api/contact");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { name: "Tester", email: "test@example.com", message: "Hub waitlist", locale: "en" });
      return new Response(success ? JSON.stringify({ data: { received: true } }) : "Temporary outage", { status: success ? 201 : 503 });
    },
  });
  type Props = { children?: ReactNode; role?: string; disabled?: boolean; onClick?: () => Promise<void> };
  function render(joined = false) {
    cursor = 0;
    const elements: { type: unknown; props: Props }[] = [];
    function visit(node: ReactNode) {
      Children.forEach(node, child => {
        if (isValidElement<Props>(child)) { elements.push(child); visit(child.props.children); }
      });
    }
    visit(loaded.exports.default({ name: "Tester", email: "test@example.com", message: "Hub waitlist", joined }));
    return elements;
  }
  const button = () => render().find(node => node.type === "button")!.props;
  const pendingRequest = button().onClick!();
  assert.equal(button().disabled, true);
  await button().onClick!();
  assert.equal(calls, 1);
  await pendingRequest;
  assert.equal(button().disabled, false);
  assert.equal(render().find(node => node.props.role === "alert")!.props.children, "HTTP 503: Temporary outage");
  success = true;
  await button().onClick!();
  assert.equal(button().disabled, true);
  assert.ok(render().find(node => node.props.role === "status"));
  await button().onClick!();
  assert.equal(calls, 2);
  state.length = 0;
  const existing = render(true).find(node => node.type === "button")!.props;
  assert.equal(existing.disabled, true);
  await existing.onClick!();
  assert.equal(calls, 2);
});
