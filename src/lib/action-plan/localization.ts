import { createHash } from 'node:crypto';
import type { ActionPlanDto } from './service';
import { planText, planUnit } from './display';

export type PlanCopy = { status: 'ready' | 'missing' | 'pending'; sourceHash: string; strings: Record<string, string> };

export function translationSource(plan: ActionPlanDto, locale: 'en' | 'zh-tw') {
  const values = new Set<string>();
  const add = (...items: Array<string | null | undefined>) => items.forEach(value => {
    if (!value?.trim() || planText(value, locale) !== value || planUnit(value, locale) !== value) return;
    if (locale === 'en' ? /\p{Script=Han}|\binterview(?:s|ee|ees)?\b/iu.test(value) : /[A-Za-z]/.test(value) && !/\p{Script=Han}/u.test(value)) values.add(value);
  });
  add(plan.diagnosis.stageReason, plan.diagnosis.bottleneckReason);
  for (const m of plan.roadmap?.milestones || []) add(m.title, m.expectedOutcome, m.acceptanceCriteria);
  for (const a of plan.actions) {
    if (a.taskFinding?.source === 'ai' && a.taskFinding.result) {
      add(a.taskFinding.result.why);
      for (const card of a.taskFinding.result.cards) add(card.title, card.text);
    }
    if (a.source !== 'nova') continue;
    add(a.title, a.expectedOutcome.text, a.stageFit.reason, a.bottleneckFit.reason, a.dependency.notes, a.metric?.unit);
  }
  const texts = [...values].sort();
  return { texts, sourceHash: createHash('sha256').update(JSON.stringify([1, locale, texts])).digest('hex') };
}

// Protect source quantities, dates, currencies, links and identifiers before model translation.
export function protectCopy(text: string) {
  if (/__NOVA_KEEP_\d+__/.test(text)) throw new Error('Source contains reserved translation markers');
  const protectedValues: string[] = [];
  const masked = text.replace(/https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]+|\b[A-Za-z][A-Za-z0-9]*[_-][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*\b|\b(?:USD|TWD|EUR|GBP|JPY|NTD|NOVA|POLARIS)\b|(?:\$|€|£|¥|NT\$)\s*\d[\d,.]*(?:%|[kKmMbB])?|\d+(?:[.,:/-]\d+)*(?:%|[kKmMbB])?/g, value => {
    protectedValues.push(value); return `__NOVA_KEEP_${protectedValues.length - 1}__`;
  });
  return { masked, restore(translated: string) {
    const markers = translated.match(/__NOVA_KEEP_\d+__/g) || [];
    if (markers.length !== protectedValues.length || protectedValues.some((_, i) => markers.filter(m => m === `__NOVA_KEEP_${i}__`).length !== 1) || /\d/.test(translated.replace(/__NOVA_KEEP_\d+__/g, ''))) throw new Error('Translation changed protected source values');
    return translated.replace(/__NOVA_KEEP_(\d+)__/g, (_, index) => protectedValues[Number(index)]);
  } };
}
