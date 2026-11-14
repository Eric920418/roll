import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { pdfRuntime } from './helpers/pdf-runtime';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function transport(fetcher: (url: string, init?: RequestInit) => Promise<Response>) {
  return pdfRuntime({ '@/lib/analytics': { analyticsFetch: fetcher } }, { FormData })<typeof import('../src/lib/member-fetch')>('src/lib/member-fetch.ts');
}
test('Member reads retain safe HTTP, code and trace details and reject malformed success envelopes', async () => {
  for (const status of [401, 403, 503]) {
    const { memberFetch } = transport(async () => Response.json({ error: 'Safe failure', code: 'qa_read', requestId: 'qa-trace' }, { status }));
    await assert.rejects(memberFetch('/api/matchmaking'), (e: Error) => e.message.includes(`HTTP ${status}`) && e.message.includes('qa_read') && e.message.includes('qa-trace'));
  }
  const malformed = transport(async () => Response.json({ success: true }));
  await assert.rejects(malformed.memberFetch('/api/matchmaking', { timeoutMs: 20000 }), /HTTP 200[\s\S]*invalid_response/);
  const good = transport(async () => Response.json({ data: { cards: [], hasMore: false } }));
  assert.equal(JSON.stringify(await good.memberFetch('/api/matchmaking')), JSON.stringify({ cards: [], hasMore: false }));
});
test('Opt-in read timeout cancels a pending read without inventing an HTTP response', async () => {
  let aborted = false;
  const { memberFetch } = transport(async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => { aborted = true; reject(init!.signal!.reason); }, { once: true })));
  const result = assert.rejects(memberFetch('/api/network/features', { timeoutMs: 10 }), (e: Error) => e.message.includes('read_timeout') && !e.message.includes('HTTP'));
  await Promise.all([result, delay(30)]);
  assert(aborted);
});
test('Caller cancellation stays distinct from a timeout, and unbounded requests keep the caller signal', async () => {
  const controller = new AbortController();
  const { memberFetch } = transport(async (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })));
  const result = assert.rejects(memberFetch('/api/matchmaking', { signal: controller.signal, timeoutMs: 20000 }), (e: Error) => e.name === 'AbortError' && !e.message.includes('read_timeout'));
  controller.abort(); await result;
  let signal: AbortSignal | null | undefined;
  const normal = transport(async (_url, init) => { signal = init?.signal; return Response.json({ data: null }); });
  await normal.memberFetch('/api/action-plans/assist', { method: 'POST', signal: controller.signal });
  assert.equal(signal, controller.signal);
  const legacy = transport(async () => Response.json({ saved: true }));
  assert.equal(await legacy.memberFetch('/legacy-write', { method: 'POST' }), undefined);
});
test('A stalled response body retains an HTTP status already received', async () => {
  const { memberFetch } = transport(async (_url, init) => {
    const response = new Response('', { status: 503 });
    response.text = () => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }));
    return response;
  });
  await Promise.all([assert.rejects(memberFetch('/api/matchmaking', { timeoutMs: 10 }), /HTTP 503[\s\S]*read_timeout/), delay(30)]);
});
test('Compact country filters retain all choices and existing values in both languages', () => {
  const load = pdfRuntime({ react: { ...React, useId: () => 'country-filter', useState: () => ['', () => {}], useMemo: (fn: () => unknown) => fn() } });
  const Country = load<typeof import('../src/components/ui/CountrySelect')>('src/components/ui/CountrySelect.tsx').default;
  for (const locale of ['en', 'zh-tw']) for (const value of ['TW', 'Existing country']) {
    const props = { locale, value, label: 'Country', onChange: () => { throw new Error('Rendering cannot change a country'); } };
    const full = renderToStaticMarkup(React.createElement(Country, props));
    const compact = renderToStaticMarkup(React.createElement(Country, { ...props, compact: true }));
    assert(!compact.includes('type="search"')); assert(!full.includes('type="search"'));
    assert.equal((full.match(/<select/g) || []).length, 1);
    if (value === 'Existing country') { assert(!full.includes('Existing country ·')); assert.match(full, /value="Existing country" disabled="" selected=""/); }
    assert.equal((compact.match(/<option/g) || []).length, (full.match(/<option/g) || []).length);
    assert((compact.match(/<option/g) || []).length > 200);
    assert.match(compact, new RegExp(`value="${value}"[^>]*selected=""`));
  }
});
