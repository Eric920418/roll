import 'server-only';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { MemberError } from '@/lib/member-http';
import { canonicalEmailPayload, safeEmailError } from '@/lib/rewards/reminders';
import { getInsightTeasers } from '@/lib/cms/content';
import { pick } from '@/lib/cms/i18n';
import { nextWeeklyAt } from '@/lib/rewards/policy';
import { INSIGHT_SLUGS, pathForLocale } from '@/lib/routes';
export const signupSchema = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), locale: z.enum(['en', 'zh-tw']), timeZone: z.string().max(100).refine(v => {
        try {
            new Intl.DateTimeFormat('en', { timeZone: v });
            return true;
        }
        catch {
            return false;
        }
    }), consent: z.literal(true), company: z.string().max(200).default('') }).strict();
export function newsletterToken(id: string, version: number, action: 'confirm' | 'unsubscribe') {
    if (!process.env.AUTH_SECRET)
        throw new MemberError('電子報簽章設定缺失 / Newsletter signing unavailable', 503);
    const body = [id, version, action].join('.');
    return body + '.' + createHmac('sha256', process.env.AUTH_SECRET).update('newsletter:' + body).digest('hex');
}
export function readNewsletterToken(token: string, action: 'confirm' | 'unsubscribe') {
    const [id, version, kind, sig, extra] = token.split('.');
    if (extra || kind !== action || !/^[A-Za-z0-9_-]{1,100}$/.test(id || '') || !/^\d{1,9}$/.test(version || '') || !/^[a-f0-9]{64}$/.test(sig || ''))
        throw new MemberError('電子報連結無效 / Invalid newsletter link', 400);
    const expected = newsletterToken(id, Number(version), action).split('.').at(-1)!;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
        throw new MemberError('電子報連結無效 / Invalid newsletter link', 400);
    return { id, version: Number(version) };
}
export const nextNewsletterAt = nextWeeklyAt;
const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
function origin() {
    const url = process.env.NEXT_PUBLIC_APP_URL;
    if (!url || new URL(url).protocol !== 'https:')
        throw new MemberError('電子報需要正式 HTTPS 網址 / Newsletter requires an HTTPS app origin', 503);
    return url;
}
function available() {
    if (process.env.MEMBER_NETWORK_EMAIL_ENABLED !== 'true' || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !process.env.AUTH_SECRET)
        throw new MemberError('電子報寄送目前未開放，輸入保留，請稍後重試 / Newsletter delivery is unavailable; your input is retained. Retry later', 503);
    origin();
}
function emailPayload(to: string, subject: string, text: string, unsubscribe?: string) { return { from: process.env.RESEND_FROM_EMAIL!, to: [to], subject, text, html: `<div style="font-family:sans-serif;max-width:560px;margin:auto"><p style="font-weight:bold;letter-spacing:.12em">NOVA AI</p><h1>${escape(subject)}</h1><p style="white-space:pre-wrap;line-height:1.7">${escape(text)}</p></div>`, ...(unsubscribe ? { headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}) }; }
export async function signupNewsletter(input: z.infer<typeof signupSchema>, now = new Date()) {
    if (input.company)
        return { accepted: true };
    available();
    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${input.email}))`;
        let row = await tx.newsletterSubscriber.findUnique({ where: { email: input.email } });
        if (row?.status === 'active' || row && now.getTime() - row.consentAt.getTime() < 15 * 60000)
            return;
        const data = { locale: input.locale, timeZone: input.timeZone, status: 'pending', nextDigestAt: null, consentAt: now, confirmedAt: null, verificationExpiresAt: new Date(now.getTime() + 72 * 3600000) };
        row = row ? await tx.newsletterSubscriber.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } }) : await tx.newsletterSubscriber.create({ data: { ...data, email: input.email, createdAt: now } });
        const token = newsletterToken(row.id, row.version, 'confirm'), href = new URL(pathForLocale('/newsletter/confirm', input.locale) + '?token=' + encodeURIComponent(token), origin()).href;
        const title = input.locale === 'zh-tw' ? '確認訂閱 NOVA 創辦人電子報' : 'Confirm your NOVA founder newsletter subscription';
        const text = (input.locale === 'zh-tw' ? '你主動要求訂閱每週公開創辦人指南。請在 72 小時內開啟下方連結並按確認；未確認不會寄送週報。若不是你提出，忽略此信即可。' : 'You requested weekly public founder guides. Open this link and confirm within 72 hours. Weekly emails begin only after confirmation. If you did not request this, ignore this email.') + '\n\n' + href;
        await tx.newsletterDelivery.create({ data: { subscriberId: row.id, eventKey: `verify:${row.id}:${row.version}`, category: 'verify', createdAt: now, nextAttemptAt: now, payload: emailPayload(row.email, title, text) as Prisma.InputJsonValue } });
    });
    return { accepted: true };
}
export async function newsletterAction(token: string, action: 'confirm' | 'unsubscribe', now = new Date()) {
    const parsed = readNewsletterToken(token, action);
    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT "id" FROM "NewsletterSubscriber" WHERE "id"=${parsed.id} FOR UPDATE`;
        const row = await tx.newsletterSubscriber.findUnique({ where: { id: parsed.id } });
        if (!row || row.version !== parsed.version)
            throw new MemberError('電子報連結已失效 / Newsletter link expired', 400);
        if (action === 'confirm') {
            if (row.status === 'active')
                return;
            if (row.status !== 'pending' || row.verificationExpiresAt <= now)
                throw new MemberError('確認連結已逾期，請重新訂閱 / Confirmation expired; subscribe again', 400);
            await tx.newsletterSubscriber.update({ where: { id: row.id }, data: { status: 'active', confirmedAt: now, nextDigestAt: nextNewsletterAt(row.timeZone, now) } });
        }
        else {
            await tx.newsletterSubscriber.update({ where: { id: row.id }, data: { status: 'unsubscribed', nextDigestAt: null } });
            await tx.newsletterDelivery.updateMany({ where: { subscriberId: row.id, status: { in: ['pending', 'processing'] } }, data: { status: 'cancelled', leaseToken: null, leaseUntil: null } });
        }
    });
    return { saved: true };
}
export async function runNewsletter(now = new Date(), budgetMs = 70000) {
    if (process.env.MEMBER_NETWORK_EMAIL_ENABLED !== 'true' || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
        return { disabled: true, accepted: 0, failed: 0 };
    available();
    const started = Date.now(), articles = await getInsightTeasers();
    const subscribers = await prisma.newsletterSubscriber.findMany({ where: { status: 'active', nextDigestAt: { lte: now } }, orderBy: { nextDigestAt: 'asc' }, take: 100 });
    for (const row of subscribers) {
        if (Date.now() - started > budgetMs / 2)
            break;
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: row.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(row.nextDigestAt!).map(v => [v.type, v.value]));
        const locale = row.locale === 'zh-tw' ? 'zh-tw' : 'en', zh = locale === 'zh-tw', week = [p.year, p.month, p.day].join('-'), token = newsletterToken(row.id, row.version, 'unsubscribe'), unsubscribe = new URL('/api/newsletter/unsubscribe?token=' + encodeURIComponent(token), origin()).href;
        const links = articles.filter(a => (INSIGHT_SLUGS as readonly string[]).includes(a.slug)).slice(0, 3).map(a => pick(a.title, locale) + '\n' + new URL(pathForLocale('/insights/' + a.slug, locale), origin()).href);
        const content = (zh ? '本週，留一點時間檢視你的客戶證據。以下內容來自 ROLL ON 已公開的創辦人指南。' : 'Take a moment this week to review your customer evidence. These are published founder resources from ROLL ON.') + '\n\n' + (links.length ? links.join('\n\n') : new URL(pathForLocale('/insights', locale), origin()).href) + '\n\n' + (zh ? '前往 NOVA：' : 'Open NOVA: ') + new URL(pathForLocale('/product', locale), origin()).href + '\n\n' + (zh ? '確認退訂：' : 'Unsubscribe: ') + new URL(pathForLocale('/newsletter/unsubscribe', locale) + '?token=' + encodeURIComponent(token), origin()).href;
        await prisma.$transaction(async (tx) => {
            const moved = await tx.newsletterSubscriber.updateMany({ where: { id: row.id, status: 'active', version: row.version, nextDigestAt: row.nextDigestAt }, data: { nextDigestAt: nextNewsletterAt(row.timeZone, now) } });
            if (moved.count) {
                await tx.newsletterDelivery.upsert({ where: { eventKey: `digest:${row.id}:${row.version}:${week}` }, create: { subscriberId: row.id, eventKey: `digest:${row.id}:${row.version}:${week}`, category: 'digest', createdAt: now, nextAttemptAt: now, payload: emailPayload(row.email, zh ? 'NOVA · 本週創辦人閱讀' : 'NOVA · This week’s founder reading', content, unsubscribe) as Prisma.InputJsonValue }, update: {} });
            }
        });
    }
    const jobs = await prisma.newsletterDelivery.findMany({ where: { status: { in: ['pending', 'processing'] }, nextAttemptAt: { lte: now } }, orderBy: { createdAt: 'asc' }, take: 50, include: { subscriber: true } });
    let accepted = 0, failed = 0;
    for (const row of jobs) {
        if (Date.now() - started > budgetMs)
            break;
        const leaseToken = randomUUID();
        if (!(await prisma.newsletterDelivery.updateMany({ where: { id: row.id, status: { in: ['pending', 'processing'] }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { status: 'processing', leaseToken, leaseUntil: new Date(now.getTime() + 300000) } })).count)
            continue;
        const finish = (data: Prisma.NewsletterDeliveryUpdateManyMutationInput) => prisma.newsletterDelivery.updateMany({ where: { id: row.id, leaseToken, status: 'processing' }, data: { ...data, leaseToken: null, leaseUntil: null } });
        try {
            const current = await prisma.newsletterSubscriber.findUnique({ where: { id: row.subscriberId } });
            if (!current || row.category === 'digest' && current.status !== 'active' || row.category === 'verify' && (current.status !== 'pending' || current.verificationExpiresAt <= now) || row.eventKey.split(':')[2] !== String(current.version)) {
                await finish({ status: 'cancelled' });
                continue;
            }
            if (row.attempts >= 3 || now.getTime() - row.createdAt.getTime() >= 86400000) {
                await finish({ status: 'expired' });
                continue;
            }
            const moved = await prisma.newsletterDelivery.updateMany({ where: { id: row.id, leaseToken, status: 'processing' }, data: { attempts: { increment: 1 } } });
            if (!moved.count)
                continue;
            const checked = await prisma.newsletterSubscriber.findUnique({ where: { id: row.subscriberId } });
            if (!checked || checked.version !== current.version || checked.status !== current.status) {
                await finish({ status: 'cancelled' });
                continue;
            }
            const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'nova-newsletter:' + row.id }, body: canonicalEmailPayload(row.payload), signal: AbortSignal.timeout(15000) }), body = await response.json();
            if (!response.ok || typeof body.id !== 'string')
                throw new Error('Resend HTTP ' + response.status);
            await finish({ status: 'accepted', providerId: body.id, acceptedAt: now, lastError: null });
            accepted++;
            await new Promise(r => setTimeout(r, 550));
        }
        catch (e) {
            await finish({ status: row.attempts + 1 >= 3 ? 'failed' : 'pending', attempts: row.attempts + 1, lastError: safeEmailError(e), nextAttemptAt: new Date(now.getTime() + 15 * 60000) });
            failed++;
        }
    }
    return { disabled: false, accepted, failed };
}
