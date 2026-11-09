import test from 'node:test';
import assert from 'node:assert/strict';
import { planText, planUnit, displayTaskReference } from '../src/lib/action-plan/display';
import { MILESTONES, STEPS } from '../src/lib/action-plan/flow/catalog';
import { workspaceKind } from '../src/lib/action-plan/workspace';

const sample = [
  ['Validate ICP through structured customer discovery', '透過結構化客戶訪談，驗證目標客戶輪廓'],
  ['Run paid pilot offer with 3 prospects to test willingness to pay', '向 3 位潛在客戶提出付費試用，驗證付費意願'],
  ['At least 1 of 3 prospects agrees to a paid pilot, confirming a validated willingness-to-pay price point.', '在 3 位潛在客戶中，至少 1 位同意付費試用，確認對方接受的試用價格。'],
];
test('Screenshot system phrases translate exactly and English remains byte-identical', () => {
  for (const [en, zh] of sample) { assert.equal(planText(en, 'zh-tw'), zh); assert.equal(planText(en, 'en'), en); }
  assert.equal(planText('  Run paid pilot offer with 12 prospects to test willingness to pay. ', 'zh-tw'), '向 12 位潛在客戶提出付費試用，驗證付費意願');
  assert.equal(planText('At least 2 of 12 prospects agree to a paid pilot.', 'zh-tw'), '在 12 位潛在客戶中，至少 2 位同意付費試用，確認對方接受的試用價格。');
});
test('Every fixed milestone and step uses the existing Traditional Chinese catalog', () => {
  for (const [zh, en] of [...MILESTONES, ...STEPS.flatMap(s => [s.title, s.criteria, s.guide])]) {
    assert.equal(planText(en, 'zh-tw'), zh); assert.equal(planText(en, 'en'), en); assert.equal(planText(zh, 'zh-tw'), zh);
  }
});
test('Unknown content and quoted or embedded text are never partially rewritten', () => {
  for (const text of ['Make 1M', 'company', 'records', 'statement', 'Vivian and Eric', 'Dropbox', 'My own revised market plan', 'Customer said: Run paid pilot offer with 3 prospects', 'Run paid pilot offer with 3 prospects for Acme', 'At least 1 of 3 prospects agrees and has paid USD 300.', '原始定位與受訪者原話']) assert.equal(planText(text, 'zh-tw'), text);
});
test('Localized dependency references preserve identity, quantities and workflow inference', () => {
  const action = { id: 'original-task', clientKey: 'task_3', title: sample[1][0], displayNumber: 3, milestonePosition: 1, crossMilestone: true, minimumCurrent: 1, metricCurrent: 0, metricUnit: 'companies' };
  const before = JSON.stringify(action);
  assert.equal(displayTaskReference(action, 'zh-tw'), '里程碑 2 · #3 · 向 3 位潛在客戶提出付費試用，驗證付費意願 (0/1 家公司)');
  assert.equal(planUnit('companies', 'zh-tw'), '家公司'); assert.equal(planUnit('companies', 'en'), 'companies');
  assert.equal(JSON.stringify(action), before); assert.equal(workspaceKind(action), 'pilot');
  assert.equal(displayTaskReference(action, 'en'), 'Milestone 2 · #3 · '+sample[1][0]+' (0/1 companies)');
});
