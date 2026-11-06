import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
export function pdfRuntime(mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
    const cache = new Map<string, {
        exports: unknown;
    }>(), native = createRequire(import.meta.url);
    function load<T>(file: string): T {
        const full = resolve(file), cached = cache.get(full);
        if (cached)
            return cached.exports as T;
        const loaded = { exports: {} };
        cache.set(full, loaded);
        const source = readFileSync(full, 'utf8');
        runInNewContext(ts.transpileModule(source, { fileName: full, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, { module: loaded, exports: loaded.exports, Date, Intl, URL, URLSearchParams, Buffer, Request, Response, Headers, AbortSignal, TextEncoder, console, setTimeout, clearTimeout, process: { env: {} }, ...globals, require: (id: string) => {
                if (Object.hasOwn(mocks, id))
                    return mocks[id];
                if (id.startsWith('@/') || id.startsWith('.')) {
                    const base = id.startsWith('@/') ? resolve('src', id.slice(2)) : resolve(dirname(full), id);
                    const target = [base, base + '.ts', base + '.tsx'].find(p => existsSync(p) && /\.tsx?$/.test(p));
                    if (target)
                        return load(target);
                }
                return native(id);
            } }, { filename: full });
        return loaded.exports as T;
    }
    return load;
}
