import { requirePlan } from '@/lib/billing/gate';
import { browserMutationGuard } from '@/lib/security/http';
import { memberError, privateOk } from '@/lib/member-http';
import { assistInput, assistTask } from '@/lib/action-plan/flow/assist';
import { PlanWriteError } from '@/lib/action-plan/service';
export const maxDuration = 120;
export async function POST(req: Request) {
    const blocked = browserMutationGuard(req, true);
    if (blocked)
        return blocked;
    try {
        const account = await requirePlan('pro');
        if (!account)
            return Response.json({ error: '需要有效方案 / Active plan required' }, { status: 403 });
        const raw = await req.text();
        if (raw.length > 60000)
            return Response.json({ error: '內容過大 / Input too large' }, { status: 413 });
        return privateOk(await assistTask(account, assistInput.parse(JSON.parse(raw))));
    }
    catch (e) {
        if (e instanceof PlanWriteError)
            return Response.json({ error: e.message, code: 'flow_assist_' + e.status }, { status: e.status });
        return memberError(e);
    }
}
