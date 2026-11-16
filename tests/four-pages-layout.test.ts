import test from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pdfRuntime } from "./helpers/pdf-runtime";
import type { ActionPlanDto } from "../src/lib/action-plan/service";
import { MILESTONES, STEPS, flowKey, words } from "../src/lib/action-plan/flow/catalog";

test("Business plan uses actual milestone order and current task count, omits criteria prose and preserves print and private-data boundaries", async () => {
  for (const locale of ["en", "zh-tw"]) for (const version of [1,2]) {
    const counts = version === 2 ? [4,3,3,3,3] : [5,0,0,0,0];
    const milestones = counts.map((total,i) => ({ id: "m"+i, position: i, title: "SAVED_MILESTONE_"+i, targetDate: `2027-0${i+1}-15`, status: i ? "blocked" : "active", total, done: i ? 0 : 1 }));
    const actions = counts.flatMap((count,i) => Array.from({ length: count },(_,j) => ({ id: i+"-"+j, title: `SAVED_TASK_${i}_${j}`, clientKey: version === 2 ? flowKey(STEPS.filter(s => s.milestone === i)[j].id) : "legacy_"+j, milestoneId: "m"+i, done: i === 0 && j === 0, dependency: { blocked: i > 0 || j > 1 }, expectedOutcome: { text: "PRIVATE_CRITERIA_PROSE" } })));
    const plan = { id: "owned", workflowVersion: version, actions, roadmap: { goal: "SAVED_REVENUE_GOAL", deadline: "2027-10-02", milestones } } as unknown as ActionPlanDto;
    const before = JSON.stringify(plan);
    const load = pdfRuntime({ "server-only": {}, "next/link": { __esModule: true, default: "a" },
      "@/lib/auth/account": { getCurrentAccount: async () => ({ id: "owner", profile: { companyName: "NOVA AI", oneLinePitch: "Be the bold ones", country: "TW", industry: "saas", icp: "SAVED_ICP" } }) },
      "@/lib/network/access": { features: async () => ({ portal: true }) }, "@/lib/action-plan/service": { getActiveActionPlan: async () => plan },
      "@/lib/validation/service": { validationSnapshot: async () => ({ rows: [], summary: { paid: 2, signed: 1 } }) },
      "@/lib/prisma": { prisma: { discoveryJourney: { findUnique: async () => null } } },
      "@/components/dashboard/network/NetworkPanels": { PrintPlan: () => React.createElement("button", null, "PRINT_PDF") },
    });
    const Page = load<typeof import("../src/app/[locale]/dashboard/(shell)/business-plan/page")>("src/app/[locale]/dashboard/(shell)/business-plan/page.tsx").default;
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({locale}) }));
    assert.match(html,/SAVED_REVENUE_GOAL/); assert.match(html,/2027-10-02/); assert.match(html,/PRINT_PDF/); assert.match(html,/SAVED_ICP/);
    assert.match(html,new RegExp(`max="${actions.length}" value="1"`));
    for (const m of milestones) { assert(html.includes(version === 2 ? words(MILESTONES[m.position],locale) : m.title)); assert(html.includes(m.targetDate)); }
    for (const a of actions) {
      const title = version === 2 ? words(STEPS.find(s => flowKey(s.id) === a.clientKey)!.title,locale) : a.title;
      assert.equal(html.includes(title), a.milestoneId === "m0");
      assert.equal(html.includes("/dashboard/agenda#action-"+a.id), a.milestoneId === "m0" && (a.done || !a.dependency.blocked));
    }
    assert.match(html, new RegExp(`1 / ${counts[0]}`)); assert.doesNotMatch(html,/PRIVATE_CRITERIA_PROSE/);
    assert(html.includes("Validation evidence") || html.includes("驗證成果")); assert(html.includes("Exporting does not automatically") || html.includes("不會自動開放投資人分享"));
    assert.equal(JSON.stringify(plan),before);
  }
});

