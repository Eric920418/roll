"use client";
import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { MemberFetchError, memberFetch } from '@/lib/member-fetch';
import type { evidenceSnapshot } from '@/lib/evidence/service';
type View = Awaited<ReturnType<typeof evidenceSnapshot>>;
const button = 'inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-40';
export default function EvidencePreferences({ embedded = false }: { embedded?: boolean }) {
    const locale = useLocale(), zh = locale === 'zh-tw', [view, setView] = useState<View | null>(null), [draft, setDraft] = useState<View['state']['preferences'] | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [conflict, setConflict] = useState(false);
    async function load(preserve = false) {
        try {
            const v = await memberFetch<View>('/api/evidence');
            setView(v);
            if (!preserve)
                setDraft(v.state.preferences);
            setError('');
            setConflict(false);
        }
        catch (e) {
            setError(String(e));
        }
    }
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
    async function save() {
        if (!view || !draft || conflict)
            return;
        setBusy(true);
        try {
            const v = await memberFetch<View>('/api/evidence', { method: 'POST', body: JSON.stringify({ action: 'preferences', revision: view.revision, requestId: crypto.randomUUID(), preferences: { ...draft, locale } }) });
            setView(v);
            setDraft(v.state.preferences);
            setError('');
            setNotice(zh ? '通知偏好已儲存。' : 'Notification preferences saved.');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            if (e instanceof MemberFetchError && e.status === 409)
                setConflict(true);
        }
        finally {
            setBusy(false);
        }
    }
    const Container = embedded ? "section" : "details";
    const Heading = embedded ? "h3" : "summary";
    return <Container className="space-y-4 rounded-xl border p-4"><Heading className="min-h-11 py-3 font-semibold">{zh ? '任務、圓桌與交流 Email 提醒' : 'Task, roundtable and connection emails'}</Heading><p className="text-sm">{zh ? '選擇要收到的 Email；每封信都能按類別退訂。' : 'Choose which emails to receive. You can unsubscribe by category in any email.'}</p>{draft && <fieldset disabled={busy} className="space-y-3">{(['weekly', 'task', 'roundtable', 'connection'] as const).map((key, i) => <label className="flex min-h-11 items-center gap-3 text-sm" key={key}><input type="checkbox" className="h-5 w-5" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })}/>{(zh ? ['每週下一步與證據摘要', '行動截止前一天與七日未回覆跟進', '圓桌會前 24 小時準備提醒', '收到交流邀請、接受與新訊息'] : ['Weekly priority and evidence summary', 'Action deadlines and seven-day follow-up', 'Roundtable preparation, 24 hours before', 'Connection invitations, acceptance and messages'])[i]}</label>)}<label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={draft.benchmarkShare} onChange={e => setDraft({ ...draft, benchmarkShare: e.target.checked })}/>{zh ? '同意將本週對話數用於匿名同階段平均，至少五位同意者才顯示，不分享內容或身分。' : 'Contribute this week’s conversation count to anonymous same-stage averages, shown only with at least five consenting members. No identities or content are shared.'}</label><label className="block text-sm">{zh ? '時區（例如 Asia/Taipei）' : 'Time zone (for example Asia/Taipei)'}<input className="mt-2 min-h-11 w-full rounded border p-3" value={draft.timeZone} onChange={e => setDraft({ ...draft, timeZone: e.target.value })}/></label><button className={button} type="button" onClick={() => setDraft({ ...draft, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}>{zh ? '使用本裝置時區' : 'Use this device’s time zone'}</button><button className={button + ' ml-2'} disabled={conflict} type="button" onClick={() => void save()}>{zh ? '儲存通知偏好' : 'Save email preferences'}</button></fieldset>}{notice && <p role="status" className="text-sm">{notice}</p>}{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}{conflict && <button className={button} type="button" onClick={() => void load(true)}>{zh ? '我會比對最新設定，保留選擇後再確認' : 'Load latest settings; retain choices for review'}</button>}</Container>;
}
export function EvidenceUnsubscribe({ token }: {
    token: string;
}) { const zh = useLocale() === 'zh-tw', [done, setDone] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false); return <main className="mx-auto max-w-xl space-y-5 px-6 py-16"><h1 className="text-3xl font-bold">{zh ? '關閉這一類 NOVA Email？' : 'Turn off this category of NOVA email?'}</h1><p>{zh ? '只關閉連結指定的提醒，其他偏好、會員資料與方案保留。' : 'Only this email category is turned off. Other preferences, records and plans are preserved.'}</p>{done ? <p role="status">{zh ? '已退訂。' : 'Unsubscribed.'}</p> : <button className={button} disabled={busy} type="button" onClick={() => { setBusy(true); void memberFetch('/api/evidence/unsubscribe', { method: 'POST', body: JSON.stringify({ token }) }).then(() => setDone(true)).catch(e => setError(String(e))).finally(() => setBusy(false)); }}>{zh ? '確認退訂' : 'Confirm unsubscribe'}</button>}{error && <p role="alert" className="whitespace-pre-wrap text-red-800">{error}</p>}</main>; }
