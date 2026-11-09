import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { pdfRuntime } from "./helpers/pdf-runtime";
import { positioningReplies, type FlowContext } from "../src/lib/action-plan/flow/evaluate";
import { emptyFlowData, emptyRecord, flowKey, type FlowData, type StepId } from "../src/lib/action-plan/flow/catalog";

test("Positioning fields require all four facts and explicit application; direct edits retain prior structured facts", () => {
  const load = pdfRuntime({ react: { ...React, useState: (value: unknown) => [value, () => {}] } });
  const { default: Editor, positioningPreview } = load<typeof import("../src/components/dashboard/flow/PositioningEditor")>("src/components/dashboard/flow/PositioningEditor.tsx");
  type Data = Extract<FlowData, { kind: "organize" }>;
  let data: Data = { ...emptyFlowData("organize") as Data, values: { positioning: "Existing saved wording", positioningWho: "Founders", positioningWhen: "before sales", positioningPain: "unclear demand" }, confirmed: ["positioning"] };
  assert.equal(positioningPreview(data.values, false), "");
  data.values.positioningMethod = "customer evidence";
  assert.equal(positioningPreview(data.values, true), "為Founders，在before sales時，解決unclear demand，透過customer evidence。");
  const preview = positioningPreview(data.values, false), old = JSON.stringify(data);
  const render = () => Editor({ data, locale: "en", onChange: next => { data = next; } }) as React.ReactElement<{ children: React.ReactNode[] }>;
  let tree = render();
  assert.equal(JSON.stringify(data), old, "Rendering must not replace saved text or confirmation");
  const apply = tree.props.children[2] as React.ReactElement<{ onClick(): void }>;
  apply.props.onClick();
  assert.equal(data.values.positioning, preview); assert.deepEqual(Array.from(data.confirmed), []);
  assert.equal(data.values.positioningMode, "direct");
  assert.equal(positioningPreview(data.values, true), "", "Switching locale cannot rewrite applied wording or block saved confirmations");
  tree = render();
  const details = tree.props.children[3] as React.ReactElement<{ children: React.ReactElement<{ onChange(value: string): void }>[] }>;
  details.props.children[1].props.onChange("Direct edit of the original statement");
  assert.equal(data.values.positioningWho, "Founders"); assert.equal(data.values.positioningMode, "direct");
  assert.equal(positioningPreview(data.values, false), ""); assert.equal(data.values.positioning, "Direct edit of the original statement");
});

test("Positioning response table only exposes this plan's current statement replies and no link secrets", () => {
  const action = (step: StepId, data: FlowData, taskFinding: unknown = null) => ({ id: step, clientKey: flowKey(step), done: false, completedAt: null, taskWorkspace: { version: 2, step, data }, taskFinding });
  const leads = ["yes", "no", "old", "wrong", "none", "excluded"].map(id => ({ ...emptyRecord(id), company: id, name: id, fit: id === "excluded" ? "no" as const : "yes" as const }));
  const reply = (leadId: string, answer: string, version = "current", statement = "Saved statement") => ({ leadId, answer, version, statement, at: "2026-11-09T00:00:00Z" });
  const context: FlowContext = { locale: "en", proofs: [], actions: [action("01-1", { kind: "conversation", market: "TW", records: leads }), action("01-2", { ...emptyFlowData("organize") as Extract<FlowData, { kind: "organize" }>, values: { positioning: "Saved statement" } }, { positioningVersion: "current", links: [{ hash: "secret" }], responses: [reply("yes", "yes"), reply("no", "no"), reply("old", "yes", "old-version"), reply("wrong", "yes", "current", "Other wording"), reply("foreign-plan", "yes"), reply("excluded", "yes")] })] };
  const result = positioningReplies(context);
  assert.equal(result.length, 5);
  assert.deepEqual(result.slice(0, 2).map(r => r.answer), ["yes", "no"]);
  assert(result.slice(2).every(r => r.answer === null && r.at === null));
  assert(result.every(r => Object.keys(r).sort().join(",") === "answer,at,leadId"));
  context.actions[1].taskFinding = null;
  assert(positioningReplies(context).every(r => r.answer === null));
  assert.deepEqual(positioningReplies({ locale: "en", proofs: [], actions: [] }), []);
});
