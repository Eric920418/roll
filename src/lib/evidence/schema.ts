import { today } from '@/lib/roadmap/schema';
import { z } from 'zod';
const text = z.string().trim().max(2000), id = z.string().min(1).max(200);
export const evidencePolicySchema = z.object({ conversations: z.number().int().min(1).max(50).default(3), painConversations: z.number().int().min(1).max(100).default(5), painShare: z.number().min(.1).max(1).default(.5), highStrength: z.number().min(.1).max(1).default(.6), mediumStrength: z.number().min(.01).max(.99).default(.3), paidCommitments: z.number().int().min(1).max(100).default(1) }).strict().refine(v => v.highStrength > v.mediumStrength && v.painConversations >= v.conversations, 'Invalid evidence thresholds');
export const hypothesisSchema = z.object({ id, description: text.min(3), why: text, test: text, who: text, size: text, buyer: text, pain: text, alternatives: text }).strict();
export const sourceLinkSchema = z.object({ id, fit: z.enum(['yes', 'possible', 'uncertain', 'no']), relationship: z.enum(['friend', 'colleague', 'stranger', 'prospect']), hypothesisId: id }).strict();
export const evidencePreferencesSchema = z.object({ benchmarkShare: z.boolean().default(false), weekly: z.boolean().default(false), task: z.boolean().default(false), roundtable: z.boolean().default(false), connection: z.boolean().default(false), timeZone: z.string().max(100).refine(v => {
        try {
            new Intl.DateTimeFormat('en', { timeZone: v });
            return true;
        }
        catch {
            return false;
        }
    }).default('Asia/Taipei'), locale: z.enum(['en', 'zh-tw']).default('en') }).strict();
export const evidenceStateSchema = z.object({ nextWeeklyAt: z.iso.datetime().nullable().optional(), stats: z.object({ week: z.string(), conversations: z.number(), weekConversations: z.number(), paid: z.number(), stage: z.number() }).optional(), preferences: evidencePreferencesSchema.default(() => evidencePreferencesSchema.parse({})), preferenceVersion: z.number().int().nonnegative().default(0), hypotheses: z.array(hypothesisSchema).max(60).default([]), selectedId: id.nullable().default(null), maxStage: z.number().int().min(1).max(5).default(1), selections: z.array(z.object({ id, at: z.string(), previousId: id.nullable() })).max(60).default([]), links: z.array(sourceLinkSchema).max(2000).default([]) }).strict();
export const evidenceMutationSchema = z.object({ requestId: z.uuid(), revision: z.number().int().nonnegative(), action: z.enum(['save', 'select', 'preferences']), hypothesis: hypothesisSchema.optional(), selectedId: id.optional(), preferences: evidencePreferencesSchema.optional(), links: z.array(sourceLinkSchema).max(500).optional() }).strict();
export type EvidenceState = z.infer<typeof evidenceStateSchema>;
export type EvidenceSource = {
    id: string;
    company: string;
    name: string;
    pain: string;
    quote: string;
    date: string;
    href: string;
};
export function evaluateEvidence(state: EvidenceState, sources: EvidenceSource[], paid: number, policy = evidencePolicySchema.parse({}), topics?: Array<{
    title: string;
    sourceIds: string[];
}>) {
    const day = today();
    const linked = sources.filter(s => !s.date || s.date <= day).flatMap(source => { const link = state.links.find(l => l.id === source.id && l.hypothesisId === state.selectedId); return link ? [{ ...source, ...link }] : []; });
    const unique = [...new Map(linked.map(v => [(v.company + '|' + v.name).normalize('NFKC').toLowerCase().replace(/\s+/g, ' '), v])).values()];
    const valid = unique.filter(v => v.fit === 'yes' || v.fit === 'possible');
    const weight = (v: typeof unique[number]) => (v.fit === 'yes' ? 1 : v.fit === 'possible' ? .7 : v.fit === 'uncertain' ? .3 : 0) * (v.relationship === 'friend' ? .6 : v.relationship === 'colleague' ? .8 : 1);
    const total = unique.reduce((s, v) => s + weight(v), 0), groups = new Map<string, typeof unique>();
    for (const v of unique) {
        const key = v.pain.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}]/gu, '');
        if (key && weight(v) > 0)
            groups.set(key, [...(groups.get(key) || []), v]);
    }
    const grouped = topics?.length ? topics.map(topic => ({ title: topic.title, rows: unique.filter(s => topic.sourceIds.includes(s.id) && weight(s) > 0) })).filter(v => v.rows.length) : [...groups.values()].map(rows => ({ title: rows[0].pain, rows }));
    const findings = grouped.map(({ title, rows }) => { const weighted = rows.reduce((s, v) => s + weight(v), 0), share = total ? weighted / total : 0; return { title, share, count: rows.length, strength: share >= policy.highStrength ? 'high' : share >= policy.mediumStrength ? 'medium' : 'low', sources: rows.map(v => ({ id: v.id, quote: v.quote, href: v.href, company: v.company })) }; }).sort((a, b) => b.share - a.share);
    let stage = state.selectedId ? 2 : 1;
    if (stage === 2 && valid.length >= policy.conversations)
        stage = 3;
    if (stage === 3 && valid.length >= policy.painConversations && findings.some(f => f.share >= policy.painShare))
        stage = 4;
    if (stage === 4 && paid >= policy.paidCommitments)
        stage = 5;
    const eligible = unique.filter(v => v.fit !== 'uncertain'), negative = eligible.filter(v => v.fit === 'no').length;
    const status = eligible.length >= policy.painConversations && negative > eligible.length / 2 ? 'rejected' : stage >= 4 ? 'validated' : valid.length ? 'initial' : 'unverified';
    return { stage: Math.max(stage, state.maxStage), observedStage: stage, conversations: valid.length, paid, findings: valid.length >= policy.conversations ? findings : [], status, linked: unique.length };
}
export const STAGE_NAMES = [['定義目標客戶', 'Define your target customer'], ['客戶對話', 'Customer conversations'], ['確認關鍵痛點', 'Confirm key pain'], ['驗證付費意願', 'Validate willingness to pay'], ['開始建置', 'Start building']] as const;
export function anonymousCohortAverage(values: number[]) { const valid = values.filter(v => Number.isFinite(v) && v >= 0); return valid.length >= 5 ? { average: Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length * 10) / 10, minimumSample: 5 } : null; }
