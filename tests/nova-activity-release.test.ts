import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { Children, isValidElement, type ReactNode } from "react";
import ts from "typescript";
import { homeNextStep, matchmakingTab, MATCHMAKING_TABS } from "../src/lib/dashboard/home";
import type { ActionPlanDto } from "../src/lib/action-plan/service";
import type { getDiscoverySnapshot } from "../src/lib/discovery/service";

type Discovery = Awaited<ReturnType<typeof getDiscoverySnapshot>>;
const discovery = (patch: Partial<Discovery> = {}) => ({ active: true, needsSetup: true, total: 0, target: 3, setup: null, ...patch }) as Discovery;
const action = { id: "ready", title: "Saved task", done: false, dependency: { blocked: false } } as ActionPlanDto["actions"][number];
const plan = (patch: Partial<ActionPlanDto> = {}) => ({ id: "saved", actions: [action], nextMoves: [action], blockers: [], roadmap: null, ...patch }) as ActionPlanDto;

test("Home chooses one real ready task; expired access cannot reveal a saved paid task", () => {
  const paid = plan();
  assert.equal(homeNextStep({ isPaying: true, plan: paid, discovery: null }).href, "/dashboard/agenda#action-ready");
  for (const trial of [null, discovery({ active: false })]) {
    const next = homeNextStep({ isPaying: false, plan: paid, discovery: trial });
    assert.equal(next.kind, "upgrade"); assert.equal(next.href, "/dashboard/account#plan"); assert.equal(next.action, undefined);
  }
  const blocked = { ...action, dependency: { ...action.dependency, blocked: true } };
  assert.equal(homeNextStep({ isPaying: true, plan: plan({ actions: [blocked], nextMoves: [blocked] }), discovery: null }).kind, "blocked");
  assert.equal(homeNextStep({ isPaying: true, plan: plan({ actions: [{ ...action, done: true }], nextMoves: [] }), discovery: null }).kind, "complete");
  assert.equal(homeNextStep({ isPaying: true, plan: plan({ actions: [], nextMoves: [] }), discovery: null }).kind, "blocked");
  const completedFlow = plan({ workflowVersion: 2, actions: [{ ...action, done: true }], nextMoves: [] });
  assert.equal(homeNextStep({ isPaying: true, plan: completedFlow, discovery: null }).href, "/dashboard/agenda#flow-report");
  assert.equal(homeNextStep({ isPaying: true, plan: { ...completedFlow, workflowNeedsReview: true }, discovery: null }).href, "/dashboard/agenda#flow-evidence");

});

test("Home preserves trial setup, actual evidence and the paid five-question starting route", () => {
  const pick = (trial: Discovery) => homeNextStep({ isPaying: false, plan: null, discovery: trial });
  assert.equal(pick(discovery()).kind, "setup");
  assert.equal(pick(discovery({ needsSetup: false, total: 2 })).kind, "conversation");
  assert.equal(pick(discovery({ needsSetup: false, total: 3 })).href, "/dashboard/agenda#prospects");
  assert.equal(homeNextStep({ isPaying: true, plan: null, discovery: null }).href, "/dashboard/agenda?guide=build");
  for (const status of ["awaiting", "unplanned"] as const) {
    const roadmap = { milestones: [{ id: "m1", status, achievedAt: null }] } as ActionPlanDto["roadmap"];
    const next = homeNextStep({ isPaying: true, plan: plan({ actions: [], nextMoves: [], roadmap }), discovery: null });
    assert.equal(next.kind, status === "awaiting" ? "outcome" : "next"); assert.equal(next.href, "/dashboard/agenda#current-outcome");
  }
});

function load<T>(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const req = createRequire(import.meta.url), loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { module: loaded, exports: loaded.exports, URL, URLSearchParams, console, ...globals, require: (id: string) => id in mocks ? mocks[id] : req(id) });
  return loaded.exports as T;
}
const intl = { useLocale: () => "zh-tw", setRequestLocale() {} };

