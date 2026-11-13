"use client";
import { useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { z } from 'zod';
import type { RoundtableState } from '@/lib/roundtables/service';
import { calendarIcs, googleCalendarUrl } from '@/lib/week-plan/export';
import type { CalendarEntry } from '@/lib/week-plan/schema';
import { button, TextField } from '../flow/Templates';
import { useDraft, Choice } from './Forms';
type Session = RoundtableState['sessions'][number];
type Write = (v: unknown) => Promise<boolean>;
const prep = z.object({ question: z.string().max(2000), share: z.boolean() }), autoForm = z.object({ name: z.string().max(100), question: z.string().max(2000), language: z.string(), consent: z.boolean(), requestId: z.string() });
export function AutoGroup({ userId, disabled, write }: {
    userId: string;
    disabled: boolean;
    write: Write;
}) {
    const zh = useLocale() === 'zh-tw', w = (a: string, b: string) => zh ? a : b;
    const { draft, change, clear, warning } = useDraft('nova:auto-group:' + userId, { name: '', question: '', language: zh ? 'zh-tw' : 'en', consent: false, requestId: '' }, autoForm);
    return <details className="space-y-3 rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w('依階段、產業與時區自動配組', 'Find a group by stage, industry and time zone')}</summary><form className="space-y-3" onSubmit={e => {
            e.preventDefault();
            const requestId = draft.requestId || crypto.randomUUID();
            change({ ...draft, requestId });
            void write({ action: 'autoApply', ...draft, requestId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then(ok => {
                if (ok)
                    clear();
            });
        }}><fieldset disabled={disabled} className="space-y-3"><TextField label={w('本場顯示名稱', 'Name for this session')} value={draft.name} onChange={name => change({ ...draft, name })}/><TextField multiline label={w('想請小組回饋的問題', 'Question for the group')} value={draft.question} onChange={question => change({ ...draft, question })}/><Choice label={w('會議語言', 'Session language')} value={draft.language} options={[["zh-tw", "繁體中文"], ["en", "English"], ["ja", "日本語"], ["ko", "한국어"], ["other", w('其他', 'Other')]]} onChange={language => change({ ...draft, language })}/><label className="flex min-h-11 items-start gap-3 py-2 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={draft.consent} onChange={e => change({ ...draft, consent: e.target.checked })}/>{w('同意依現有資格提交一場配組申請，主持可查看問題；正式入選後與同組分享顯示名稱及承諾。', 'Apply to one matching session under my existing access. The host may review my question; confirmed group members may see my name and commitments.')}</label><button className={button} disabled={disabled || !draft.consent}>{w('配組並提交申請', 'Match and submit application')}</button></fieldset></form>{warning && <p role="status">{warning}</p>}</details>;
}
export function Preparation({ userId, session, disabled, write }: {
    userId: string;
    session: Session;
    disabled: boolean;
    write: Write;
}) {
    const zh = useLocale() === 'zh-tw', w = (a: string, b: string) => zh ? a : b;
    const { draft, change, warning } = useDraft('nova:prepare:' + userId + ':' + session.id, { question: session.mine?.question || '', share: false }, prep);
    const snapshot = session.mine?.preparation as {
        conversations?: number;
        findings?: number;
        commitments?: number;
        submittedAt?: string;
    } | null;
    return <details className="space-y-3 rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w('會前準備與本週證據', 'Preparation and this week’s evidence')}</summary><p className="text-sm">{w('會前 24 小時自動整理數量摘要。只有你主動同意，才與主持及正式成員分享摘要，不包含原始對話或附件。', 'A count summary is prepared 24 hours before the session. Share it with the host and confirmed members only with your explicit consent. Raw conversations and attachments stay private.')}</p>{snapshot && <p className="text-sm">{w('本週對話／痛點／付費承諾：', 'This week’s conversations / pain points / commitments: ')}{snapshot.conversations || 0} / {snapshot.findings || 0} / {snapshot.commitments || 0}{snapshot.submittedAt ? ' · ' + w('已提交', 'Submitted') : ''}</p>}<TextField multiline label={w('最想請小組回饋的問題', 'Question to discuss with the group')} value={draft.question} onChange={question => change({ ...draft, question })}/><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="h-5 w-5 shrink-0" checked={draft.share} onChange={e => change({ ...draft, share: e.target.checked })}/>{w('同意與本場主持及正式成員分享本週數量摘要', 'Share this week’s count summary with this host and confirmed group members')}</label><button type="button" disabled={disabled} className={button} onClick={() => void write({ action: 'prepare', id: session.id, revision: session.mine!.revision, ...draft })}>{w('確認並提交會前準備', 'Confirm preparation')}</button>{warning && <p role="status">{warning}</p>}<div className="border-t pt-3 text-sm"><h4 className="font-bold">{w('60 分鐘建議議程', 'Suggested 60-minute agenda')}</h4><p>{w('0–5 分：上次承諾；5–55 分：證據、回饋與下一步；55–60 分：確認可衡量承諾。', '0–5 min: prior commitments; 5–55 min: evidence, feedback and next steps; 55–60 min: confirm measurable commitments.')}</p></div></details>;
}
export function SessionCalendar({ session }: {
    session: Session;
}) { const zh = useLocale() === 'zh-tw', entry: CalendarEntry = { id: 'roundtable-' + session.id, kind: 'personal', date: session.startsAt.slice(0, 10), startsAt: session.startsAt, endsAt: session.endsAt, title: session.topic, note: zh ? '回 NOVA 查看會議連結及會前準備。' : 'Return to NOVA for the meeting link and preparation.', done: false, revision: session.revision, actionId: null, available: true, interview: false, durationMinutes: null, alert: { enabled: false, status: null, acceptedAt: null, error: null } }; const url = new URL(googleCalendarUrl(entry)); url.searchParams.set('ctz', session.timezone); function download() { const blob = new Blob([calendarIcs([entry])], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'nova-roundtable.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } return <div className="flex flex-wrap gap-3"><a className={button} href={url.href} target="_blank" rel="noopener noreferrer">Google Calendar ↗</a><button className={button} type="button" onClick={download}>{zh ? 'Apple／ICS 行事曆' : 'Apple / ICS Calendar'}</button></div>; }
export function SessionFeedback({ session, disabled, write }: {
    session: Session;
    disabled: boolean;
    write: Write;
}) {
    const zh = useLocale() === 'zh-tw', [rating, setRating] = useState('5'), [note, setNote] = useState(''), id = useRef('');
    if (session.mine?.feedback)
        return <p className="text-sm">{zh ? '會後評分已保存，只有本人與主持可見。' : 'Feedback saved; visible only to you and the host.'}</p>;
    return <fieldset disabled={disabled} className="space-y-3 rounded-xl border p-4"><legend>{zh ? '會後評分' : 'Session feedback'}</legend><Choice label={zh ? '評分（1–5）' : 'Rating (1–5)'} value={rating} options={[1, 2, 3, 4, 5].map(n => [String(n), String(n)])} onChange={setRating}/><TextField multiline label={zh ? '回饋（只給主持）' : 'Feedback (host only)'} value={note} onChange={setNote}/><button type="button" className={button} onClick={() => { id.current ||= crypto.randomUUID(); void write({ action: 'feedback', id: session.id, requestId: id.current, rating: Number(rating), note }); }}>{zh ? '儲存評分' : 'Save feedback'}</button></fieldset>;
}
