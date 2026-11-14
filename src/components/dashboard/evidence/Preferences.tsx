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
    return <Container className="space-y-4 rounded-xl border p-4"><Heading className="min-h-11 py-3 font-semibold">{zh ? '訊息與 Email' : 'Messages & email'}</Heading>{draft && <fieldset disabled={busy} className="space-y-3"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={draft.acceptMessages !== false} onChange={e => setDraft({ ...draft, acceptMessages: e.target.checked })}/>{zh ? '接受站內訊息與交流邀請' : 'Accept messages and chat invitations'}</label><p className="text-xs text-dark/60">{zh ? '關閉後停止新訊息與邀請，保留既有紀錄。' : 'Off stops new messages and invitations. Your history stays.'}</p><h4 className="pt-2 text-sm font-semibold">{zh ? 'Email 提醒' : 'Email alerts'}</h4><div className="grid gap-x-4 sm:grid-cols-2">{(['weekly', 'task', 'roundtable', 'connection'] as const).map((key, i) => <label className="flex min-h-11 items-center gap-3 text-sm" key={key}><input type="checkbox" className="h-5 w-5" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })}/>{(zh ? ['每週摘要', '任務與跟進', '圓桌會議', '交流與訊息'] : ['Weekly summary', 'Tasks & follow-ups', 'Roundtables', 'Chats & invitations'])[i]}</label>)}</div><details><summary className="min-h-11 cursor-pointer py-3 text-sm">{zh ? '進階設定' : 'Advanced settings'}</summary><div className="space-y-3"><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={draft.benchmarkShare} onChange={e => setDraft({ ...draft, benchmarkShare: e.target.checked })}/>{zh ? '分享匿名對話次數（至少 5 人，不含內容與身分）' : 'Share anonymous conversation counts (5+ members; no content or identities)'}</label><label className="block text-sm">{zh ? '時區' : 'Time zone'}<input className="mt-2 min-h-11 w-full rounded border p-3" value={draft.timeZone} onChange={e => setDraft({ ...draft, timeZone: e.target.value })}/></label><button className={button} type="button" onClick={() => setDraft({ ...draft, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}>{zh ? '使用本機時區' : 'Use device time zone'}</button></div></details><button className={button} disabled={conflict} type="button" onClick={() => void save()}>{zh ? '儲存設定' : 'Save settings'}</button></fieldset>}{notice && <p role="status" className="text-sm">{notice}</p>}{error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}{conflict && <button className={button} type="button" onClick={() => void load(true)}>{zh ? '我會比對最新設定，保留選擇後再確認' : 'Load latest settings; retain choices for review'}</button>}</Container>;
}
export function EvidenceUnsubscribe({ token }: {
    token: string;
}) { const zh = useLocale() === 'zh-tw', [done, setDone] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false); return <main className="mx-auto max-w-xl space-y-5 px-6 py-16"><h1 className="text-3xl font-bold">{zh ? '關閉這一類 NOVA Email？' : 'Turn off this category of NOVA email?'}</h1><p>{zh ? '只關閉連結指定的提醒，其他偏好、會員資料與方案保留。' : 'Only this email category is turned off. Other preferences, records and plans are preserved.'}</p>{done ? <p role="status">{zh ? '已退訂。' : 'Unsubscribed.'}</p> : <button className={button} disabled={busy} type="button" onClick={() => { setBusy(true); void memberFetch('/api/evidence/unsubscribe', { method: 'POST', body: JSON.stringify({ token }) }).then(() => setDone(true)).catch(e => setError(String(e))).finally(() => setBusy(false)); }}>{zh ? '確認退訂' : 'Confirm unsubscribe'}</button>}{error && <p role="alert" className="whitespace-pre-wrap text-red-800">{error}</p>}</main>; }
