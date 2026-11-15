"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { memberFetch } from '@/lib/member-fetch';
import { pathForLocale } from '@/lib/routes';
import type { Locale } from '@/i18n/routing';
import type { FlowView } from '@/lib/action-plan/flow/service';
export default function ReportDraft({ disabled, onInsert }: {
    disabled: boolean;
    onInsert(value: string): void;
}) {
    const locale = useLocale() as Locale, zh = locale === 'zh-tw', [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [notice, setNotice] = useState(''), [unavailable, setUnavailable] = useState(false);
    async function share() {
        setBusy(true); setError(''); setNotice(''); setUnavailable(false);
        try {
            const view = await memberFetch<FlowView>('/api/action-plans/flow?locale=' + locale);
            const legacy = view.plan.workflowVersion !== 2;
            const reason = view.archived ? (zh ? '此計畫已封存，無法建立分享連結。' : 'This plan is archived and cannot create a sharing link.')
                : !legacy && (view.steps.length !== 16 || view.steps.some(step => !step.done)) ? (zh ? '完成十六步後，才能分享市場驗證報告。' : 'Complete all sixteen steps before sharing the market validation report.')
                : !legacy && view.steps.some(step => !step.ready) ? (zh ? '報告證據需補正，請先查看今日任務。' : 'Report evidence needs attention. Review today’s tasks first.') : '';
            if (reason) { setNotice(reason); setUnavailable(true); return; }
            if (!window.confirm((legacy ? (zh ? '分享目前目標、任務進度與已完成發現的標題。' : 'Share the current goal, task progress and completed finding headlines. ') : '') + (zh ? '建立 30 天報告分享連結並放入訊息草稿？持有連結者可在有效期間檢視，仍需自行送出訊息，可於報告頁撤銷。' : 'Create a 30-day report sharing link and insert it into your message draft? Anyone with the link may view it while valid. Send the message yourself; revoke access on the report page.'))) return;
            const shared = await memberFetch<FlowView & { link: string }>('/api/action-plans/flow?locale=' + locale, { method: 'POST', body: JSON.stringify({ action: 'share', enabled: true, planId: view.plan.id, revision: view.plan.revision }) });
            onInsert((legacy ? (zh ? '我的進度報告：' : 'My progress report: ') : (zh ? '我的市場驗證報告：' : 'My market validation report: ')) + new URL(pathForLocale(shared.link, locale), window.location.origin).href);
            setNotice(zh ? '報告連結已放入訊息草稿，確認後按送出。' : 'Report link added to your message draft. Review it, then press Send.');
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); }
    }
    return <div className="space-y-2"><button type="button" className="min-h-11 whitespace-nowrap rounded-full border px-4 py-2 text-base font-semibold disabled:opacity-40" disabled={disabled || busy} onClick={() => void share()}>{busy ? (zh ? '準備分享…' : 'Preparing report…') : (zh ? '分享報告' : 'Share report')}</button>{notice && <p role="status" className="text-sm">{notice}</p>}{unavailable && <Link className="inline-flex min-h-11 items-center text-sm underline" href={pathForLocale('/dashboard/agenda', locale)}>{zh ? '查看今日任務' : 'View today’s tasks'}</Link>}{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}</div>;
}

export function RevokeReportShare({ planId }: { planId: string }) {
    const locale = useLocale() as Locale, zh = locale === 'zh-tw';
    const [busy, setBusy] = useState(false), [revoked, setRevoked] = useState(false), [error, setError] = useState('');
    async function revoke() {
        setBusy(true); setError('');
        try {
            const view = await memberFetch<FlowView>('/api/action-plans/flow?' + new URLSearchParams({ planId, locale }));
            await memberFetch('/api/action-plans/flow?locale=' + locale, { method: 'POST', body: JSON.stringify({ action: 'share', enabled: false, planId, revision: view.plan.revision }) });
            setRevoked(true);
        } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
        finally { setBusy(false); }
    }
    return <div className="space-y-2 print:hidden">{revoked ? <p role="status">{zh ? '分享已撤銷，原連結無法再開啟。' : 'Sharing revoked. The old link can no longer be opened.'}</p> : <button type="button" disabled={busy} className="min-h-11 whitespace-nowrap rounded-full border px-4 py-2 text-base font-semibold disabled:opacity-40" onClick={() => void revoke()}>{busy ? (zh ? '撤銷中…' : 'Revoking…') : (zh ? '撤銷報告分享' : 'Revoke report sharing')}</button>}{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}</div>;
}
