import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("AI 組織核對只限管理員、唯讀且不洩漏金鑰或供應商原始錯誤", async () => {
  const require = createRequire(import.meta.url);
  let admin = false, calls = 0, error: Error | null = null;
  const id = "b7e25696-9491-40b9-b36d-8932f4610d23";
  class APIError extends Error { constructor(public status: number) { super("secret-test-credential"); } }
  class Client {
    static APIError = APIError;
    async get(path: string, options: { headers: Record<string, string> }) {
      calls++;
      assert.equal(path, "/v1/organizations/me");
      assert.equal(options.headers["anthropic-version"], "2026-10-21");
      if (error) throw error;
      return { id, name: "QA Organization", secret: "secret-test-credential" };
    }
  }
  const loaded = { exports: {} as { GET: () => Promise<Response> } };
  runInNewContext(ts.transpileModule(readFileSync("src/app/api/admin/ai-provider/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: loaded, exports: loaded.exports, process: { env: { VERCEL_DEPLOYMENT_ID: "deployment-test" } },
    require: (module: string) => {
      if (module === "@anthropic-ai/sdk") return { default: Client };
      if (module === "@/lib/auth/guard") return { requireAdmin: async () => admin };
      if (module === "@/lib/api") return {
        ok: (data: unknown) => Response.json({ data }),
        fail: (error: string, status: number) => Response.json({ error }, { status }),
        unauthorized: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
      };
      return require(module);
    },
  });
  assert.equal((await loaded.exports.GET()).status, 401);
  assert.equal(calls, 0);
  admin = true;
  const response = await loaded.exports.GET();
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await response.json(), { data: { provider: "anthropic", organization: { id, name: "QA Organization" }, deployment: "deployment-test" } });
  for (error of [new APIError(401), new APIError(403), new APIError(400), new Error("secret-test-credential")]) {
    const failed = await loaded.exports.GET();
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("Cache-Control"), "private, no-store");
    assert.ok(!(await failed.text()).includes("secret-test-credential"));
  }
});
