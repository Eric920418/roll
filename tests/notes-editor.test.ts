import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Children, isValidElement, type ReactNode } from "react";

test("Meeting notes 切換／新增會保護未儲存草稿，同一筆不會重載覆蓋", () => {
  const state: unknown[] = [];
  let cursor = 0, confirmCount = 0, discard = false;
  const require = createRequire(import.meta.url);
  const loaded = { exports: {} as { default: (props: object) => ReactNode } };
  const code = ts.transpileModule(readFileSync("src/components/dashboard/NotesManager.tsx", "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    module: loaded, exports: loaded.exports,
    window: { confirm: () => { confirmCount++; return discard; } },
    require: (id: string) => {
      if (id === "react") return {
        useRef: () => ({ current: null }),
        useState: (initial: unknown) => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value: unknown) => { state[index] = value; }];
        },
      };
      if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
      if (id === "next-intl") return { useLocale: () => "en", useTranslations: () => (key: string) => key };
      return require(id);
    },
  });
  const notes = [
    { id: "a", title: "First", body: "Original", meetingAt: null },
    { id: "b", title: "Second", body: "Other", meetingAt: null },
  ];
  type Props = { children?: ReactNode; "aria-label"?: string; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void; value?: string };
  function render() {
    cursor = 0;
    const elements: { type: unknown; props: Props }[] = [];
    function visit(node: ReactNode) {
      Children.forEach(node, (child) => {
        if (isValidElement<Props>(child)) { elements.push(child); visit(child.props.children); }
      });
    }
    visit(loaded.exports.default({ notes }));
    return elements;
  }
  const edit = (title: string) => render().find(n => n.props["aria-label"] === `edit: ${title}`)!.props.onClick!();
  const body = () => render().find(n => n.type === "textarea")!.props;
  edit("First");
  assert.equal(confirmCount, 0);
  body().onChange!({ target: { value: "Unsaved draft" } });
  edit("First");
  assert.equal(confirmCount, 0);
  edit("Second");
  assert.equal(confirmCount, 1);
  assert.equal(body().value, "Unsaved draft");
  render().find(n => n.type === "button" && n.props.children === "cancel")!.props.onClick!();
  assert.equal(body().value, "Unsaved draft");
  discard = true;
  edit("Second");
  assert.equal(body().value, "Other");
  render().find(n => n.type === "button" && n.props.children === "cancel")!.props.onClick!();
  assert.equal(body().value, "");
});
