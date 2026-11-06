"use client";
import { useState, useEffect } from 'react';
import { memberFetch } from '@/lib/member-fetch';
import { evidencePolicySchema } from '@/lib/evidence/schema';
import type { z } from 'zod';
type View = {
    policy: z.infer<typeof evidencePolicySchema>;
    version: string | null;
};
export default function EvidencePolicy() {
    const [view, setView] = useState<View | null>(null), [draft, setDraft] = useState<View['policy'] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    async function load() {
        try {
            const v = await memberFetch<View>('/api/admin/evidence');
            setView(v);
            setDraft(v.policy);
            setError('');
        }
        catch (e) {
            setError(String(e));
        }
    }
    useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, []);
    async function save() {
        if (!view || !draft)
            return;
        setBusy(true);
        try {
            const v = await memberFetch<View>('/api/admin/evidence', { method: 'PUT', body: JSON.stringify({ version: view.version, policy: draft }) });
            setView(v);
            setDraft(v.policy);
            setError('');
            setNotice('已儲存。歷史達成階段不倒退，原始對話與任務不改。');
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setBusy(false);
        }
    }
    const labels = { conversations: '進入關鍵痛點前的有效對話數', painConversations: '進入付費驗證前的有效對話數', painShare: '共同痛點最低比例（0–1）', highStrength: '高強度佐證比例（0–1）', mediumStrength: '中強度佐證比例（0–1）', paidCommitments: '開始建置前的已核對付費承諾數' };
    return <div className="max-w-3xl space-y-5 p-6"><h1 className="text-2xl font-bold">驗證框架條件</h1><p>五個驗證階段與行動里程碑分開。調整不改會員方案、不重設已達成階段。</p>{draft && <fieldset disabled={busy} className="space-y-4">{Object.entries(labels).map(([key, label]) => <label className="block" key={key}>{label}<input className="mt-2 block min-h-11 w-full rounded border px-3" type="number" step={key.includes('Share') || key.includes('Strength') ? '.01' : '1'} value={draft[key as keyof typeof draft]} onChange={e => setDraft({ ...draft, [key]: Number(e.target.value) })}/></label>)}<button type="button" onClick={() => void save()} className="min-h-11 rounded bg-black px-5 text-white">儲存條件</button></fieldset>}{notice && <p role="status">{notice}</p>}{error && <p role="alert" className="whitespace-pre-wrap text-red-700">{error}</p>}<button type="button" disabled={busy} className="min-h-11 border px-5" onClick={() => void load()}>重新載入最新設定</button></div>;
}
