import { createHash } from 'node:crypto';
import { browserMutationGuard } from '@/lib/security/http';
import { memberError, privateOk } from '@/lib/member-http';
import { checkRateLimit, clientIp, DAY_MS, MINUTE_MS } from '@/lib/rate-limit';
import { signupNewsletter, signupSchema } from '@/lib/newsletter/service';
export async function POST(req: Request) {
    const blocked = browserMutationGuard(req, true);
    if (blocked)
        return blocked;
    try {
        const text = await req.text();
        if (text.length > 3000)
            return Response.json({ error: 'Input too large' }, { status: 413 });
        const input = signupSchema.parse(JSON.parse(text));
        if (!input.company) {
            const ip = createHash('sha256').update(clientIp(req)).digest('hex'), mail = createHash('sha256').update(input.email).digest('hex');
            if (!(await checkRateLimit('newsletter-ip:' + ip, 5, 60 * MINUTE_MS)).ok || !(await checkRateLimit('newsletter-email:' + mail, 5, DAY_MS)).ok)
                return Response.json({ error: '嘗試過於頻繁，請稍後重試 / Too many attempts; retry later', code: 'rate_limited' }, { status: 429 });
        }
        return privateOk(await signupNewsletter(input));
    }
    catch (e) {
        return memberError(e);
    }
}
