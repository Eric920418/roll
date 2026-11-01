import fs from "node:fs";
import { createRequire } from "node:module";
for (const file of [".env.local", ".env"]) { try { process.loadEnvFile(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
const require = createRequire(import.meta.url), loader = require("node:module"), resolveModule = loader._resolveFilename;
loader._resolveFilename = function(name: string, ...args: unknown[]) { return name === "server-only" ? require.resolve("next/dist/compiled/server-only/empty") : resolveModule.call(this, name, ...args); };
async function main() {
  const { couponTerms, couponPlanBody, assertCouponPlan } = await import("../src/lib/billing/coupons");
  const { paypalPlanIdFor, novemberPaypalPlanEnvFor } = await import("../src/lib/billing/plans");
  const { getPaypalEnvironment } = await import("../src/lib/billing/config");
  const apply = process.argv.includes("--apply"), environment = getPaypalEnvironment();
  const { getBillingPlan, createBillingPlan } = await import("../src/lib/billing/paypal");
  const results = [];
  for (const plan of ["pro", "business"] as const) for (const interval of ["month", "year"] as const) {
    const quote = couponTerms(plan, interval), env = novemberPaypalPlanEnvFor(plan, interval)!;
    if (!apply) { results.push({ env, first: quote.firstAmountMinor / 100, renewal: quote.regularAmountMinor / 100, interval, configured: Boolean(process.env[env]) }); continue; }
    const regularId = paypalPlanIdFor(plan, interval); if (!regularId) throw new Error("Regular PayPal plan not configured");
    const regular = await getBillingPlan(regularId) as { product_id?: string };
    if (!regular.product_id) throw new Error("Regular PayPal product missing");
    const id = process.env[env] || (await createBillingPlan(couponPlanBody(regular.product_id, quote), `nova60-2026-${plan}-${interval}-${environment}`)).id;
    if (!/^P-[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid PayPal plan ID");
    // Persist every returned ID before the next request so retries keep using the same plans.
    const path = ".env.local", source = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
    const pattern = new RegExp(`^${env}=.*$`, "m"), line = `${env}=${id}`;
    fs.writeFileSync(path, pattern.test(source) ? source.replace(pattern, line) : `${source}${source.endsWith("\n") || !source ? "" : "\n"}${line}\n`, { mode: 0o600 });
    process.env[env] = id;
    assertCouponPlan(await getBillingPlan(id), quote, regular.product_id);
    results.push({ env, id, first: quote.firstAmountMinor / 100, renewal: quote.regularAmountMinor / 100, interval });
  }
  console.log(JSON.stringify({ environment, apply, results, subscriptionsCreated: 0, paymentsCaptured: 0 }));
}
main().catch(error => { console.error(JSON.stringify({ error: "Coupon plan setup failed; promotion remains disabled", type: error instanceof Error ? error.name : "Unknown", status: typeof error?.status === "number" ? error.status : undefined, code: typeof error?.code === "string" ? error.code : undefined })); process.exitCode = 1; });