test("Four canonical tabs and legacy aliases remain deterministic", () => {
  assert.deepEqual(MATCHMAKING_TABS, ["recommendations", "all", "roundtables", "messages"]);
  for (const value of [undefined, "members", "invalid"]) assert.equal(matchmakingTab(value), "recommendations");
  assert.equal(matchmakingTab("sharing"), "messages");
  assert.equal(matchmakingTab("all"), "all");
});

test("Legacy messages preserve encoded connection IDs; old prospect links reach today's search", async () => {
  const paths: string[] = [];
  const mocks = {
    "next/navigation": { redirect: (href: string) => { paths.push(href); throw new Error("redirect"); } },
    "next-intl/server": intl,
    "@/lib/auth/guard": { requireUserPage: async () => ({ uid: "owner" }) },
    "@/lib/routes": { pathForLocale: (path: string, locale: string) => locale === "zh-tw" ? `/zh-tw${path}` : path },
    "@/components/dashboard/matchmaking/MatchmakingWorkspace": { default: () => null },
  };
  const messages = load<{ default(p: object): Promise<unknown> }>("src/app/[locale]/dashboard/(shell)/messages/page.tsx", mocks);
  await assert.rejects(messages.default({ params: Promise.resolve({ locale: "zh-tw" }), searchParams: Promise.resolve({ connection: "saved/id?x=1" }) }), /redirect/);
  const url = new URL(paths[0]!, "https://example.test");
  assert.equal(url.pathname, "/zh-tw/dashboard/matchmaking"); assert.equal(url.searchParams.get("tab"), "messages"); assert.equal(url.searchParams.get("connection"), "saved/id?x=1");
  const members = load<{ default(p: object): Promise<unknown> }>("src/app/[locale]/dashboard/(shell)/matchmaking/page.tsx", mocks);
  await assert.rejects(members.default({ params: Promise.resolve({ locale: "en" }), searchParams: Promise.resolve({ tab: "prospects" }) }), /redirect/);
  assert.equal(paths.at(-1), "/dashboard/agenda#prospects");
});

test("Action map starts closed, claims each real transition once and isolates members and plans", () => {
  const saved = new Map<string, string>(), details = { open: false }, effects: Array<() => unknown> = [];
  const MapComponent = load<{ default(p: object): ReactNode }>("src/components/dashboard/ActionMap.tsx", {
    react: { useRef: () => ({ current: details }), useState: (v: unknown) => [v, () => {}], useEffect: (fn: () => unknown) => effects.push(fn) }, "next-intl": intl,
  }, { window: { location: { hash: "" }, addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: (key: string) => saved.get(key), setItem: (key: string, value: string) => saved.set(key, value) }, setTimeout: (fn: () => void) => { fn(); return 1; }, clearTimeout() {} });
  function render(userId: string, id: string, event: string | null) { effects.length = 0; MapComponent.default({ userId, plan: plan({ id }), event, children: null }); effects.forEach(fn => fn()); }
  render("one", "p1", null); assert.equal(details.open, false);
  render("one", "p1", "goal:p1"); assert.equal(details.open, true);
  details.open = false; render("one", "p1", "goal:p1"); assert.equal(details.open, false);
  render("one", "p1", "milestone:m1"); assert.equal(details.open, true);
  details.open = false; render("two", "p1", "milestone:m1"); assert.equal(details.open, true);
  details.open = false; render("one", "p2", "milestone:m1"); assert.equal(details.open, true);
  assert.equal(saved.size, 4);
});

