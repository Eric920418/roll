"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { MemberFetchError, memberFetch } from '@/lib/member-fetch';
import { pathForLocale } from '@/lib/routes';
import { STAGE_NAMES, hypothesisSchema, sourceLinkSchema, type evidenceMutationSchema } from '@/lib/evidence/schema';
import type { evidenceSnapshot } from '@/lib/evidence/service';
import type { IcpWorkspaceView } from '@/lib/icp/schema';
import type { z } from 'zod';
import type { Locale } from '@/i18n/routing';
type View = Awaited<ReturnType<typeof evidenceSnapshot>>;
const button = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40';
const field = 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-dark/20 px-3 py-2';
const blank = () => ({ id: crypto.randomUUID(), description: '', why: '', test: '', who: '', size: '', buyer: '', pain: '', alternatives: '' });
export default function EvidencePanel({ userId, compact = false }: {
    userId: string;
    compact?: boolean;
}) {
    const locale = useLocale() as Locale, zh = locale === 'zh-tw', w = (a: string, b: string) => zh ? a : b;
    const [view, setView] = useState<View | null>(null), [draft, setDraft] = useState<z.infer<typeof hypothesisSchema> | null>(null), [links, setLinks] = useState<z.infer<typeof sourceLinkSchema>[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const analysisAttempt = useRef<{
        key: string;
        input: {
            revision: number;
            locale: Locale;
            requestId: string;
        };
    } | null>(null);
    const [questions, setQuestions] = useState({ problem: '', customer: '', buyer: '' });
    const request = useRef(0), attempt = useRef<{
        key: string;
        id: string;
    } | null>(null), key = 'nova:hypothesis:' + userId;
    const load = useCallback(async () => {
        const n = ++request.current;
        try {
            const v = await memberFetch<View>('/api/evidence');
            if (n === request.current) {
                setView(v);
                let savedLinks = v.state.links;
                try {
                    const raw = localStorage.getItem('nova:evidence-links:' + userId + ':' + v.state.selectedId);
                    if (raw) {
                        const parsed = sourceLinkSchema.array().max(2000).safeParse(JSON.parse(raw));
                        if (parsed.success)
                            savedLinks = parsed.data;
                    }
                }
                catch { }
                setLinks(savedLinks);
                setError('');
            }
        }
        catch (e) {
            if (n === request.current)
                setError(e instanceof Error ? e.message : String(e));
        }
    }, [userId]);
    const invalidate = useCallback(() => { request.current++; }, []);
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => { clearTimeout(timer); invalidate(); }; }, [load, invalidate]);
    useEffect(() => {
        const timer = setTimeout(() => {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = hypothesisSchema.safeParse(JSON.parse(raw));
                    if (parsed.success)
                        setDraft(parsed.data);
                }
            }
            catch { }
        }, 0);
        return () => clearTimeout(timer);
    }, [key]);
    function edit(v: NonNullable<typeof draft>) {
        setDraft(v);
        try {
            localStorage.setItem(key, JSON.stringify(v));
        }
        catch { }
    }
    async function write(body: Omit<z.infer<typeof evidenceMutationSchema>, 'requestId' | 'revision'>) {
        if (!view || busy)
            return;
        const payload = { ...body, revision: view.revision }, hash = JSON.stringify(payload);
        if (attempt.current?.key !== hash)
            attempt.current = { key: hash, id: crypto.randomUUID() };
        setBusy(true);
        setError('');
        try {
            const v = await memberFetch<View>('/api/evidence', { method: 'POST', body: JSON.stringify({ ...payload, requestId: attempt.current.id }) });
            setView(v);
            setLinks(v.state.links);
            if (body.links)
                try {
                    localStorage.removeItem('nova:evidence-links:' + userId + ':' + v.state.selectedId);
                }
                catch { }
            attempt.current = null;
            setNotice(w('已儲存，既有紀錄保留。', 'Saved. Existing records are preserved.'));
            if (body.hypothesis) {
                setDraft(null);
                localStorage.removeItem(key);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function suggest(withDetails = false) {
        setBusy(true);
        setError('');
        try {
            const current = await memberFetch<IcpWorkspaceView>('/api/account/icp?locale=' + locale);
            const product = current.productDescription || [questions.problem, questions.customer, questions.buyer].filter(Boolean).join(' · ');
            if (product.length < 10)
                throw new Error(w('請先在公司資料填寫至少 10 字的產品說明。', 'Add a product description of at least ten characters to your company profile first.'));
            await memberFetch('/api/account/icp', { method: 'POST', body: JSON.stringify({ action: 'discover', revision: current.revision, requestId: crypto.randomUUID(), locale, discovery: { mode: 'suggest', product, ...(withDetails ? { guess: { customer: questions.customer, struggle: questions.problem, situation: questions.buyer, workaround: '' } } : {}) } }) });
            await load();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }
    async function analyse() {
        if (!view || busy)
            return;
        setBusy(true);
        setError('');
        const key = JSON.stringify([view.state.selectedId, view.state.links, view.sources, locale]);
        if (analysisAttempt.current?.key !== key)
            analysisAttempt.current = { key, input: { revision: view.revision, requestId: crypto.randomUUID(), locale } };
        try {
            const v = await memberFetch<View>('/api/evidence/analyse', { method: 'POST', body: JSON.stringify(analysisAttempt.current.input) });
            analysisAttempt.current = null;
            setView(v);
            setNotice(w('關鍵發現已依原文整理，比例由伺服器計算。', 'Findings were grouped from source quotes; shares were calculated by the server.'));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            if (e instanceof MemberFetchError && e.status !== 409)
                analysisAttempt.current = null;
            try {
                setView(await memberFetch<View>("/api/evidence"));
            }
            catch { }
        }
        finally {
            setBusy(false);
        }
    }
    const selected = view?.state.hypotheses.find(h => h.id === view.state.selectedId);
    return <section className="min-w-0 space-y-5 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7" aria-label={w('驗證框架與目標客戶假設', 'Validation framework and customer hypotheses')}>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold tracking-widest text-dark/55">{w('NOVA 驗證框架', 'NOVA VALIDATION FRAMEWORK')}</p><h2 className="mt-2 text-xl font-bold">{view ? w(`你目前在第 ${view.result.stage} 階段：${STAGE_NAMES[view.result.stage - 1][0]}`, `Stage ${view.result.stage}: ${STAGE_NAMES[view.result.stage - 1][1]}`) : w('正在核對客戶證據', 'Checking customer evidence')}</h2></div><button type="button" className={button} disabled={busy} onClick={() => void load()}>{w('重新核對', 'Refresh evidence')}</button></div>
  {view && <><ol className="grid grid-cols-5 gap-1" aria-label={w('五個驗證階段', 'Five validation stages')}>{STAGE_NAMES.map(([a, b], i) => <li key={b} aria-current={view.result.stage === i + 1 ? 'step' : undefined} className={`rounded p-2 text-xs ${i < view.result.stage ? 'bg-black text-white' : 'bg-dark/5 text-dark/60'}`}>{i + 1}<span className="mt-2 hidden sm:block">{w(a, b)}</span></li>)}</ol><p className="text-sm text-dark/65">{w('驗證階段依客戶證據判斷，與行動地圖的里程碑分開。更換假設後從客戶對話階段開始，舊成果保留。', 'Evidence stages are separate from action milestones. Changing a hypothesis starts a new conversation cycle and preserves prior results.')}</p><div className="grid grid-cols-3 gap-3">{[[view.result.conversations, w('有效對話', 'Valid conversations')], [view.result.findings.length, w('有來源的痛點', 'Sourced pain points')], [view.result.paid, w('已核對付費承諾', 'Verified commitments')]].map(([n, label]) => <div key={label} className="rounded-xl bg-dark/5 p-3"><p className="text-2xl font-semibold">{n}</p><p className="mt-2 text-xs">{label}</p></div>)}</div></>}
  {view && <p className="text-sm text-dark/65">{w('本週有效對話：', 'Valid conversations this week: ')}{view.weekConversations}{view.cohort ? w(` · 同階段匿名平均 ${view.cohort.average}（至少 5 位同意者）`, ` · Anonymous same-stage average ${view.cohort.average} (at least five consenting members)`) : w(' · 同階段匿名樣本不足，不顯示平均', ' · Not enough consenting peers for an anonymous average')}</p>}
  {compact ? <a className={button} href={pathForLocale('/dashboard/profile', locale)}>{w('查看目標客戶與佐證', 'Review target customer and evidence')} →</a> : view && <>
   <h3 className="text-lg font-bold">{selected ? w('目前假設：', 'Current hypothesis: ') + selected.description : w('先選一個待驗證的目標客戶', 'Choose one customer hypothesis to test')}</h3>
   <div className="grid gap-3 lg:grid-cols-3">{view.state.hypotheses.map(h => { const historical = view.state.selections.some(s => s.id === h.id) && h.id !== view.state.selectedId; return <article key={h.id} className="space-y-3 rounded-xl border p-4"><p className="text-xs">{h.id === view.state.selectedId ? w('目前假設', 'Current hypothesis') : historical ? w('前一假設 · 紀錄保留', 'Previous hypothesis · records retained') : w('尚未驗證', 'Not yet validated')}</p><h4 className="font-semibold">{h.description}</h4><p className="text-sm">{h.why}</p><p className="text-sm">{h.test}</p>{h.id === view.state.selectedId ? <p className="text-sm font-semibold">{w('佐證狀態：', 'Evidence status: ')}{w(({ unverified: '尚未驗證', initial: '有初步佐證', validated: '已驗證', rejected: '不成立，建議更換假設' })[view.result.status] || '尚未驗證', view.result.status)}</p> : <button type="button" className={button} disabled={busy} onClick={() => void write({ action: 'select', selectedId: h.id })}>{w('用這個假設驗證', 'Test this hypothesis')}</button>}</article>; })}</div>
   {view.clarification && <p role="status" className="rounded-xl bg-dark/5 p-4 text-sm">{view.clarification}</p>}
   <details className="rounded-xl border p-4"><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w('還不確定？回答三題再整理假設', 'Not sure? Answer three questions to refine hypotheses')}</summary><fieldset disabled={busy} className="space-y-3">{([['problem', '你解決什麼問題？', 'What problem do you solve?'], ['customer', '誰最常遇到這個問題？', 'Who encounters it most often?'], ['buyer', '誰可能願意為此付費？', 'Who might pay to solve it?']] as const).map(([key, a, b]) => <label className="block text-sm" key={key}>{w(a, b)}<input className={field} value={questions[key]} maxLength={500} onChange={e => setQuestions({ ...questions, [key]: e.target.value })}/></label>)}<button type="button" className={button} onClick={() => void suggest(true)}>{w('依三題重新產生假設 · 1 次 AI 額度', 'Refine hypotheses from these answers · 1 AI allowance')}</button></fieldset></details>
   {view.candidates.length > 0 && <div className="grid gap-3 lg:grid-cols-3">{view.candidates.map((c, i) => <article key={c.name} className="space-y-3 rounded-xl border border-dashed p-4"><p className="text-xs">{w('AI 建議 · 待確認', 'AI suggestion · unconfirmed')} {i + 1}</p><h4 className="font-bold">{c.name}</h4><p className="text-sm">{c.whyFirst}</p><p className="text-sm">{c.assumptionToTest}</p><button type="button" className={button} onClick={() => edit({ ...blank(), description: c.name, why: c.whyFirst, test: c.assumptionToTest, who: c.guess.customer, pain: c.guess.struggle, alternatives: c.guess.workaround })}>{w('確認或修改這個假設', 'Review this hypothesis')}</button></article>)}</div>}
   <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => void suggest()}>{w('AI 提出假設 · 使用 1 次 AI 額度', 'Suggest hypotheses · uses 1 AI allowance')}</button><button type="button" className={button} disabled={busy} onClick={() => edit(blank())}>{w('新增一個假設版本', 'Add a hypothesis version')}</button><a className={button} href={pathForLocale('/dashboard/agenda', locale)}>{w('依目前假設進入今日任務', 'Continue to today’s tasks')} →</a></div>
   {draft && <fieldset disabled={busy} className="space-y-3 rounded-xl bg-dark/5 p-4"><legend className="font-bold">{w('待驗證假設 · 儲存前確認', 'Hypothesis · review before saving')}</legend>{([['description', '假設描述', 'Hypothesis'], ['why', '為什麼可能', 'Why it may fit'], ['test', '怎麼驗證', 'How to test']] as const).map(([key, a, b]) => <label key={key} className="block text-sm">{w(a, b)}<textarea className={field} maxLength={2000} value={draft[key]} onChange={e => edit({ ...draft, [key]: e.target.value })}/></label>)}{([['who', '他們是誰', 'Who', [...new Set([draft.who, ...view.candidates.map(c => c.guess.customer), ...view.state.hypotheses.map(h => h.who)].filter(Boolean))]], ['pain', '最需要解決的問題', 'Main problem', [...new Set([draft.pain, ...view.candidates.map(c => c.guess.struggle), ...view.state.hypotheses.map(h => h.pain)].filter(Boolean))]], ['size', '規模', 'Size', ['個人', '小型團隊', '中型企業', '大型企業']], ['buyer', '購買決策者', 'Buying decision', ['本人', '部門主管', '創辦人', '採購團隊']], ['alternatives', '尋找解決方案的地方', 'Where they find solutions', ['搜尋引擎', '同業推薦', '社群', '顧問／供應商']]] as const).map(([key, a, b, options]) => <label key={key} className="block text-sm">{w(a, b)}<select aria-label={w(a, b)} className={field} value={draft[key]} onChange={e => edit({ ...draft, [key]: e.target.value })}><option value="">{w('不確定', 'Not sure')}</option>{options.map((v, i) => <option key={v} value={v}>{w(v, key === 'who' || key === 'pain' ? v : ({ size: ['Individual', 'Small team', 'Mid-sized company', 'Large company'], buyer: ['The person', 'Department lead', 'Founder', 'Procurement team'], alternatives: ['Search engines', 'Peer referrals', 'Community', 'Advisors / vendors'] })[key][i])}</option>)}{draft[key] && !options.some(v => v === draft[key]) && <option value={draft[key]}>{draft[key]}</option>}</select></label>)}<button type="button" className={button + ' bg-black text-white'} onClick={() => void write({ action: 'save', hypothesis: draft })}>{w('確認並儲存假設', 'Confirm and save hypothesis')}</button></fieldset>}
   {selected && <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">{w('為目前假設核對對話佐證', 'Review conversation evidence for this hypothesis')} · {view.sources.length}</summary><p className="mb-4 text-sm">{w('只關聯本人已存紀錄，不修改原對話。不同對象去重；「不確定」不計階段達標。', 'Link saved records without changing the original conversation. People are deduplicated; uncertain fit does not advance stages.')}</p>{view.sources.map(source => {
                    const existing = links.find(l => l.id === source.id && l.hypothesisId === selected.id);
                    const change = (key: 'fit' | 'relationship', value: string) => {
                        const valueRow = { id: source.id, hypothesisId: selected.id, fit: 'uncertain' as const, relationship: 'prospect' as const, ...existing, [key]: value } as z.infer<typeof sourceLinkSchema>;
                        const next = [...links.filter(l => l.id !== source.id || l.hypothesisId !== selected.id), valueRow];
                        setLinks(next);
                        try {
                            localStorage.setItem('nova:evidence-links:' + userId + ':' + selected.id, JSON.stringify(next));
                        }
                        catch {
                            setError(w('無法暫存佐證選擇，離開前請儲存。', 'Evidence choices could not be cached; save before leaving.'));
                        }
                    };
                    return <div key={source.id} className="mb-3 space-y-2 rounded-xl border p-4"><h4 className="font-semibold">{source.company} · {source.name}</h4><p className="whitespace-pre-wrap text-sm">{source.quote}</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">{w('是否符合目標客群', 'Target customer fit')}<select aria-label={w("是否符合目標客群", "Target customer fit")} className={field} value={existing?.fit || 'uncertain'} onChange={e => change('fit', e.target.value)}>{[['yes', w('符合', 'Fits')], ['possible', w('可能符合', 'Possibly fits')], ['uncertain', w('不確定', 'Uncertain')], ['no', w('不符合', 'Does not fit')]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="text-sm">{w('與你的關係', 'Relationship')}<select aria-label={w("與你的關係", "Relationship")} className={field} value={existing?.relationship || 'prospect'} onChange={e => change('relationship', e.target.value)}>{[['friend', w('親友', 'Friend / family')], ['colleague', w('同事', 'Colleague')], ['stranger', w('陌生人', 'Stranger')], ['prospect', w('潛在客戶', 'Potential customer')]].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div></div>;
                })}<button type="button" className={button} disabled={busy} onClick={() => void write({ action: 'save', links: links.filter(l => l.hypothesisId === selected.id) })}>{w('確認並儲存佐證關聯', 'Save evidence links')}</button></details>}
  </>}
  {!compact && view && view.result.conversations >= 3 && <button type="button" className={button} disabled={busy || view.analysisPending} onClick={() => void analyse()}>{w('合併相似痛點 · 使用 1 次 AI 額度', 'Group related pain · uses 1 AI allowance')}</button>}
  {view && view.result.findings.length > 0 && <details open={!compact}><summary className="min-h-11 cursor-pointer py-3 font-semibold">{view.result.findings[0].share >= .5 ? w('關鍵發現：多數證據提及「' + view.result.findings[0].title + '」', 'Key finding: most weighted evidence mentions “' + view.result.findings[0].title + '”') : w('關鍵發現：尚未形成多數一致的痛點', 'Key finding: no majority pain point yet')}</summary>{view.result.findings.map((f, i) => <article className="space-y-2 border-t py-4" key={i}><h3 className="font-semibold">{f.title}</h3><p className="text-sm">{w('加權提及比例', 'Weighted mention share')} {Math.round(f.share * 100)}% · {f.count} {w('次佐證', 'sources')} · {w(({ high: '高', medium: '中', low: '低' })[f.strength as 'high' | 'medium' | 'low'], f.strength)}</p>{f.sources.map(s => <a className="block min-h-11 py-2 text-sm underline" key={s.id} href={pathForLocale(s.href, locale)}>{s.company}：「{s.quote}」</a>)}</article>)}</details>}
  {notice && <p role="status" className="text-sm">{notice}</p>}{error && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button className={button + ' mt-3'} type="button" disabled={busy} onClick={() => void load()}>{w('重新載入，保留草稿', 'Reload; keep draft')}</button></div>}
 </section>;
}
