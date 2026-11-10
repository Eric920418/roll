import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import * as routes from '../src/lib/routes';
import * as contact from '../src/lib/public-contact';
const require = createRequire(import.meta.url);
const messages = Object.fromEntries(['en', 'zh-tw'].map(l => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]));
function load(locale: string, fail = false) {
    const loaded = { exports: {} as {
            default: (p: object) => Promise<React.ReactNode>;
        } };
    const css = new Proxy({}, { get: (_, name) => String(name) });
    const mocks: Record<string, unknown> = {
        './Newsletter': { default: () => null },
        'next/image': { default: (props: Record<string, unknown>) => require('react').createElement('img', Object.fromEntries(Object.entries(props).filter(([k]) => !['fill', 'priority'].includes(k)))) }, 'next/link': { default: 'a' }, './landing.module.css': { default: css },
        '@/lib/routes': routes, '@/lib/public-contact': contact, '@/lib/security/log': { logSecurityError: () => 'trace-qa', publicErrorMessage: () => 'HTTP 503 · trace-qa' },
        'next-intl/server': { getTranslations: async () => (key: string) => key.split('.').reduce((v, k) => v[k], messages[locale].AboutV10.team) },
        '@/lib/cms/i18n': { pick: (v: unknown, l: string) => typeof v === 'string' ? v : (v as Record<string, string>)[l] || '' },
        '@/lib/cms/rollon-content': { getRollonAssets: async () => ({ image: (v: string) => v, error: '' }) },
        '@/lib/cms/content': { getWorkCases: async () => fail ? Promise.reject(new Error('private connection string')) : [{ id: 'real', href: 'https://example.com/case', image: '/Medix.png', group: 'Published ROLL ON case', description: { en: 'Published description', 'zh-tw': '已發布案例' } }], getEvents: async () => [{id:'dated',title:'Published team session',date:'2026-10-15',location:'Taipei',description:'Published event information'},{id:'pending',title:'Undated placeholder',date:'Coming Up',location:'',description:''}], getVideos: async () => fail ? Promise.reject(new Error('private connection string')) : [], getSetting: async () => ({}) },
    };
    runInNewContext(ts.transpileModule(readFileSync('src/components/sections/product/NovaLanding.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText, { module: loaded, exports: loaded.exports, require: (id: string) => Object.hasOwn(mocks, id) ? mocks[id] : require(id) });
    return loaded.exports.default;
}
for (const locale of ['en', 'zh-tw'] as const)
    test(`NOVA public ${locale}: real content only, valid funnel, one main heading, safe failure`, async () => {
        const html = renderToStaticMarkup(await load(locale)({ locale, pricing: 'Actual pricing' }));
        assert.equal((html.match(/<h1/g) || []).length, 1);
        assert(html.includes(routes.pathForLocale('/signup', locale)));
        assert(html.includes(locale === 'en' ? 'Inside NOVA AI' : 'NOVA AI 幕後'));
        assert(!html.includes('/medix-'));
        for (const file of ['quibi', 'dropbox', 'zappos']) assert.match(html, new RegExp(`/nova/cases/${file}-[a-f0-9]{8}\\.webp`));
        assert.equal((html.match(/casePhoto/g) || []).length, 3);
        for (const name of ['Quibi', 'Dropbox', 'Zappos']) assert(html.includes(name));
        assert(html.indexOf('aria-label="Quibi"') < html.indexOf('aria-label="Dropbox"'));
        assert(html.indexOf('aria-label="Dropbox"') < html.indexOf('aria-label="Zappos"'));
        for (const metric of ['$1.75B', '15×', '0']) assert(html.includes(`<h3 class="caseNumber">${metric}</h3>`));
        assert(html.includes('Evidence is not.') || html.includes('證據，不必昂貴。'));
        assert(html.includes(locale === 'en' ? 'Waitlist growth from one demo video' : '一支示範影片帶來的候補名單成長'));
        assert(html.includes(locale === 'en' ? 'Inventory before the first sale' : '第一筆成交前的庫存'));
        assert(html.includes(contact.MEETING_URL));
        assert(html.includes(locale === 'en' ? 'Founder &amp; CEO, NOVA AI &amp; Roll On' : '創辦人暨執行長，NOVA AI 與 Roll On'));
        assert(html.includes(locale === 'en' ? 'Co-founder &amp; CTO, NOVA AI' : '共同創辦人暨技術長，NOVA AI'));
        assert(html.includes('id="team"'));
        assert(html.indexOf('Vivian Lee') < html.indexOf('<h3>Eric</h3>'));
        assert(html.indexOf('<h3>Eric</h3>') < html.indexOf('<h3>Vincent</h3>'));
        assert(html.indexOf('<h3>Vincent</h3>') < html.indexOf('<h3>Iris</h3>'));
        assert(!html.includes('teamPlaceholder'));
        assert(html.includes('Taiwan Startup Hub') && html.includes('Ark Project'));
        assert(html.includes('dateTime="2026-11-16"') || html.includes('datetime="2026-11-16"'));
        assert.equal((html.match(new RegExp('<h3>' + (locale === 'en' ? 'Coming soon' : '即將推出') + '</h3>', 'g')) || []).length, 2);
        assert(html.includes('Actual pricing'));assert(!html.includes('Published team session'));assert(!html.includes('Undated placeholder'));
        assert(!/Nov 16|15 qualified|80% off|\[Photo|Real founder quote/.test(html));
        const error = renderToStaticMarkup(await load(locale, true)({ locale, pricing: '' }));
        assert(error.includes('trace-qa'));
        assert(!error.includes('private connection string'));
    });
