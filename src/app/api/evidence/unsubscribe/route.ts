import { memberError, privateOk } from '@/lib/member-http';
import { unsubscribeEvidence } from '@/lib/evidence/reminders';
export async function GET() { return Response.json({ error: '請使用確認頁或一鍵退訂 POST / Use the confirmation page or one-click POST' }, { status: 405 }); }
export async function POST(req: Request) {
    try {
        const token = new URL(req.url).searchParams.get('token') || (req.headers.get('content-type')?.includes('application/json') ? (await req.json()).token : '');
        return privateOk(await unsubscribeEvidence(typeof token === 'string' ? token : ''));
    }
    catch (e) {
        return memberError(e);
    }
}
