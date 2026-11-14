import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as tick } from 'node:timers/promises';
import * as React from 'react';
import sharp from 'sharp';
import { pdfRuntime } from './helpers/pdf-runtime';
import { googlePhotoUrl, publicCard, type CardDraft } from '../src/lib/matchmaking/schema';

const google = 'https://lh3.googleusercontent.com/a/example=s96-c';
const draft: CardDraft = { role: 'mentor', categories: ['collaboration'], country: 'TW', industry: 'saas', slogan: 'Public pitch', offers: '', looksFor: '', visibleFields: ['photo'] };

test('Google avatars use only trusted hosts and the authorized photo endpoint, respecting photo visibility', () => {
  assert.equal(googlePhotoUrl(google), google);
  for (const value of [null, '', 'http://lh3.googleusercontent.com/a/x', 'https://lh3.googleusercontent.com.evil.test/x', 'https://localhost/x', 'https://lh3.googleusercontent.com:8443/x', 'https://user:pass@lh3.googleusercontent.com/x', 'data:image/png,abc']) assert.equal(googlePhotoUrl(value), null);
  const row = { ...draft, id: 'member', revision: 7, googlePhoto: google, lastActiveAt: null, verified: false, recommended: false };
  const card = publicCard(row, null, { interviews: 0, payingCustomers: null, milestones: 0 }, null);
  assert.equal(card.photo, '/api/matchmaking/members/member/photo?v=7'); assert(!JSON.stringify(card).includes('googleusercontent'));
  assert.equal(publicCard({ ...row, visibleFields: [] }, null, { interviews: 0, payingCustomers: null, milestones: 0 }, null).photo, undefined);
});

