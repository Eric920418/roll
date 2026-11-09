import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { ok, unauthorized, failFromError } from '@/lib/api';
import Anthropic from '@anthropic-ai/sdk';
import { logSecurityError } from '@/lib/security/log';
import { getUserSession } from '@/lib/auth/guard';
import { browserMutationGuard } from '@/lib/security/http';
import { roadmapFailure } from '@/lib/roadmap/http';
import { fillPlanCopy, localizationInput, readPlanCopy } from '@/lib/action-plan/localization-service';

export const maxDuration = 60;
function response(data: Awaited<ReturnType<typeof readPlanCopy>>) {
  const result = ok(data, data.status === 'pending' ? 202 : 200);
  result.headers.set('Cache-Control', 'private, no-store'); return result;
}
async function failure(error: unknown) {
  const result = error instanceof Anthropic.APIConnectionTimeoutError ? failFromError(error, 504)
    : error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError ? failFromError(error, error instanceof Anthropic.APIError && error.status === 503 ? 503 : 502)
    : roadmapFailure(error);
  const body = await result.json();
  body.requestId ||= logSecurityError('plan.localization', error); body.code ||= 'plan_localization';
  return NextResponse.json(body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } });
}
export async function GET(req: NextRequest) {
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    return response(await readPlanCopy(session.uid, localizationInput.parse(Object.fromEntries(req.nextUrl.searchParams))));
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  const blocked = browserMutationGuard(req, true); if (blocked) return blocked;
  try {
    const session = await getUserSession(); if (!session) return unauthorized();
    return response(await fillPlanCopy(session.uid, localizationInput.parse(await req.json())));
  } catch (error) { return failure(error); }
}
