"use client";
import { useState } from 'react';
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
    return <div className="space-y-2"><button type="button" className="min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={disabled || busy} onClick={() => {
            if (!window.confirm(zh ? '建立 30 天報告分享連結並放入訊息草稿？持有連結者可在有效期間檢視，仍需自行送出訊息，可隨時於今日任務撤銷。' : 'Create a 30-day report sharing link and insert it into your message draft? Anyone with the link may view it while valid. Send the message yourself; revoke access in today’s tasks.'))
                return;
            setBusy(true);
            setError('');
            void memberFetch<FlowView>('/api/action-plans/flow?locale=' + locale).then(async (view) => {
                const shared = await memberFetch<FlowView & {
                    link: string;
                }>('/api/action-plans/flow?locale=' + locale, { method: 'POST', body: JSON.stringify({ action: 'share', enabled: true, planId: view.plan.id, revision: view.plan.revision }) });
                onInsert((zh ? '我的市場驗證報告：' : 'My market validation report: ') + new URL(pathForLocale(shared.link, locale), window.location.origin).href);
            }).catch(e => setError(e instanceof Error ? e.message : String(e))).finally(() => setBusy(false));
        }}>{zh ? '建立報告分享連結並放入草稿' : 'Insert a report sharing link into draft'}</button>{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}</div>;
}
