import { requirePlan } from '@/lib/billing/gate';
import { browserMutationGuard } from '@/lib/security/http';
import { memberError, privateOk } from '@/lib/member-http';
import { analysisInput, analyseEvidence } from '@/lib/evidence/analysis';
export const maxDuration = 120;
export async function POST(req: Request) {
    const blocked = browserMutationGuard(req, true);
    if (blocked)
        return blocked;
    try {
        const account = await requirePlan('pro');
        if (!account)
            return Response.json({ error: '需要有效方案 / Active plan required' }, { status: 403 });
        return privateOk(await analyseEvidence(account, analysisInput.parse(await req.json())));
    }
    catch (e) {
        return memberError(e);
    }
}
