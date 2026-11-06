import { memberError, privateOk } from '@/lib/member-http';
import { newsletterAction } from '@/lib/newsletter/service';
export async function GET() { return Response.json({ error: 'Use confirmation page or signed POST' }, { status: 405 }); }
export async function POST(req: Request) {
    try {
        const token = new URL(req.url).searchParams.get('token') || (req.headers.get('content-type')?.includes('application/json') ? (await req.json()).token : '');
        return privateOk(await newsletterAction(typeof token === 'string' ? token : '', 'unsubscribe'));
    }
    catch (e) {
        return memberError(e);
    }
}
