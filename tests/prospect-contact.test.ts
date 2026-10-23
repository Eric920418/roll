import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { publicWebsite, type ProspectCompany } from "../src/lib/validation/prospect-schema";

const buyer: ProspectCompany = { name: "Buyer", aliases: [], website: "https://buyer.example.com", reason: "Potential fit", taiwan: { url: "https://buyer.example.com/about", quote: "Taiwan" }, fit: { url: "https://buyer.example.com/about", quote: "Software" }, contact: { kind: "page", value: "https://buyer.example.com/contact", source: { url: "https://buyer.example.com/contact", quote: "Contact us" } } };
type Reply = { status?: number; type?: string; location?: string; error?: boolean };
function checker(replies: Reply[], addresses: Record<string, string[]> = {}) {
  const require = createRequire(import.meta.url), connections: string[] = [];
  let attempts = 0, signal: AbortSignal | undefined;
  const loaded = { exports: {} as typeof import("../src/lib/validation/prospect-contact") };
  runInNewContext(ts.transpileModule(readFileSync("src/lib/validation/prospect-contact.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module: loaded, exports: loaded.exports, URL, AbortSignal,
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "./prospect-schema") return { publicWebsite };
      if (name === "node:dns") return { lookup: (host: string, options: { family: number; all: boolean }, callback: (error: null, addresses: { address: string; family: number }[]) => void) => { assert.equal(options.family, 4); assert(options.all); callback(null, (addresses[host] || ["93.184.216.34"]).map(address => ({ address, family: 4 }))); } };
      if (name === "node:https") return { get: (url: string, options: { family: number; signal: AbortSignal; lookup: (host: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => void; headers: Record<string, string> }, respond: (reply: object) => void) => {
        const request = new EventEmitter(), reply = replies[attempts++] || {};
        assert.equal(options.family, 4); assert(options.signal instanceof AbortSignal);
        if (signal) assert.equal(options.signal, signal, "Redirects share one total timeout"); else signal = options.signal;
        assert.equal(Object.keys(options.headers).length, 1, "No credentials or cookies are sent");
        queueMicrotask(() => options.lookup(new URL(url).hostname, {}, (error, address, family) => {
          if (error || reply.error) { request.emit("error", error || new Error("Network failed")); return; }
          assert.equal(family, 4); connections.push(address);
          respond({ statusCode: reply.status ?? 200, headers: { "content-type": reply.type || "text/html", location: reply.location }, destroy() {} });
        }));
        return request;
      } };
      return require(name);
    },
  });
  return { ...loaded.exports, connections, attempts: () => attempts };
}

test("Contact probes pin public DNS, reject metadata/private IPs and do not forward credentials", async () => {
  const fn = checker([{}]); assert(await fn.reachableProspectContact(buyer)); assert.deepEqual(fn.connections, ["93.184.216.34"]);
  for (const address of ["127.0.0.1", "0.0.0.0", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "168.63.129.16", "100.100.100.200", "192.0.2.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "255.255.255.255", "::1", "::ffff:127.0.0.1", "2001:db8::1", "invalid"]) {
    assert.equal(fn.publicProspectAddress(address), false, address);
    const blocked = checker([{}], { "buyer.example.com": [address] }); assert.equal(await blocked.reachableProspectContact(buyer), false, address); assert.equal(blocked.connections.length, 0);
  }
  for (const address of ["1.1.1.1", "8.8.8.8", "104.18.1.1", "93.184.216.34"]) assert(fn.publicProspectAddress(address));
});

test("Only reachable HTML qualifies; failures and unsafe/excessive redirects cannot fill the list", async () => {
  for (const reply of [{ status: 403 }, { status: 404 }, { status: 429 }, { error: true }, { type: "application/json" }]) assert.equal(await checker([reply]).reachableProspectContact(buyer), false);
  assert(await checker([{ status: 301, location: "/contact-us" }, {}]).reachableProspectContact(buyer));
  for (const location of ["http://buyer.example.com/contact", "https://other.example.com/contact", "https://127.0.0.1/contact", "https://user:pass@buyer.example.com/contact"]) {
    const fn = checker([{ status: 302, location }, {}]); assert.equal(await fn.reachableProspectContact(buyer), false); assert.equal(fn.attempts(), 1);
  }
  const rebinding = checker([{ status: 302, location: "https://private.buyer.example.com/contact" }, {}], { "private.buyer.example.com": ["127.0.0.1"] });
  assert.equal(await rebinding.reachableProspectContact(buyer), false); assert.equal(rebinding.connections.length, 1);
  const loop = checker(Array(4).fill({ status: 302, location: "/contact" })); assert.equal(await loop.reachableProspectContact(buyer), false); assert.equal(loop.attempts(), 3);
});