test('Google fallback, multipart uploads, original precedence and visibility checks share the same photo route', async () => {
  class PhotoError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const jpeg = await sharp({ create: { width: 96, height: 48, channels: 3, background: '#1266a0' } }).jpeg().toBuffer();
  const row = { id: 'card', userId: 'owner', sourcePolicy: 2, visible: true, visibleFields: ['photo'], originalPhoto: null as string | null, blurredPhoto: null as string | null, revision: 1, lastRequestId: '', lastRequestHash: '', user: { googleId: 'google-owner', image: google } };
  const blobs = new Map<string, Buffer>(), requests: RequestInit[] = [];
  let peer = false, allowed = true, googleStatus = 200, googleBody: BodyInit = new Uint8Array(jpeg), contentType = 'image/jpeg';
  const load = pdfRuntime({ 'server-only': {}, '@/lib/prisma': { prisma: { matchmakingProfile: {
    findUnique: async () => row,
    findFirst: async () => row.visibleFields.includes('photo') ? row : null,
    updateMany: async ({ where, data }: { where: { revision: number }; data: object }) => { if (row.revision !== where.revision) return { count: 0 }; Object.assign(row, data, { revision: row.revision + 1 }); return { count: 1 }; },
  } } }, '@/lib/member-http': { MemberError: PhotoError, changed: () => new PhotoError('Content changed'), memberAccess: async () => 'owner', memberError: (e: PhotoError) => Response.json({ error: e.message }, { status: e.status || 500 }), privateOk: (data: unknown) => Response.json({ data }) },
    '@/lib/network/policy': { networkEnabled: () => true }, '@/lib/network/access': { acceptedConnection: async () => peer ? {} : null, requireNetwork: async () => { if (!allowed) throw new PhotoError('Access denied', 403); } },
    './service': { requestHash: (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex') },
    '@vercel/blob': { put: async (pathname: string, bytes: Buffer) => { blobs.set(pathname, bytes); return { pathname }; }, get: async (pathname: string) => ({ statusCode: 200, stream: new Uint8Array(blobs.get(pathname)!) }) },
  }, { File, FormData, Error, process: { env: { MATCHMAKING_BLOB_READ_WRITE_TOKEN: 'private-qa-only' } }, fetch: async (_url: string, init: RequestInit) => { requests.push(init); return new Response(googleBody, { status: googleStatus, headers: { 'Content-Type': contentType } }); } });
  const photos = load<typeof import('../src/lib/matchmaking/photo')>('src/lib/matchmaking/photo.ts');
  const imageWidth = async (response: Response) => (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).width;
  assert.equal(await imageWidth(await photos.readPhoto('owner')), 96);
  assert.equal(await imageWidth(await photos.readPhoto('viewer', 'card')), 480);
  peer = true; assert.equal(await imageWidth(await photos.readPhoto('viewer', 'card')), 96); peer = false;
  assert(requests.every(r => r.redirect === 'error' && r.cache === 'no-store' && r.signal));
  allowed = false; const beforeDenied = requests.length;
  await assert.rejects(photos.readPhoto('viewer', 'card'), /Access denied/); assert.equal(requests.length, beforeDenied); allowed = true;
  row.visible = false; await assert.rejects(photos.readPhoto('viewer', 'card'), /not found/); row.visible = true;
  row.visibleFields = []; await assert.rejects(photos.readPhoto('viewer', 'card'), /not found/); row.visibleFields = ['photo'];
  googleStatus = 403; await assert.rejects(photos.readPhoto('owner'), /Google avatar HTTP 403/); googleStatus = 200;
  googleBody = 'not an image'; contentType = 'text/html'; await assert.rejects(photos.readPhoto('owner'), /Google photo unavailable/);
  googleBody = new Uint8Array(3 * 1024 * 1024 + 1); contentType = 'image/jpeg'; await assert.rejects(photos.readPhoto('owner'), /exceeds 3 MiB/);
  googleBody = new Uint8Array(jpeg);
  const route = load<typeof import('../src/app/api/matchmaking/me/photo/route')>('src/app/api/matchmaking/me/photo/route.ts');
  const form = new FormData(); form.set('photo', new File([new Uint8Array(jpeg)], 'photo.jpg', { type: 'image/jpeg' })); form.set('revision', '1'); form.set('requestId', randomUUID());
  const saved = await route.POST(new Request('https://example.test/api/matchmaking/me/photo', { method: 'POST', headers: { Origin: 'https://example.test' }, body: form }));
  assert.equal(saved.status, 200, await saved.clone().text()); assert.equal(row.revision, 2); assert.equal(blobs.size, 2);
  const calls = requests.length, own = await photos.readPhoto('owner');
  assert.equal(own.headers.get('Cache-Control'), 'private, no-store'); assert.deepEqual(Buffer.from(await own.arrayBuffer()), blobs.get(row.originalPhoto!)); assert.equal(requests.length, calls);
  row.visibleFields = []; assert.equal(await imageWidth(await photos.readPhoto('owner')), 96); await assert.rejects(photos.readPhoto('viewer', 'card'), /not found/);
});

test('Private photos expose HTTP, invalid-response and decode failures; retries do not navigate parent links', async () => {
  for (const failure of ['http', 'html', 'empty', 'decode']) {
    const state: unknown[] = [], effects: Array<() => (() => void) | void> = []; let cursor = 0;
    const load = pdfRuntime({ react: { ...React, useState: (value: unknown) => { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], (next: unknown) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; }, useEffect: (effect: () => (() => void) | void) => effects.push(effect) },
      'next-intl': { useLocale: () => 'en', useTranslations: () => (key: string) => key }, 'next/image': { __esModule: true, default: 'img' },
    }, { AbortController, Error, fetch: async () => failure === 'http' ? new Response('Full storage error\ntrace-123', { status: 503 }) : new Response(failure === 'empty' ? '' : 'bytes', { headers: { 'Content-Type': failure === 'html' ? 'text/html' : 'image/webp' } }) });
    const Photo = load<typeof import('../src/components/dashboard/matchmaking/CardView')>('src/components/dashboard/matchmaking/CardView.tsx').PrivatePhoto;
    function render() { cursor = 0; const found: Array<React.ReactElement<Record<string, unknown>>> = []; function visit(node: React.ReactNode) { React.Children.forEach(node, c => { if (React.isValidElement<Record<string, unknown>>(c)) { found.push(c); visit(c.props.children as React.ReactNode); } }); } visit(Photo({ url: '/api/photo', alt: 'Photo', avatar: true })); return found; }
    render(); const cleanup = effects[0](); await tick(0); let tree = render();
    if (failure === 'decode') { const img = tree.find(n => n.type === 'img')!; assert(img.props.src); (img.props.onError as () => void)(); tree = render(); }
    const alert = tree.find(n => n.props.role === 'alert')!; assert(alert);
    const text = JSON.stringify(alert.props.children); assert(text.includes({ http: 'trace-123', html: 'invalid_photo_response', empty: 'empty_photo_response', decode: 'image_decode_failed' }[failure]!));
    let prevented = false, stopped = false; const retry = tree.find(n => n.type === 'button')!;
    (retry.props.onClick as (e: object) => void)({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert(prevented && stopped); assert.equal(state[0], 1); cleanup?.();
  }
});
