import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as guide from "../src/lib/guided-questions";
import { EMPTY_GUESS, icpToGuess, guessToIcp } from "../src/lib/icp/discovery";
import { EMPTY_ICP } from "../src/lib/icp/schema";
import { emptyInsight, insightDraftSchema, insightSchema } from "../src/lib/customer-insights/schema";

test("Guidance skips known or explicitly skipped answers, and validates restored progress", () => {
  const questions = [{ id: "known", value: "Already supplied" }, { id: "unknown", value: "  " }, { id: "covered", value: "", ask: false }];
  assert.equal(guide.nextGuidedQuestion(questions), "unknown");
  assert.equal(guide.nextGuidedQuestion(questions, ["unknown"]), null);
  assert.deepEqual(guide.readGuidedProgress({ questionId: null, skipped: ["unknown"] }), { questionId: null, skipped: ["unknown"] });
  for (const value of [null, {}, { questionId: 3, skipped: [] }, { questionId: null, skipped: [3] }]) assert.equal(guide.readGuidedProgress(value), undefined);
});

test("ICP carries known fields over without inferring customer geography or clearing skipped answers", () => {
  const saved = { ...EMPTY_ICP, summary: "A reviewed customer description with additional context", who: "Founders", problem: "Reporting takes too long", workaround: "Spreadsheets", location: "Customer market", stage: "Customer stage", channels: "Referrals" };
  const copied = structuredClone(saved);
  assert.deepEqual(icpToGuess(saved), { customer: saved.who, struggle: saved.problem, situation: "", workaround: saved.workaround });
  assert.deepEqual(guessToIcp(EMPTY_GUESS, saved), saved, "Skipping every question preserves the complete saved version");
  assert.deepEqual(guessToIcp({ customer: "  ", struggle: "\n", situation: " ", workaround: " " }, saved), saved, "Whitespace is an unknown answer, not permission to clear saved data");
  const changed = guessToIcp({ ...EMPTY_GUESS, struggle: "New explicitly supplied problem" }, saved);
  assert.equal(changed.who, saved.who); assert.equal(changed.workaround, saved.workaround);
  assert.equal(changed.location, saved.location); assert.equal(changed.channels, saved.channels); assert.equal(changed.stage, saved.stage);
  assert.equal(changed.problem, "New explicitly supplied problem");
  assert.equal(icpToGuess(null).customer, ""); assert.equal(guessToIcp(EMPTY_GUESS).location, "");
  assert.deepEqual(saved, copied, "Draft preparation never mutates the saved object");
});

test("Incomplete interview drafts resume, unknown names stay blank, and saved progress requires real evidence", () => {
  const blank = emptyInsight("discover");
  assert(insightDraftSchema.safeParse({ ...blank, journeyId: "journey", company: "Acme" }).success);
  assert(!insightSchema.safeParse(blank).success);
  assert(!insightSchema.safeParse({ ...blank, journeyId: "journey", company: "Acme" }).success);
  const note = { ...blank, journeyId: "journey", company: "Acme", notes: "Their actual words" };
  const saved = insightSchema.parse(note);
  assert.equal(saved.name, ""); assert.equal(saved.notes, note.notes);
  assert(!insightDraftSchema.safeParse({ ...note, answers: ["Wrong number of answers"] }).success);
  assert(!insightDraftSchema.safeParse({ ...note, notes: 3 }).success);
  assert(!insightSchema.safeParse({ ...note, actionId: "task" }).success);
  const priceDraft = { ...note, commercial: { amount: "12.", currency: "T" } };
  assert(insightDraftSchema.safeParse(priceDraft).success, "An unfinished price must not prevent resuming all the interview answers");
  assert(!insightSchema.safeParse(priceDraft).success, "The final write still validates the amount and currency");
});

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Element;
  return [el, ...elements(el.props.children)];
}

