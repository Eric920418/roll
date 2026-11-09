'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { planText as fixedText, planUnit, displayTaskReference as fixedReference } from '@/lib/action-plan/display';
import type { PlanCopy } from '@/lib/action-plan/localization';

const CopyContext = createContext<Readonly<Record<string, string>>>({});

export function PlanLocalizationProvider({ planId, revision, children }: { planId?: string | null; revision?: number; children: ReactNode }) {
  const locale = useLocale() === 'zh-tw' ? 'zh-tw' : 'en', zh = locale === 'zh-tw';
  const key = `${planId}:${revision}:${locale}`;
  const [state, setState] = useState<{ key: string; strings: Record<string, string>; pending: boolean; error: string }>({ key: '', strings: {}, pending: false, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!planId) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let current: PlanCopy | null = null;
    async function request(generate: boolean) {
      const response = await fetch('/api/action-plans/localization' + (generate ? '' : `?${new URLSearchParams({ planId: planId!, locale })}`), {
        cache: 'no-store', signal: controller.signal,
        ...(generate ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId, locale }) } : {}),
      });
      let json; try { json = await response.json(); } catch { throw new Error(`HTTP ${response.status}: ${zh ? '無法讀取回應，請重試' : 'Unreadable response; retry'}`); }
      if (!response.ok) throw new Error([`HTTP ${response.status}`, json.error, json.code, json.requestId].filter(Boolean).join('\n'));
      return json.data as PlanCopy;
    }
    async function run() {
      if (document.hidden || !alive) return;
      try {
        current = await request(false);
        if (current.status === 'missing') current = await request(true);
        if (!alive) return;
        setState({ key, strings: current.strings, pending: current.status !== 'ready', error: '' });
        if (current.status !== 'ready') timer = setTimeout(() => void run(), 2000);
      } catch (cause) {
        if (alive && !controller.signal.aborted) setState({ key, strings: current?.strings || {}, pending: false, error: cause instanceof Error ? cause.message : String(cause) });
      }
    }
    const visible = () => { if (!document.hidden) { clearTimeout(timer); void run(); } else clearTimeout(timer); };
    void run(); document.addEventListener('visibilitychange', visible);
    return () => { alive = false; clearTimeout(timer); controller.abort(); document.removeEventListener('visibilitychange', visible); };
  }, [planId, revision, locale, key, attempt, zh]);
  const active = state.key === key ? state : null;
  return <CopyContext.Provider value={active?.strings || {}}>
    {active?.pending && <p role="status" className="my-3 text-sm text-dark/60">{zh ? '正在補齊中文顯示，暫時保留原文。' : 'Preparing English text; original text remains available.'}</p>}
    {active?.error && <div role="alert" className="my-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 [overflow-wrap:anywhere]"><p>{zh ? '翻譯尚未完成，原始計畫與紀錄已保留。' : 'Translation is incomplete. Your original plan and records are preserved.'}</p><p className="mt-2 whitespace-pre-wrap">{active.error}</p><button className="mt-3 min-h-11 border border-red-300 px-4 font-semibold" onClick={() => setAttempt(a => a + 1)}>{zh ? '重試翻譯' : 'Retry translation'}</button></div>}
    {children}
  </CopyContext.Provider>;
}

export function usePlanDisplay() {
  const strings = useContext(CopyContext);
  return {
    planText: (value: string, locale: string) => fixedText(value, locale, strings),
    planUnit: (value: string, locale: string) => fixedText(planUnit(value, locale), locale, strings),
    displayTaskReference: (task: Parameters<typeof fixedReference>[0], locale: string) => fixedReference(task, locale, strings),
  };
}

export function PlanCopyText({ value }: { value: string }) {
  const locale = useLocale(), { planText } = usePlanDisplay();
  return <>{planText(value, locale)}</>;
}
