"use client";
import { useEffect, useRef, useState } from 'react';
import { MemberFetchError, memberFetch } from '@/lib/member-fetch';
import type { FlowData, StepId } from '@/lib/action-plan/flow/catalog';
import type { FlowView } from '@/lib/action-plan/flow/service';
import type { assistInput, assistResult } from '@/lib/action-plan/flow/assist';
import type { z } from 'zod';
import { button } from './Templates';
type Recognition = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((e: {
        resultIndex: number;
        results: ArrayLike<{
            isFinal: boolean;
            0: {
                transcript: string;
            };
        }>;
    }) => void) | null;
    onerror: ((e: {
        error: string;
        message?: string;
    }) => void) | null;
    onend: (() => void) | null;
};
type SpeechWindow = Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
};
export default function TaskAssist({ userId, step, view, locale, disabled, onBusy, onView, onRefresh, onApply }: {
    userId: string;
    step: StepId;
    view: FlowView;
    locale: 'en' | 'zh-tw';
    disabled: boolean;
    onBusy(v: boolean): void;
    onView(v: FlowView): void;
    onRefresh(): void;
    onApply(v: FlowData): void;
}) {
    const w = (a: string, b: string) => locale === 'zh-tw' ? a : b, [transcript, setTranscript] = useState(''), [result, setResult] = useState<z.infer<typeof assistResult> | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [listening, setListening] = useState(false), [supported, setSupported] = useState(false);
    const recognition = useRef<Recognition | null>(null), text = useRef(transcript), attempt = useRef<{
        key: string;
        id: string;
        payload: Omit<z.infer<typeof assistInput>, "requestId">;
    } | null>(null), key = `nova:transcript:${userId}:${view.plan.id}:${step}`;
    useEffect(() => { text.current = transcript; }, [transcript]);
    useEffect(() => {
        const timer = setTimeout(() => {
            setSupported(Boolean((window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition));
            try {
                setTranscript(localStorage.getItem(key) || '');
            }
            catch { }
            setResult(null);
        }, 0);
        return () => {
            clearTimeout(timer);
            if (recognition.current) {
                recognition.current.onresult = null;
                recognition.current.onerror = null;
                recognition.current.onend = null;
                recognition.current.abort();
                recognition.current = null;
            }
        };
    }, [key]);
    function update(value: string) {
        setTranscript(value);
        text.current = value;
        try {
            localStorage.setItem(key, value);
        }
        catch {
            setError(w('無法暫存逐字稿，請先複製保存。', 'Transcript could not be cached; copy it before leaving.'));
        }
    }
    function speech() {
        if (listening) {
            recognition.current?.stop();
            return;
        }
        const API = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
        if (!API)
            return;
        const r = new API();
        recognition.current = r;
        r.lang = locale === 'zh-tw' ? 'zh-TW' : 'en-US';
        r.continuous = true;
        r.interimResults = false;
        r.onresult = e => {
            const chunks = [];
            for (let i = e.resultIndex; i < e.results.length; i++)
                if (e.results[i].isFinal)
                    chunks.push(e.results[i][0].transcript);
            const next = [text.current, ...chunks].filter(Boolean).join('\n');
            if (next.length > 30000) {
                r.stop();
                setError(w('逐字稿已達 30,000 字，已停止收音；既有文字保留。', 'Transcript reached 30,000 characters. Listening stopped; existing text retained.'));
                return;
            }
            update(next);
        };
        r.onerror = e => { setError(w('語音辨識未完成：', 'Speech recognition failed: ') + e.error + (e.message ? ' · ' + e.message : '')); r.onerror = null; r.onend = null; r.abort(); recognition.current = null; setListening(false); };
        r.onend = () => setListening(false);
        try {
            r.start();
            setListening(true);
            setError('');
        }
        catch (e) {
            setError(String(e));
        }
    }
    async function generate() {
        if (busy || disabled)
            return;
        setBusy(true);
        onBusy(true);
        setError('');
        const payload = { planId: view.plan.id, step, revision: view.plan.revision || 0, locale, transcript }, hash = JSON.stringify({ planId: view.plan.id, step, locale, transcript });
        if (attempt.current?.key !== hash)
            attempt.current = { key: hash, id: crypto.randomUUID(), payload };
        const sending = attempt.current!;
        try {
            const next = await memberFetch<{
                result: z.infer<typeof assistResult>;
                view: FlowView;
            }>('/api/action-plans/assist', { method: 'POST', body: JSON.stringify({ ...sending.payload, requestId: sending.id }) });
            setResult(next.result);
            onView(next.view);
            attempt.current = null;
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            if (e instanceof MemberFetchError && e.status !== 409)
                attempt.current = null;
            onRefresh();
        }
        finally {
            setBusy(false);
            onBusy(false);
        }
    }
    return <details className="space-y-4 rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w('語音／逐字稿與 AI 草稿協助', 'Speech, transcript and AI drafting')}</summary><p className="text-sm">{w('轉寫不會自動儲存或完成任務。語音由瀏覽器提供，可能使用瀏覽器供應商的服務；只有你按下開始才收音。', 'Transcription never saves or completes a task automatically. Speech is provided by your browser and may use its vendor’s service. Listening starts only when you choose it.')}</p><label className="block text-sm">{w('貼上會議紀錄或逐字稿', 'Paste meeting notes or a transcript')}<textarea className="mt-2 min-h-32 w-full rounded-xl border p-3" maxLength={30000} value={transcript} disabled={busy || disabled} onChange={e => update(e.target.value)}/></label><div className="flex flex-wrap gap-3">{supported ? <button type="button" className={button} aria-pressed={listening} disabled={busy || disabled} onClick={speech}>{listening ? w('停止收音', 'Stop listening') : w('開始語音轉寫', 'Start speech transcription')}</button> : <p className="text-sm">{w('此瀏覽器沒有語音辨識，請貼上逐字稿。', 'Speech recognition is unavailable in this browser. Paste a transcript instead.')}</p>}<button type="button" className={button} disabled={disabled || busy || listening} onClick={() => void generate()}>{w('產生未確認草稿 · 使用 1 次 AI 額度', 'Generate unconfirmed draft · uses 1 AI allowance')}</button></div>{listening && <p role="status">{w('正在收音，按「停止收音」結束。', 'Listening. Choose Stop listening to finish.')}</p>}
 {result && <section className="space-y-3 border-t pt-4"><h3 className="font-bold">{w('草稿 · 請核對來源後套用', 'Draft · review sources before applying')}</h3>{result.variants.map((v, i) => <label className="flex min-h-11 items-start gap-3 whitespace-pre-wrap rounded border p-3 text-sm" key={i}>{step === "01-2" && result.draft.kind === "organize" && <input type="radio" className="mt-1 h-5 w-5 shrink-0" name={"positioning:" + userId} checked={result.draft.values.positioning === v} onChange={() => setResult(old => old?.draft.kind === "organize" ? { ...old, draft: { ...old.draft, values: { ...old.draft.values, positioning: v }, confirmed: [] } } : old)}/>}{i + 1}. {v}</label>)}{result.draft.kind === 'document' && result.draft.sections.map(s => <p className="whitespace-pre-wrap text-sm" key={s.id}>{s.body}</p>)}{result.draft.kind === 'outreach' && result.draft.contacts.map(c => <p className="whitespace-pre-wrap text-sm" key={c.id}>{c.company} · {c.name}：{c.offer}</p>)}{result.draft.kind === 'conversation' && result.draft.records.map(r => <p className="whitespace-pre-wrap text-sm" key={r.id}>{r.company} · {r.name}：{r.pain} · {r.solution}</p>)}{result.draft.kind === 'organize' && Object.entries(result.draft.values).map(([k, v]) => <p key={k} className="whitespace-pre-wrap text-sm">{v}</p>)}<details><summary className="min-h-11 cursor-pointer py-3">{w('查看原文佐證', 'Review source quotes')}</summary>{result.sources.map((s, i) => <blockquote className="my-3 border-l pl-3 text-sm" key={i}>{s.quote}</blockquote>)}</details><button type="button" className={button} disabled={disabled || busy} onClick={() => {
                if (window.confirm(w('將這份未確認草稿帶入操作區？原紀錄不改，仍需核對並按儲存。', 'Apply this unconfirmed draft to the work area? Saved records stay unchanged; review and save explicitly.')))
                    onApply(result.draft);
            }}>{w('核對後套用草稿', 'Apply reviewed draft')}</button></section>}
 {error && <p role="alert" className="whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}</details>;
}