test("Both languages show one question, allow skip/edit, and confirm only from the final summary", () => {
  const require = createRequire(import.meta.url);
  for (const locale of ["zh-tw", "en"]) {
    let state: unknown, confirmations = 0;
    const changes: guide.GuidedProgress[] = [];
    const loaded = { exports: {} as { default: (props: Record<string, unknown>) => Element } };
    runInNewContext(ts.transpileModule(readFileSync("src/components/dashboard/GuidedQuestions.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: loaded, exports: loaded.exports,
      require: (id: string) => {
        if (id === "@/lib/guided-questions") return guide;
        if (id === "next-intl") return { useLocale: () => locale };
        if (id === "react") return { useEffect() {}, useId: () => "guide-title", useRef: () => ({ current: null }), useState: (initial: () => unknown) => { if (state === undefined) state = initial(); return [state, (next: unknown) => { state = next; }]; } };
        return require(id);
      },
    });
    const questions = [
      { id: "known", value: "Already answered", label: "Known", input: { type: "input", props: {} } },
      { id: "first", value: "", label: "First unknown", input: { type: "textarea", props: {} } },
      { id: "second", value: "", label: "Second unknown", input: { type: "textarea", props: {} } },
    ];
    const props = { questions, onProgress: (value: guide.GuidedProgress) => changes.push(value), onConfirm: () => confirmations++, confirmLabel: "Save" };
    const render = (extra = {}) => loaded.exports.default({ ...props, ...extra });
    const submit = (view: Element) => (view.props.onSubmit as (event: object) => void)({ preventDefault() {} });
    const skip = (view: Element) => {
      const el = elements(view).find(el => el.type === "button" && el.props.children === (locale === "zh-tw" ? "不知道／跳過" : "Not sure / skip"));
      assert(el); (el.props.onClick as () => void)();
    };
    let view = render();
    assert.equal(elements(view).filter(el => el.type === "textarea").length, 1);
    assert.equal(elements(view).find(el => el.type === "h3")?.props.children, "First unknown");
    questions[1].value = "Answer typed before skipping";
    skip(render()); assert.equal(confirmations, 0);
    view = render(); assert.equal(elements(view).find(el => el.type === "h3")?.props.children, "Second unknown");
    skip(view); view = render();
    assert.equal(elements(view).filter(el => el.type === "textarea").length, 0);
    assert.equal(questions[1].value, "Answer typed before skipping");
    assert.equal(confirmations, 0);
    const edit = elements(view).find(el => el.props["aria-label"] === `${locale === "zh-tw" ? "修改" : "Edit"}: Known`)!;
    (edit.props.onClick as () => void)(); view = render();
    assert.equal(elements(view).find(el => el.type === "h3")?.props.children, "Known");
    submit(view); assert.equal(confirmations, 0);
    submit(render({ disabled: true })); assert.equal(confirmations, 0);
    submit(render({ confirmDisabled: true })); assert.equal(confirmations, 0);
    submit(render()); assert.equal(confirmations, 1);
    const review = render({ reviewTitle: "Custom insight confirmation" });
    assert.equal(elements(review).find(el => el.type === "h3")?.props.children, "Custom insight confirmation");
    assert.equal(elements(render()).find(el => el.type === "h3")?.props.children, locale === "zh-tw" ? "確認內容後再儲存" : "Review before saving");
    const restored = changes.at(-1)!; state = undefined;
    view = render({ initialProgress: restored });
    assert.equal(elements(view).filter(el => el.type === "textarea" || el.type === "input").length, 0, "Reload stays on the review screen");
  }
});

test("Customer insight guidance maps single-page fields to existing data and preserves legacy stages", () => {
  const require = createRequire(import.meta.url);
  for (const locale of ["zh-tw", "en"]) {
    let index = 0;
    const initial = { ...emptyInsight("discover"), journeyId: "journey", company: "Acme", role: "CTO", notes: "Historical raw notes", answers: ["Spreadsheet", "3 hours", "Founder", "Friday"] };
    const states: unknown[] = [initial, "", "", false, true, false, null, undefined, 0];
    const loaded = { exports: {} as { default: (props: Record<string, unknown>) => Element } };
    runInNewContext(ts.transpileModule(readFileSync("src/components/dashboard/CustomerDiscovery.tsx", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText, {
      module: loaded, exports: loaded.exports, localStorage: { setItem() {} },
      require: (id: string) => {
        if (id === "react") return { useEffect() {}, useRef: (current: unknown) => ({ current }), useState: () => { const slot = index++; return [states[slot], (next: unknown) => { states[slot] = next; }]; } };
        if (id === "next-intl") return { useLocale: () => locale };
        if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
        if (id === "@/lib/customer-insights/schema") return require("../src/lib/customer-insights/schema");
        if (id === "@/lib/guided-questions") return guide;
        if (id === "@/lib/routes") return { pathForLocale: (path: string) => path };
        if (id === "@/lib/action-plan/workspace") return { workspaceKind: () => "interview" };
        if (id === "./GuidedQuestions") return { default: "GuidedQuestions" };
        if (id.startsWith("@/") || id.startsWith("./")) return {};
        return require(id);
      },
    });
    const render = () => { index = 0; return elements(loaded.exports.default({ userId: "qa", journeyId: "journey", rows: [], outcomes: [] })).find(el => el.type === "GuidedQuestions")!; };
    type Question = { id: string; label: string; value: string; ask?: boolean; input: Element };
    let view = render(), questions = view.props.questions as Question[];
    assert.deepEqual(Array.from(questions, q => q.id), ["company", "name", "date", "fit", "willingness", "notes", "answer-0", "answer-1", "price", "answer-2", "answer-3"]);
    assert.equal(view.props.reviewTitle, locale === "zh-tw" ? "確認本次客戶洞察" : "Confirm this customer insight");
    assert.equal(view.props.confirmLabel, locale === "zh-tw" ? "儲存洞察" : "Save insight");
    assert(questions.filter(q => q.id.startsWith("answer-")).every(q => q.ask), "Writing the problem must not skip the other requested prompts");
    assert.equal(view.props.flat, true);
    assert.equal(questions.find(q=>q.id === "company")!.value, "Acme · CTO");
    assert.equal(questions.find(q=>q.id === "notes")!.value, initial.notes);
    const priceInputs = elements(questions.find(q=>q.id === "price")!.input).filter(el => el.type === "input");
    (priceInputs[0].props.onChange as (e: unknown) => void)({ target: { value: "125.50" } });
    view = render(); questions = view.props.questions as Question[];
    assert.equal(questions.find(q=>q.id === "price")!.value, "125.50");
    const saved = insightSchema.parse(states[0]);
    assert.equal(saved.commercial?.amount, "125.50");
    assert.equal(saved.commercial?.willingness, undefined, "A price is not consent to pay");
    assert.deepEqual(saved.answers, initial.answers); assert.equal(saved.notes, initial.notes); assert.equal(saved.role, initial.role);
    states[0] = { ...emptyInsight("mvp"), company: "Legacy MVP", notes: "Old MVP notes" };
    questions = render().props.questions as Question[];
    assert(!questions.some(q => q.id === "price"));
    assert.equal(questions.find(q=>q.id === "answer-0")!.label, locale === "zh-tw" ? "試用了什麼" : "What they tried");
    assert.equal(questions.find(q=>q.id === "answer-0")!.ask, false, "Other stages retain their original note-based guidance");
  }
});
