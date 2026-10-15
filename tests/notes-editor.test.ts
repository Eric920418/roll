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
        useEffect() {},
        useRef: (initial: unknown) => {
          const index = cursor++;
          if (!(index in state)) state[index] = { current: initial };
          return state[index];
        },
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
  type Props = { children?: ReactNode; "aria-label"?: string; onClick?: () => void; onCancel?: (event: { preventDefault(): void }) => void; onChange?: (event: { target: { value: string } }) => void; value?: string };
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
  let prevented = false;
  render().find(n => n.type === "dialog")!.props.onCancel!({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(body().value, "Unsaved draft");
  render().find(n => n.type === "button" && n.props.children === "cancel")!.props.onClick!();
  assert.equal(body().value, "Unsaved draft");
  discard = true;
  edit("Second");
  assert.equal(body().value, "Other");
  render().find(n => n.type === "button" && n.props.children === "cancel")!.props.onClick!();
  assert.equal(body().value, "");
});

test("Notes table searches body/type, pages through matches, expands and preserves failed saves", async () => {
  const state: unknown[] = []; let cursor = 0, saves = 0, fail = true, refreshed = 0;
  const require = createRequire(import.meta.url), loaded = { exports: {} as { default: (props: object) => ReactNode } };
  const code = ts.transpileModule(readFileSync("src/components/dashboard/NotesManager.tsx", "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(code, { module: loaded, exports: loaded.exports, window: { confirm: () => true }, fetch: async () => { saves++; return Response.json(fail ? { error: "Safe save error" } : { data: {} }, { status: fail ? 500 : 200 }); }, require: (id: string) => {
    if (id === "react") return { useEffect() {}, useRef: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]; }, useState: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (value: unknown) => { state[i] = value; }]; } };
    if (id === "next/navigation") return { useRouter: () => ({ refresh() { refreshed++; } }) };
    if (id === "next-intl") return { useTranslations: () => (key: string) => key };
    return require(id);
  } });
  const notes = [{ id: "a", title: "First", body: "Pilot evidence", meetingAt: "2026-10-14T00:00:00.000Z", meetingType: "internal" }, { id: "b", title: "Second", body: "Pilot notes", meetingAt: null, meetingType: "client" }, { id: "c", title: "Third", body: "Unrelated", meetingAt: null, meetingType: "other" }];
  type Props = { children?: ReactNode; "aria-label"?: string; role?: string; type?: string; value?: string; disabled?: boolean; onClick?(): void; onChange?(event: { target: { value: string } }): void; onSubmit?(event: { preventDefault(): void }): Promise<void> };
  function render() { cursor = 0; const nodes: Array<{ type: unknown; props: Props }> = []; function visit(node: ReactNode) { Children.forEach(node, child => { if (isValidElement<Props>(child)) { nodes.push(child); visit(child.props.children); } }); } visit(loaded.exports.default({ notes })); return nodes; }
  const button = (label: string) => render().find(node => node.props["aria-label"] === label)!;
  const search = (value: string) => render().find(node => node.props.type === "search")!.props.onChange!({ target: { value } });
  search("ＰＩＬＯＴ");
  assert.equal(render().filter(node => node.props["aria-label"]?.startsWith("edit:")).length, 2);
  button("edit: First").props.onClick!();
  assert.equal(button("previous").props.disabled, true); assert.equal(button("next").props.disabled, false);
  button("next").props.onClick!();
  assert.equal(render().find(node => node.type === "textarea")!.props.value, "Pilot notes");
  assert.equal(button("next").props.disabled, true);
  button("expand").props.onClick!(); assert(button("collapse"));
  render().find(node => node.type === "textarea")!.props.onChange!({ target: { value: "My unsaved draft" } });
  const form = render().find(node => node.type === "form")!.props;
  const first = form.onSubmit!({ preventDefault() {} }); const duplicate = form.onSubmit!({ preventDefault() {} });
  await Promise.all([first, duplicate]);
  assert.equal(saves, 1); assert.equal(refreshed, 0);
  assert.equal(render().find(node => node.type === "textarea")!.props.value, "My unsaved draft");
  assert(render().some(node => node.props.role === "alert" && node.props.children === "Safe save error"));
  fail = false; await render().find(node => node.type === "form")!.props.onSubmit!({ preventDefault() {} });
  assert.equal(refreshed, 1); assert.equal(render().find(node => node.type === "textarea")!.props.value, "");
  search("types.internal"); assert.equal(render().filter(node => node.props["aria-label"]?.startsWith("edit:")).length, 1);
  search("missing"); assert(render().some(node => node.props.children === "noMatches"));
});
