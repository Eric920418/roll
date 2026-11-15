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
const prep = z.object({ question: z.string().max(2000), share: z.boolean() });
export function Preparation({ userId, session, evidence, disabled, write }: {
    userId: string; session: Session; evidence?: RoundtableState['evidence']; disabled: boolean; write: Write;
}) {
    const zh = useLocale() === 'zh-tw', w = (a: string, b: string) => zh ? a : b;
    const snapshot = session.mine?.preparation as { conversations?: number; findings?: number; commitments?: number; submittedAt?: string; share?: boolean } | null;
    const { draft, change, warning } = useDraft('nova:prepare:' + userId + ':' + session.id, { question: session.mine?.question || '', share: snapshot?.share === true }, prep);
    const counts = evidence || snapshot;
    return <section aria-label={w('你的會前準備', 'Your preparation')} className="min-w-0 space-y-3 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6">
      <header><p className="text-xs text-dark/45">{w('你的會前準備', 'Your preparation')}</p><h3 className="mt-2 text-sm font-semibold">{w('會議開始前 24 小時完成', 'Prepare 24 hours before the session')}</h3></header>
      <p className="border-y border-dark/5 py-3 text-xs text-dark/65">{counts ? `${w('✓ 本週證據已帶入：', '✓ This week’s evidence: ')}${counts.conversations ?? '—'} ${w('次對話', counts.conversations === 1 ? 'conversation' : 'conversations')} · ${counts.findings ?? '—'} ${w('項痛點', counts.findings === 1 ? 'pain point' : 'pain points')}` : w('數量摘要尚未提供', 'Count summary unavailable')}</p>
      <fieldset disabled={disabled} className="min-w-0 space-y-3"><TextField multiline label={w('你最想請小組回饋的問題', 'Question for group feedback')} value={draft.question} onChange={question => change({ ...draft, question })}/><label className="flex min-h-11 items-start gap-2 text-xs leading-5 text-dark/60"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={draft.share} onChange={e => change({ ...draft, share: e.target.checked })}/>{w('同意與本場主持及正式成員分享證據數量摘要', 'Share evidence counts with this host and confirmed members')}</label><div className="flex items-center justify-between gap-3"><span role="status" className="text-xs text-dark/45">{snapshot?.submittedAt ? w('✓ 已提交', '✓ Submitted') : ''}</span><button type="button" disabled={disabled || draft.question.trim().length < 3} className="min-h-11 rounded-full bg-black px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" onClick={() => void write({ action: 'prepare', id: session.id, revision: session.mine!.revision, ...draft })}>{w('提交準備', 'Submit preparation')}</button></div></fieldset>
      {warning && <p role="status" className="text-xs text-dark/60">{warning}</p>}
    </section>;
}
export function SessionCalendar({ session }: {
    session: Session;
}) { const zh = useLocale() === 'zh-tw', entry: CalendarEntry = { id: 'roundtable-' + session.id, kind: 'personal', date: session.startsAt.slice(0, 10), startsAt: session.startsAt, endsAt: session.endsAt, title: session.topic, note: zh ? '回 NOVA 查看會議連結及會前準備。' : 'Return to NOVA for the meeting link and preparation.', done: false, revision: session.revision, actionId: null, available: true, interview: false, durationMinutes: null, alert: { enabled: false, status: null, acceptedAt: null, error: null } }; const url = new URL(googleCalendarUrl(entry)); url.searchParams.set('ctz', session.timezone); function download() { const blob = new Blob([calendarIcs([entry])], { type: 'text/calendar;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'nova-roundtable.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } return <details className="relative"><summary className="flex min-h-11 cursor-pointer list-none items-center rounded-full bg-white/10 px-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">{zh ? "加入行事曆" : "Add to calendar"} ▾</summary><div className="absolute left-0 top-full z-10 mt-2 grid min-w-52 gap-2 rounded-xl border border-dark/10 bg-white p-3 text-dark"><a className={button} href={url.href} target="_blank" rel="noopener noreferrer">Google Calendar ↗</a><button className={button} type="button" onClick={download}>{zh ? 'Apple／ICS 行事曆' : 'Apple / ICS Calendar'}</button></div></details>; }
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
