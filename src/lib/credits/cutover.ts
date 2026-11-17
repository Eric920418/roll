import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { tokenQuote } from "@/lib/billing/commerce";
import { features, networkAccount } from "@/lib/network/access";
import { MemberError } from "@/lib/member-http";
import { trialConversion } from "./legacy";
import { canonical, emptyWallet, summary } from "./policy";
import { accountFor, readWallet, saveWallet, type DB } from "./storage";
export type Operation = { key: string; actor: string; reason: string };
const hash = (v: unknown) => createHash("sha256").update(canonical(JSON.parse(JSON.stringify(v)))).digest("hex");
const sourceTables = ["TokenWallet", "TokenLedger", "TokenReservation", "AiAllowance", "AiUsage", "RewardAccount", "RewardEntry", "RewardRedemption", "AiCreditPurchase", "Subscription", "ReferralAccount", "TrialFeedbackGrant", "LegacyFeatureGrant", "FounderOrder"] as const;
async function source(tx: DB, uid: string, now: Date) {
  if (await tx.setting.findUnique({ where: { key: `localCredits.v1:${uid}` } })) throw new MemberError("已有本機原型帳本，禁止重複匯入；請使用新的隔離資料庫 / Prototype wallet exists; do not re-import; use a fresh isolated database", 409);
  const records: Record<string, Record<string, unknown>[]> = {};
  for (const table of sourceTables) records[table] = (await tx.$queryRawUnsafe<{ value: Record<string, unknown> }[]>(`SELECT to_jsonb(t) AS value FROM "${table}" t WHERE "userId"=$1 ORDER BY to_jsonb(t)::text`, uid)).map(r => r.value);
  records.ReferralEntry = (await tx.$queryRaw<{ value: Record<string, unknown> }[]>`SELECT to_jsonb(e) AS value FROM "ReferralEntry" e JOIN "ReferralAccount" a ON a.id=e."accountId" WHERE a."userId"=${uid} ORDER BY e.id`).map(r => r.value);
  const sum = (table: string, field: string, filter: (row: Record<string, unknown>) => boolean = () => true) => records[table].filter(filter).reduce((n, r) => n + Number(r[field] ?? 0), 0);
  const check = (label: string, expected: number, actual: number) => { if (expected !== actual) throw new MemberError(`轉換核對失敗 ${label}：應有 ${expected}，實有 ${actual} / Conversion reconciliation failed ${label}: expected ${expected}, actual ${actual}`, 409); };
  if (records.RewardEntry.some(r => Number(r.points) > 0 && !["visit", "action", "quiz", "profile", "customer_stage"].includes(String(r.kind)))) throw new MemberError("未知獎勵來源，請人工核對 / Unknown reward origin; manual reconciliation required", 409);
  const ai = records.AiAllowance[0], usages = records.AiUsage, purchases = records.AiCreditPurchase.filter(r => r.status === "COMPLETED");
  check("included used", usages.filter(r => r.source === "included" && r.status === "succeeded" && r.cycleStart === ai?.cycleStart).length, Number(ai?.includedUsed ?? 0));
  check("included reserved", usages.filter(r => r.source === "included" && r.status === "pending" && r.cycleStart === ai?.cycleStart).length, Number(ai?.includedReserved ?? 0));
  for (const p of purchases) if (!p.paypalCaptureId || !p.completedAt || Number(p.amountMinor) <= 0 || Number(p.credits) <= 0) throw new MemberError(`加購收據不完整 / Incomplete purchase receipt: ${p.id}`, 409);
  check("purchased AI", sum("AiCreditPurchase", "credits", r => r.status === "COMPLETED") - usages.filter(r => r.source === "bonus" && ["pending", "succeeded"].includes(String(r.status))).length, Number(ai?.bonusBalance ?? 0));
  check("reward AI", sum("RewardRedemption", "credits") + sum("ReferralEntry", "credits") - usages.filter(r => r.source === "reward" && ["pending", "succeeded"].includes(String(r.status))).length, Number(ai?.rewardBalance ?? 0));
  check("referral debt", sum("ReferralEntry", "debtDelta"), Number(records.ReferralAccount[0]?.debt ?? 0));
  check("redemption points", -sum("RewardRedemption", "points"), sum("RewardEntry", "points", r => r.kind === "redeem"));
  for (const r of records.RewardRedemption) check(`redemption ${r.id}`, -Number(r.points), Number(records.RewardEntry.find(e => e.eventKey === `redeem:${r.requestId}`)?.points ?? 0));
  if (usages.some(r => r.source === "credits")) throw new MemberError("已有新點數使用，禁止重複轉換 / Credits usage exists; conversion blocked", 409);
  for (const h of records.TokenReservation) {
    if (!["reserved", "captured", "released", "refunded"].includes(String(h.status))) throw new MemberError(`未知預扣狀態 / Unknown hold status: ${h.id}`, 409);
    check(`hold ${h.id} available`, ["reserved", "captured"].includes(String(h.status)) ? -Number(h.amount) : 0, sum("TokenLedger", "availableDelta", r => r.reservationId === h.id));
    check(`hold ${h.id} reserved`, h.status === "reserved" ? Number(h.amount) : 0, sum("TokenLedger", "reservedDelta", r => r.reservationId === h.id));
  }
  const account = await networkAccount(uid, tx);
  const entitlementKeys = ["plan", "subscriptionStatus", "paypalSubscriptionId", "currentPeriodEnd", "planUpdatedAt", "rollonMember", "trialPlan", "trialStartsAt", "trialEndsAt", "trialPolicy", "founderStartedAt", "founderEndsAt", "featurePolicy", "createdAt", "betaAccess", "effectivePlan", "verifiedInvestor"] as const;
  const rights = Object.fromEntries(entitlementKeys.map(k => [k, account[k]]));
  const conversion = await trialConversion(tx, uid, now), quote = await tokenQuote(tx);
  const evidence = { legacy: Object.fromEntries(Object.entries(conversion.before).filter(([key]) => key !== "userId")), recordsHash: hash(records), rightsHash: hash(rights), features: await features(uid, tx), quote };
  return { evidence, sourceHash: hash(evidence), conversion };
}
async function lock(tx: DB, uid: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock_shared(hashtext('nova-credit-cutover'))::text`;
  if (!(await tx.$queryRaw<unknown[]>`SELECT id FROM "User" WHERE id=${uid} FOR UPDATE`).length) throw new MemberError("找不到會員 / Member not found", 404);
}
async function replay(tx: DB, op: Operation, input: unknown) {
  if (!op.key.trim() || !op.actor.trim() || !op.reason.trim()) throw new MemberError("切換需請求鍵、操作人與原因 / Cutover requires request key, actor and reason", 400);
  const signature = hash({ ...op, input });
  const prior = (await tx.$queryRaw<{ contentHash: string; result: Record<string, unknown> }[]>`SELECT * FROM "CreditTransition" WHERE key=${op.key}`)[0];
  if (prior && prior.contentHash !== signature) throw new MemberError("切換請求鍵內容不一致 / Cutover idempotency content mismatch", 409);
  return { signature, prior: prior?.result };
}
async function receipt(tx: DB, op: Operation, action: string, signature: string, accountId: string | null, result: Record<string, unknown>) {
  await tx.$executeRaw`INSERT INTO "CreditTransition"(key,"accountId",action,"contentHash",actor,reason,result) VALUES(${op.key},${accountId},${action},${signature},${op.actor},${op.reason},${JSON.stringify(result)}::jsonb)`;
}
export async function prepareMember(tx: DB, uid: string, op: Operation, now = new Date()) {
  await lock(tx, uid);
  const request = await replay(tx, op, { action: "prepare", uid });
  if (request.prior) return request.prior as { accountId: string; sourceHash: string; after: ReturnType<typeof summary> };
  const existing = await accountFor(tx, uid);
  if (existing && ["active", "compatible"].includes(existing.status)) throw new MemberError("已啟用點數，不得重複轉換 / Credits already active; re-import blocked", 409);
  const snapshot = await source(tx, uid, now), id = randomUUID();
  if (existing) await tx.$executeRaw`UPDATE "CreditAccount" SET status='superseded',"updatedAt"=${now} WHERE id=${existing.id}`;
  await tx.$executeRaw`INSERT INTO "CreditAccount"(id,status,"sourceHash",source,"importedCycle","legacyMonthlyGrant","createdAt") VALUES(${id},'prepared',${snapshot.sourceHash},${JSON.stringify(snapshot.evidence)}::jsonb,${snapshot.conversion.wallet.importedCycle ? new Date(snapshot.conversion.wallet.importedCycle) : null},${BigInt(snapshot.conversion.wallet.legacyMonthlyGrant)},${now})`;
  await tx.$executeRaw`INSERT INTO "CreditAuthority"("userId","accountId") VALUES(${uid},${id}) ON CONFLICT("userId") DO UPDATE SET "accountId"=EXCLUDED."accountId"`;
  const result = { accountId: id, sourceHash: snapshot.sourceHash, after: snapshot.conversion.after };
  await receipt(tx, op, "prepare", request.signature, id, result); return result;
}
export async function activateMember(tx: DB, uid: string, expectedHash: string, op: Operation, now = new Date()) {
  await lock(tx, uid);
  const request = await replay(tx, op, { action: "activate", uid, expectedHash });
  if (request.prior) return request.prior;
  const account = await accountFor(tx, uid);
  if (!account || account.status !== "prepared" || account.sourceHash !== expectedHash) throw new MemberError("轉換準備版本不符 / Conversion preparation version mismatch", 409);
  const fresh = await source(tx, uid, now);
  if (fresh.sourceHash !== expectedHash) throw new MemberError("來源已變動，請重新對帳準備 / Source changed; reconcile and prepare again", 409);
  const wallet = fresh.conversion.wallet;
  await saveWallet(tx, account, emptyWallet(now), wallet);
  await tx.$executeRaw`UPDATE "CreditAccount" SET status='active',"activatedAt"=${now},"activationSequence"=${wallet.events.length} WHERE id=${account.id}`;
  const result = { accountId: account.id, sourceHash: expectedHash, after: summary(wallet, now) };
  await receipt(tx, op, "activate", request.signature, account.id, result); return result;
}
export async function rollbackMember(tx: DB, uid: string, op: Operation, now = new Date()) {
  await lock(tx, uid);
  const request = await replay(tx, op, { action: "rollback", uid });
  if (request.prior) return request.prior;
  const account = await accountFor(tx, uid);
  if (!account || !["active", "compatible"].includes(account.status)) throw new MemberError("沒有可回滾的切換 / No active cutover to roll back", 409);
  let unchanged = false;
  if (account.version === account.activationSequence) { try { unchanged = (await source(tx, uid, now)).sourceHash === account.sourceHash; } catch { /* Changed evidence must stay on the new ledger. */ } }
  const status = unchanged ? "rolled_back" : "compatible";
  const wallet = await readWallet(tx, account);
  await tx.$executeRaw`UPDATE "CreditAccount" SET status=${status},"updatedAt"=${now} WHERE id=${account.id}`;
  const result = { accountId: account.id, status, authority: unchanged ? "legacy" : "credits", after: summary(wallet, now), instruction: unchanged ? "原餘額未變，可以使用原制度 / Original balances unchanged; legacy allowed" : "僅部署相容版，保留新帳本；禁止恢復舊餘額 / Compatible release only; retain ledger; never restore old balances" };
  await receipt(tx, op, "rollback", request.signature, account.id, result); return result;
}
export async function activateAll(tx: DB, expected: { userId: string; sourceHash: string }[], op: Operation, now = new Date()) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-credit-cutover'))::text`;
  await tx.$executeRawUnsafe('LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE');
  const request = await replay(tx, op, { action: "activate-all", expected }); if (request.prior) return request.prior;
  const users = await tx.user.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  if (canonical(users.map(u => u.id)) !== canonical(expected.map(u => u.userId).sort())) throw new MemberError("會員清單已變動，請重新準備 / Member manifest changed; prepare again", 409);
  for (const user of expected) await activateMember(tx, user.userId, user.sourceHash, { ...op, key: `${op.key}:${user.userId}` }, now);
  await tx.$executeRaw`UPDATE "CreditControl" SET mode='active',"activatedAt"=${now} WHERE id='main'`;
  const result = { activated: users.length }; await receipt(tx, op, "activate-all", request.signature, null, result); return result;
}
export async function rollbackAll(tx: DB, op: Operation, now = new Date()) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('nova-credit-cutover'))::text`;
  await tx.$executeRawUnsafe('LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE');
  const request = await replay(tx, op, { action: "rollback-all" }); if (request.prior) return request.prior;
  const users = await tx.$queryRaw<{ userId: string }[]>`SELECT p."userId" FROM "CreditAuthority" p JOIN "CreditAccount" a ON a.id=p."accountId" WHERE a.status IN ('active','compatible') ORDER BY p."userId"`;
  for (const user of users) await rollbackMember(tx, user.userId, { ...op, key: `${op.key}:${user.userId}` }, now);
  // Registration remains on Credits. A compatible rollback never enables old binaries to spend sealed balances.
  await tx.$executeRaw`UPDATE "CreditControl" SET mode='compatible' WHERE id='main'`;
  const result = { reviewed: users.length, mode: "compatible" }; await receipt(tx, op, "rollback-all", request.signature, null, result); return result;
}