type NodeProps = { children?: ReactNode; href?: string; role?: string; id?: string; active?: boolean; embedded?: boolean; onClick?: () => void; onUnreadChange?: (n: number) => void; onKeyDown?: (e: object) => void };
function nodes(root: ReactNode) {
  const result: Array<{ type: unknown; props: NodeProps }> = [];
  function visit(node: ReactNode) { Children.forEach(node, child => { if (isValidElement<NodeProps>(child)) { result.push(child); visit(child.props.children); } }); }
  visit(root); return result;
}
test("Switching tabs retains the mounted inbox, marks it inactive and supports keyboard navigation", () => {
  const state: unknown[] = []; let cursor = 0, currentUrl = "https://example.test/zh-tw/dashboard/matchmaking?tab=messages&connection=saved";
  const Inbox = () => null;
  const workspace = load<{ default(p: object): ReactNode }>("src/components/dashboard/matchmaking/MatchmakingWorkspace.tsx", {
    react: { useCallback: (fn: unknown) => fn, useEffect() {}, useState: (initial: unknown) => { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], (value: unknown) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } },
    "next-intl": intl, "next/link": { default: "a" }, "./MatchmakingPage": { default: () => null }, "./RoundtablesPanel": { default: () => null },
    "../network/NetworkPanels": { MessagesPage: Inbox, useNetwork: () => ({ value: { enabled: false } }) },
    "@/lib/member-fetch": {}, "@/lib/dashboard/home": { MATCHMAKING_TABS, matchmakingTab }, "@/lib/routes": { pathForLocale: (path: string) => path },
  }, { window: { location: { get href() { return currentUrl; } }, history: { replaceState: (_: unknown, __: unknown, path: string) => { currentUrl = new URL(path, currentUrl).href; } } }, document: { getElementById: () => ({ focus() {} }) } });
  function render() { cursor = 0; return nodes(workspace.default({ userId: "owner", initialTab: "messages" })); }
  let tree = render(); assert.equal(tree.find(n => n.type === Inbox)?.props.active, true);
  tree.find(n => n.type === Inbox)!.props.onUnreadChange!(3);
  tree = render(); assert.match(JSON.stringify(tree.find(n => n.props.id === "matchmaking-tab-messages")?.props.children), /3/);
  tree.find(n => n.props.id === "matchmaking-tab-roundtables")!.props.onClick!();
  tree = render(); assert.equal(tree.find(n => n.type === Inbox)?.props.active, false); assert.equal(new URL(currentUrl).searchParams.get("connection"), "saved");
  tree.find(n => n.props.id === "matchmaking-tab-roundtables")!.props.onKeyDown!({ key: "End", preventDefault() {} });
  assert.equal(render().find(n => n.type === Inbox)?.props.active, true);
});

test("Inactive roundtable panel starts no requests; visible panel loads actual server records", async () => {
  const calls: string[] = [], effects: Array<() => unknown> = [];
  const component = load<{ default(p: object): ReactNode }>("src/components/dashboard/matchmaking/RoundtablesPanel.tsx", {
    react: { useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }), useEffect: (fn: () => unknown) => effects.push(fn), useState: (value: unknown) => [value, () => {}] },
    "next-intl": intl, "next/link": { default: "a" },
    "@/lib/member-fetch": { memberFetch: async (path: string) => { calls.push(path); return { sessions: [] }; } },
    "@/lib/routes": { pathForLocale: (path: string) => path }, "@/lib/roundtables/schema": { INDUSTRIES: [], LANGUAGES: [] },
    "@/lib/action-plan/flow/catalog": { STEPS: [] }, "@/lib/member-options": {},
    "../flow/Templates": {}, "../roundtables/Forms": {},
  }, { window: { location: { href: "https://nova.test/dashboard/matchmaking?tab=roundtables" } }, setTimeout, clearTimeout, AbortController });
  component.default({ userId: "owner", active: false }); effects.splice(0).forEach(fn => fn());
  await new Promise(r => setTimeout(r, 10)); assert.equal(calls.length, 0);
  component.default({ userId: "owner", active: true }); effects.splice(0).forEach(fn => fn());
  await new Promise(r => setTimeout(r, 10)); assert.deepEqual(calls, ["/api/roundtables"]);
});