test("Roundtable grouped form supports 4/6/8/10, preserves an existing five-seat session and uses real values", () => {
  for (const locale of ["en","zh-tw"]) {
    const load = pdfRuntime({react:{...React,useState:(value:unknown)=>[value,()=>{}],useEffect(){},useRef:()=>({current:false})},"next-intl":{useLocale:()=>locale}});
    const {SessionForm} = load<typeof import("../src/components/dashboard/roundtables/Forms")>("src/components/dashboard/roundtables/Forms.tsx");
    const props = {userId:"qa",disabled:false,write:async()=>false};
    const html = renderToStaticMarkup(React.createElement(SessionForm,props));
    for (const count of [4,6,8,10]) assert.match(html,new RegExp(`aria-label="(?:人數上限（含主持人）|Capacity \\(including host\\)) · ${count}"`));
    assert.match(html,/Topic settings|主題設定/);assert.match(html,/Time settings|時間設定/);assert.match(html,/Registration and link|報名與連結/);
    const saved = renderToStaticMarkup(React.createElement(SessionForm,{...props,initial:{id:"saved",revision:2,topic:"Actual saved topic",description:"Actual saved preparation",steps:["01-1"],industry:"saas",languages:["en"],startsAt:"2027-01-15T02:00:00Z",endsAt:"2027-01-15T04:00:00Z",timezone:"Asia/Taipei",frameworkStages:[2,3],capacity:5,registrationMode:"instant",meetingUrl:"https://meet.google.com/saved"}}));
    assert.match(saved,/Actual saved topic/);assert.match(saved,/· 5"[^>]*checked=""/);assert.match(saved,/· 120 (?:分|min)"[^>]*checked=""/);
    assert(!saved.includes("Series sessions") && !saved.includes("系列場次"));
  }
});

test("Existing discovery priority cards omit criteria prose while retaining actual progress and saved-conversation access", () => {
  for (const locale of ["en", "zh-tw"]) {
    let calls = 0;
    const snapshot = { journeyId: "owned", paid: true, active: true, canCreate: false, total: 2, target: 10, version: 1 };
    const load = pdfRuntime({
      react: { ...React, useState: (value: unknown) => [calls++ === 0 ? snapshot : value, () => {}], useEffect() {}, useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }) },
      "next-intl": { useLocale: () => locale }, "next/link": { __esModule: true, default: "a" },
      "@/lib/discovery/policy": { discoveryReportSchema: { safeParse: () => ({}) } },
      ...Object.fromEntries(["../PersonalizationQuestions", "../CustomerDiscovery", "../prospecting/ProspectSearch", "../ValidationWorkspace", "../LearningResources", "./FounderOffer", "../ActionPlanBuilder", "../NextStepsTour"].map(name => [name, { __esModule: true, default: () => null, PersonalizationSummary: () => null }])),
    });
    const { default: Card } = load<typeof import("../src/components/dashboard/discovery/DiscoveryJourney")>("src/components/dashboard/discovery/DiscoveryJourney.tsx");
    const html = renderToStaticMarkup(React.createElement(Card, { userId: "owner" }));
    assert.doesNotMatch(html, /Completion criteria|完成標準|Save valid conversations with/);
    assert.match(html, /2 \/ 10/); assert.match(html, /value="2" max="10"/);
    assert.match(html, /href="#discovery-record-owned"/);
    assert.equal(snapshot.target, 10); assert.equal(snapshot.total, 2);
  }
});


test("Home evidence removes the stage card while keeping its task, weekly evidence, errors and profile entry", () => {
  for (const locale of ["en", "zh-tw"]) {
    let slot = 0;
    const load = pdfRuntime({ react: { ...React, useState: (initial: unknown) => [slot++ === 0 ? { state: { hypotheses: [], selectedId: null }, result: { stage: 1 }, weekly: { conversations: 0, findings: 0, commitments: 0 } } : initial, () => {}], useEffect() {}, useRef: () => ({ current: null }), useCallback: (fn: unknown) => fn }, "next-intl": { useLocale: () => locale }, "@/lib/member-fetch": {} });
    const Evidence = load<typeof import("../src/components/dashboard/evidence/EvidencePanel")>("src/components/dashboard/evidence/EvidencePanel.tsx").default;
    const html = renderToStaticMarkup(React.createElement(Evidence, { userId: "owner", compact: true, homeTask: React.createElement("section", null, "SAVED_PRIORITY") }));
    assert(!html.includes("Stage 1:") && !html.includes("你目前在第"));
    assert(html.includes("SAVED_PRIORITY") && html.includes("home-weekly-title"));
    assert(html.includes("/dashboard/profile"));
  }
});
