import type { PublicCard } from './schema';
type Viewer = {
    industry?: string | null;
    targetMarkets?: string[];
    companyStage?: string | null;
    icp?: string | null;
    looksFor?: string | null;
    offers?: string | null;
};
const terms = (v: string) => new Set([...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(v.normalize('NFKC').toLowerCase())].filter(s => s.isWordLike && s.segment.length >= 2).map(s => s.segment));
function shared(a: string, b: string) { const second = terms(b); return [...terms(a)].filter(v => second.has(v)).slice(0, 3); }
export function weightedMatch(viewer: Viewer, card: PublicCard, replyRate: number | null = null) {
    const offer = shared(viewer.looksFor || '', card.offers || ''), reverse = shared(viewer.offers || '', card.looksFor || ''), customer = shared(viewer.icp || '', card.icp || '');
    const complement = offer.length || reverse.length ? 1 : card.reasons.includes('need') ? .5 : 0;
    const overlap = customer.length ? 1 : (card.reasons.includes('industry') ? .5 : 0) + (card.reasons.includes('market') ? .5 : 0);
    const sameStage = Boolean(viewer.companyStage && card.stage === viewer.companyStage), stage = sameStage ? 1 : card.mentorCertified ? .5 : 0;
    const score = 30 * complement + 20 * overlap + 20 * stage + 20 * (card.activity === 'week' ? 1 : card.activity === 'month' ? .5 : 0) + 10 * Math.max(0, Math.min(1, replyRate || 0));
    const reasons: Array<{
        zh: string;
        en: string;
    }> = [];
    if (offer.length)
        reasons.push({ zh: `你想找的方向與對方公開可提供的「${offer.join('、')}」有交集`, en: `Their public offer overlaps your needs: ${offer.join(', ')}` });
    else if (reverse.length)
        reasons.push({ zh: `你的專長與對方公開需求「${reverse.join('、')}」有交集`, en: `Your offer overlaps their public needs: ${reverse.join(', ')}` });
    else if (card.reasons.includes('need'))
        reasons.push({ zh: '對方公開身分符合你選擇的交流需求', en: 'Their public role fits a connection need you selected' });
    if (customer.length)
        reasons.push({ zh: `你們公開的目標客戶都提到「${customer.join('、')}」`, en: `Your customer descriptions share: ${customer.join(', ')}` });
    else if (card.reasons.includes('industry'))
        reasons.push({ zh: '你們公開的產業相同，可比較相近市場的經驗', en: 'You share a public industry and can compare related market experience' });
    else if (card.reasons.includes('market'))
        reasons.push({ zh: '你們公開的目標市場有交集，可交流當地經驗', en: 'Your public target markets overlap, offering common local context' });
    if (sameStage)
        reasons.push({ zh: '你們公開的公司階段相同，適合交換目前的實作經驗', en: 'Your public company stages match, giving you current challenges to compare' });
    else if (card.mentorCertified)
        reasons.push({ zh: '對方已通過導師認證，可先確認專長是否能協助目前問題', en: 'They are a certified mentor; check whether their expertise fits your current question' });
    if (reasons.length < 2 && card.activity === 'week')
        reasons.push({ zh: '對方近七天有站內活動紀錄', en: 'They have recorded activity within the past seven days' });
    return { score, relevant: complement + overlap + stage > 0, reasons: reasons.slice(0, 3) };
}