test("An inactive inbox starts no requests or polling; activating it resumes real inbox data", async () => {
  const calls: string[] = [], effects: Array<() => unknown> = [], timers: number[] = [];
  let cursor = 0;
  const network = { enabled: true, network: true, invite: true, portal: false };
  const component = load<{ MessagesPage(p: object): ReactNode }>("src/components/dashboard/network/NetworkPanels.tsx", {
    react: { useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }), useEffect: (fn: () => unknown) => effects.push(fn), useState: (value: unknown) => [cursor++ === 0 ? network : value, () => {}] },
    "next-intl": intl, "next/navigation": { useSearchParams: () => ({ get: () => null }) }, "next/link": { default: "a" },
    "./ViewerOverview": { default: () => null }, "../matchmaking/CardView": { PrivatePhoto: () => null },
    "@/lib/routes": { pathForLocale: (path: string) => path }, "@/lib/network/policy": {},
    "@/lib/member-fetch": { memberFetch: async (path: string) => { calls.push(path); return path.endsWith("connections") ? [] : path.endsWith("features") ? network : { workspaces: [] }; } },
  }, { document: { visibilityState: "visible" }, setInterval: (_: unknown, delay: number) => { timers.push(delay); return 1; }, clearInterval() {}, setTimeout, clearTimeout });
  component.MessagesPage({ active: false, embedded: true }); effects.forEach(fn => fn());
  await Promise.resolve(); assert.equal(calls.length, 0); assert.equal(timers.length, 0);
  cursor = 0; effects.length = 0;
  component.MessagesPage({ active: true, embedded: true }); effects.forEach(fn => fn());
  await Promise.resolve(); await Promise.resolve();
  assert(calls.includes("/api/network/connections")); assert(timers.includes(15000));
});

test("Home renders one primary task in both languages with locale-correct destinations", async () => {
  const saved = plan({ actions: [{ ...action, expectedOutcome: { text: "Three customers confirmed the positioning" } } as ActionPlanDto["actions"][number]] });
  saved.nextMoves = saved.actions;
  const page = load<{ default(p: object): Promise<ReactNode> }>("src/app/[locale]/dashboard/(shell)/page.tsx", {
    "next/link": { default: "a" }, "next-intl/server": intl,
    "@/lib/auth/guard": { requireUserPage: async () => ({ uid: "owner" }) },
    "@/lib/auth/account": { getCurrentAccount: async () => ({ id: "owner", firstName: "QA" }) },
    "@/lib/billing/gate": { getEffectivePlan: () => "business" },
    "@/lib/action-plan/service": { getActiveActionPlan: async () => saved },
    "@/lib/action-plan/personalization": {}, "@/lib/discovery/service": {}, "@/lib/discovery/policy": { isDiscoveryMember: () => false },
    "@/lib/dashboard/home": { homeNextStep }, "@/lib/dashboard/next-steps": { actionProgress: () => 0 },
    "@/lib/cms/content": { getEvents: async () => [] },
    "@/lib/routes": { pathForLocale: (path: string, locale: string) => locale === "zh-tw" ? `/zh-tw${path}` : path },
    ...Object.fromEntries(["PlanRefresh", "home/FounderRecommendations", "matchmaking/RoundtablesPanel", "home/UpcomingEventsRail"].map(name => [`@/components/dashboard/${name}`, { default: () => null }])),
  });
  for (const locale of ["en", "zh-tw"]) {
    const tree = nodes(await page.default({ params: Promise.resolve({ locale }) }));
    assert.equal(tree.filter(n => n.type === "h1").length, 1);
    const main = tree.find(n => n.props.id === "home-task-title");
    assert.equal(main?.props.children, "Saved task");
    const links = tree.filter(n => n.type === "a");
    assert.equal(links.filter(n => n.props.href === `${locale === "en" ? "" : "/zh-tw"}/dashboard/agenda#action-ready`).length, 1);
    assert.match(JSON.stringify(tree), locale === "en" ? /Continue today's task/ : /繼續今日任務/);
  }
});
