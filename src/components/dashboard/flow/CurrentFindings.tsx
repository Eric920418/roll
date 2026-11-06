"use client";
import { evaluateEvidence, evidenceStateSchema } from '@/lib/evidence/schema';
import type { FlowView } from '@/lib/action-plan/flow/service';
export default function CurrentFindings({ view, locale }: {
    view: FlowView;
    locale: string;
}) {
    const zh = locale === 'zh-tw', records = view.leads, sources = records.map(r => ({ id: r.id, company: r.company, name: r.name, pain: r.pain, quote: r.quote || r.pain, date: r.date, href: '#goal-roadmap' })), state = evidenceStateSchema.parse({ selectedId: 'current-plan', links: records.map(r => ({ id: r.id, hypothesisId: 'current-plan', fit: r.fit || 'possible', relationship: ['friend', 'colleague', 'stranger', 'prospect'].includes(r.relationship) ? r.relationship : 'friend' })) }), result = evaluateEvidence(state, sources, 0);
    if (result.conversations < 3)
        return <p className="text-sm text-dark/65">{zh ? '儲存至少三次有效對話後，在這裡查看有原文來源的痛點。' : 'Save at least three valid conversations to see sourced pain points here.'}</p>;
    return <details><summary className="min-h-11 cursor-pointer py-3 font-semibold">{zh ? '目前計畫的關鍵發現' : 'Key findings for this plan'}</summary><p className="text-xs text-dark/60">{zh ? '依已存原話分組、關係與符合度加權；可到公司檔案確認假設後，以 AI 合併相似痛點。舊紀錄缺少關係時採保守權重。' : 'Grouped from saved wording and weighted by relationship and fit. Confirm a hypothesis in Company profile to group related pain with AI. Legacy records without relationship data use a conservative weight.'}</p>{result.findings.slice(0, 3).map((f, i) => <article key={i} className="space-y-2 border-t py-4"><h4 className="font-semibold">{f.title}</h4><p className="text-sm">{Math.round(f.share * 100)}% · {f.count} {zh ? '次佐證' : 'sources'}</p>{f.sources.map(s => <blockquote className="border-l pl-3 text-sm" key={s.id}>{s.company}：「{s.quote}」</blockquote>)}</article>)}</details>;
}
