import { requireAdmin } from '@/lib/auth/guard';
import { unauthorized } from '@/lib/api';
import { memberError, privateOk, changed } from '@/lib/member-http';
import { browserMutationGuard } from '@/lib/security/http';
import { prisma } from '@/lib/prisma';
import { evidencePolicy } from '@/lib/evidence/service';
import { evidencePolicySchema } from '@/lib/evidence/schema';
import { z } from 'zod';
async function snapshot() { const row = await prisma.setting.findUnique({ where: { key: 'novaEvidencePolicy' } }); return { policy: await evidencePolicy(), version: row?.updatedAt.toISOString() || null }; }
export async function GET() {
    try {
        if (!await requireAdmin())
            return unauthorized();
        return privateOk(await snapshot());
    }
    catch (e) {
        return memberError(e);
    }
}
export async function PUT(req: Request) {
    const blocked = browserMutationGuard(req, true);
    if (blocked)
        return blocked;
    try {
        if (!await requireAdmin())
            return unauthorized();
        const input = z.object({ version: z.iso.datetime().nullable(), policy: evidencePolicySchema }).strict().parse(await req.json());
        await prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext('novaEvidencePolicy'))`;
            const row = await tx.setting.findUnique({ where: { key: 'novaEvidencePolicy' } });
            if ((row?.updatedAt.toISOString() || null) !== input.version)
                throw changed();
            await tx.setting.upsert({ where: { key: 'novaEvidencePolicy' }, create: { key: 'novaEvidencePolicy', value: input.policy }, update: { value: input.policy } });
        });
        return privateOk(await snapshot());
    }
    catch (e) {
        return memberError(e);
    }
}
