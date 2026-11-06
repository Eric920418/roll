import { memberAccess, memberError, privateOk } from '@/lib/member-http';
import { browserMutationGuard } from '@/lib/security/http';
import { evidenceSnapshot, mutateEvidence } from '@/lib/evidence/service';
import { evidenceMutationSchema } from '@/lib/evidence/schema';
export async function GET() {
    try {
        const user = await memberAccess();
        if (user instanceof Response)
            return user;
        return privateOk(await evidenceSnapshot(user));
    }
    catch (e) {
        return memberError(e);
    }
}
export async function POST(req: Request) {
    const blocked = browserMutationGuard(req, true);
    if (blocked)
        return blocked;
    try {
        const user = await memberAccess(true);
        if (user instanceof Response)
            return user;
        const text = await req.text();
        if (text.length > 150000)
            return Response.json({ error: 'Request too large', code: 'request_too_large' }, { status: 413 });
        return privateOk(await mutateEvidence(user, evidenceMutationSchema.parse(JSON.parse(text))));
    }
    catch (e) {
        return memberError(e);
    }
}
