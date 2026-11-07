import { requireAdmin } from '@/lib/auth/guard';
import { browserMutationGuard } from '@/lib/security/http';
import { memberError, privateOk } from '@/lib/member-http';
import { commerceSettings, mutateCommerce, commerceMutationSchema } from '@/lib/billing/commerce';
import { checkRateLimit, MINUTE_MS } from '@/lib/rate-limit';
export const maxDuration = 180;
export async function GET() {
  if (!await requireAdmin()) return Response.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 });
  try { return privateOk(await commerceSettings()); } catch (error) { return memberError(error); }
}
export async function POST(req: Request) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  const actor = await requireAdmin(); if (!actor) return Response.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 });
  try {
    if (!(await checkRateLimit(`commerce-admin:${actor.email}`, 20, MINUTE_MS)).ok) return Response.json({ error: '設定請求過於頻繁，請稍後重試', code: 'rate_limited' }, { status: 429 });
    const raw = await req.text(); if (raw.length > 30000) return Response.json({ error: '設定內容過大', code: 'input_too_large' }, { status: 413 });
    return privateOk(await mutateCommerce(commerceMutationSchema.parse(JSON.parse(raw)), actor.email));
  } catch (error) { return memberError(error); }
}
