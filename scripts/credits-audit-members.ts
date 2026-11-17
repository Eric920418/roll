import { createHash } from "node:crypto";
import { pdfRuntime } from "../tests/helpers/pdf-runtime";
import { grant, summary, settle, units } from "../src/lib/credits/policy";
import { importPendingAi } from "../src/lib/credits/conversion";
import type { AuditDataset, AuditRow, AuditTable } from "./credits-audit-snapshot";
import type { Prisma } from "@prisma/client";
type Finding = { code: string; severity: "blocking" | "warning" | "info"; detail: string; expected?: number; actual?: number; references?: string[] };
const sum = (rows: AuditRow[], field: string) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
const hash = (data: unknown) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const time = (value: unknown) => value instanceof Date ? value.getTime() : value ? Date.parse(String(value)) : null;
export async function auditMembers(data: AuditDataset, flags: Record<string, string>, baselineRoot?: string) {
  const at = new Date(data.asOf), period = data.asOf.slice(0, 7), by = (table: AuditTable, id: unknown) => data.tables[table].filter(r => r.userId === id);
  class Clock extends Date { constructor(value?: string | number) { super(value === undefined ? at.getTime() : value); } static now() { return at.getTime(); } }
  class MemberError extends Error { constructor(message: string, public status = 409) { super(message); } }
  const settings = new Map(data.settings.map(r => [r.key, r.value]));
  const beta = (settings.get("billing.betaAccess") as { enabled?: boolean } | undefined)?.enabled === true;
  const tx = {
    $queryRaw: async () => [],
    user: { findUnique: async ({ where }: { where: { id: string } }) => { const u = data.tables.User.find(r => r.id === where.id); return u ? { ...u, matchmakingProfile: by("MatchmakingProfile", u.id)[0] ?? null, profile: null } : null; } },
    setting: { findUnique: async ({ where }: { where: { key: string } }) => settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null },
    tokenWallet: { findUnique: async ({ where }: { where: { userId: string } }) => by("TokenWallet", where.userId)[0] ?? null },
    rewardAccount: { findUnique: async ({ where }: { where: { userId: string } }) => by("RewardAccount", where.userId)[0] ?? null },
    aiAllowance: { findUnique: async ({ where }: { where: { userId: string } }) => by("AiAllowance", where.userId)[0] ?? null },
    rewardEntry: { aggregate: async ({ where }: { where: { userId: string; points?: { gt: number } } }) => ({ _sum: { points: sum(by("RewardEntry", where.userId).filter(r => !where.points || Number(r.points) > where.points.gt), "points") } }) },
    tokenLedger: { aggregate: async ({ where }: { where: { userId: string } }) => ({ _sum: { availableDelta: sum(by("TokenLedger", where.userId), "availableDelta"), reservedDelta: sum(by("TokenLedger", where.userId), "reservedDelta") } }) },
    tokenReservation: { findMany: async ({ where }: { where: { userId: string } }) => by("TokenReservation", where.userId).filter(r => r.status === "reserved" || r.status === "captured") },
    aiUsage: { findMany: async ({ where }: { where: { userId: string } }) => by("AiUsage", where.userId).filter(r => r.status === "pending" && r.source !== "credits") },
    referralAccount: { findUnique: async ({ where }: { where: { userId: string } }) => { const account = by("ReferralAccount", where.userId)[0]; return account ? { ...account, entries: data.tables.ReferralEntry.filter(r => r.accountId === account.id) } : null; } },
    subscription: { findUnique: async ({ where }: { where: { paypalSubscriptionId: string } }) => data.tables.Subscription.find(r => r.paypalSubscriptionId === where.paypalSubscriptionId) ?? null },
    trialFeedbackGrant: { findUnique: async ({ where }: { where: { userId: string } }) => by("TrialFeedbackGrant", where.userId)[0] ?? null },
    legacyFeatureGrant: { findMany: async ({ where }: { where: { userId: string; sourceKey: { in: string[] } } }) => by("LegacyFeatureGrant", where.userId).filter(r => where.sourceKey.in.includes(String(r.sourceKey))) },
  } as unknown as Prisma.TransactionClient;
  // Snapshot-backed calculators cannot write or acquire publication locks; no application API is called.
  const mocks = { "server-only": {}, "@/lib/prisma": { prisma: tx }, "@/lib/auth/account": { getBetaAccess: async () => beta }, "@/lib/member-http": { MemberError } }, globals = { Date: Clock, process: { env: { ...flags, ROLL_UNIFIED_CREDITS_LOCAL: "false" } } };
  const load = pdfRuntime(mocks, globals), baseline = baselineRoot ? pdfRuntime(mocks, globals, baselineRoot) : load;
  const legacy = load<typeof import("../src/lib/credits/legacy")>("src/lib/credits/legacy.ts");
  const access = load<typeof import("../src/lib/network/access")>("src/lib/network/access.ts");
  const gate = load<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  const plans = load<typeof import("../src/lib/billing/plans")>("src/lib/billing/plans.ts");
  const commerce = load<typeof import("../src/lib/billing/commerce")>("src/lib/billing/commerce.ts");
  const oldGate = baseline<typeof import("../src/lib/billing/gate")>("src/lib/billing/gate.ts");
  const oldAccess = baseline<typeof import("../src/lib/network/access")>("src/lib/network/access.ts");
  const oldAi = baseline<typeof import("../src/lib/ai/allowance")>("src/lib/ai/allowance.ts");
  const oldCommerce = baseline<typeof import("../src/lib/billing/commerce")>("src/lib/billing/commerce.ts"), oldRewards = baseline<typeof import("../src/lib/rewards/policy")>("src/lib/rewards/policy.ts");
  const quote = await commerce.tokenQuote(tx), originalQuote = await oldCommerce.tokenQuote(tx);
  const originalRewardRatio = oldRewards.REWARD_RULES.redemptionCredits / oldRewards.REWARD_RULES.redemptionPoints;
  const members = [];
  for (const user of data.tables.User) {
    const id = String(user.id), findings: Finding[] = [], rows = (table: AuditTable) => by(table, id);
    const wallet = rows("TokenWallet")[0], ai = rows("AiAllowance")[0], reward = rows("RewardAccount")[0], ledger = rows("TokenLedger"), rewards = rows("RewardEntry"), usages = rows("AiUsage"), redemptions = rows("RewardRedemption");
    const check = (code: string, expected: number, actual: number, detail: string) => { if (expected !== actual) findings.push({ code, severity: "blocking", expected, actual, detail }); };
    for (const field of ["monthlyGrant", "monthlyCompanies", "dailyInvites"] as const) if (quote[field] < originalQuote[field]) findings.push({ code: "recurring_entitlement_reduced", severity: "blocking", expected: originalQuote[field], actual: quote[field], detail: `候選版 ${field} 小於正式部署原權益` });
    for (const field of ["inviteFee", "searchFee"] as const) if (quote[field] > originalQuote[field]) findings.push({ code: "purchasing_power_reduced", severity: "blocking", expected: originalQuote[field], actual: quote[field], detail: `候選版 ${field} 較高，1:1 換點會減少舊餘額購買力` });
    if (Number(reward?.balance ?? 0) > 0 && 1 / 20 < originalRewardRatio) findings.push({ code: "reward_conversion_devalued", severity: "blocking", detail: "未兌換積分的轉換比例低於正式版可兌換價值" });
    check("token_available_ledger", sum(ledger, "availableDelta"), Number(wallet?.available ?? 0), "可用 Token 與收支帳本不一致");
    check("token_reserved_ledger", sum(ledger, "reservedDelta"), Number(wallet?.reserved ?? 0), "預扣 Token 與收支帳本不一致");
    check("token_reserved_orders", sum(rows("TokenReservation").filter(r => r.status === "reserved"), "amount"), Number(wallet?.reserved ?? 0), "預扣 Token 與進行中訂單不一致");
    check("reward_points_ledger", sum(rewards, "points"), Number(reward?.balance ?? 0), "剩餘積分與獎勵帳本不一致");
    check("redemption_points_total", -sum(redemptions, "points"), sum(rewards.filter(r => r.kind === "redeem"), "points"), "兌換明細與積分扣除合計不一致");
    check("included_ai_used", usages.filter(r => r.source === "included" && r.status === "succeeded" && time(r.cycleStart) === time(ai?.cycleStart)).length, Number(ai?.includedUsed ?? 0), "原紀錄週期的 AI 已用量與成功紀錄不一致");
    check("included_ai_reserved", usages.filter(r => r.source === "included" && r.status === "pending" && time(r.cycleStart) === time(ai?.cycleStart)).length, Number(ai?.includedReserved ?? 0), "原紀錄週期的 AI 預扣與處理中紀錄不一致");
    for (const redemption of redemptions) {
      const receipt = rewards.find(r => r.eventKey === `redeem:${redemption.requestId}`);
      check("reward_redemption_receipt", -Number(redemption.points), Number(receipt?.points ?? 0), `兌換 ${redemption.id} 缺少對應扣分紀錄`);
    }
    const referral = rows("ReferralAccount")[0], referralEntries = data.tables.ReferralEntry.filter(r => r.accountId === referral?.id);
    check("referral_debt_ledger", sum(referralEntries, "debtDelta"), Number(referral?.debt ?? 0), "推薦欠額與發放／撤回帳本不一致");
    const purchases = rows("AiCreditPurchase").filter(r => r.status === "COMPLETED");
    for (const purchase of purchases) if (!purchase.hasCapture || !purchase.completedAt || Number(purchase.credits) <= 0 || Number(purchase.amountMinor) <= 0) findings.push({ code: "incomplete_purchase_receipt", severity: "blocking", detail: `加購 ${purchase.id} 標為完成，但付款收據、完成時間或數量不完整` });
    const paidCredits = sum(purchases, "credits");
    check("purchased_ai_provenance", paidCredits - usages.filter(r => r.source === "bonus" && ["pending", "succeeded"].includes(String(r.status))).length, Number(ai?.bonusBalance ?? 0), "加購餘額與完成付款／AI 使用紀錄不一致，需核對歷史補額來源");
    check("reward_ai_provenance", sum(redemptions, "credits") + sum(referralEntries, "credits") - usages.filter(r => r.source === "reward" && ["pending", "succeeded"].includes(String(r.status))).length, Number(ai?.rewardBalance ?? 0), "獎勵 AI 餘額與兌換、推薦及使用紀錄不一致");
    if (data.localWalletKeys.includes(`localCredits.v1:${id}`) || usages.some(r => r.source === "credits")) findings.push({ code: "unexpected_formal_credits", severity: "blocking", detail: "正式庫出現本機點數資料，禁止重複轉換" });
    const stale = usages.filter(r => r.status === "pending" && Number(time(r.expiresAt)) <= at.getTime());
    if (stale.length) findings.push({ code: "stale_ai_holds", severity: "warning", detail: "有已逾期但尚未整理的 AI 預扣；試算列入可退回額度，不執行清理", references: stale.map(r => String(r.id)) });
    const unknown = rewards.filter(r => Number(r.points) > 0 && !["visit", "action", "quiz", "profile", "customer_stage"].includes(String(r.kind)));
    if (unknown.length) findings.push({ code: "unknown_reward_origin", severity: "blocking", detail: "有未知正數獎勵來源，累積成就不可自動認列", references: unknown.map(r => String(r.id)) });
    for (const hold of rows("TokenReservation")) {
      const receipts = ledger.filter(r => r.reservationId === hold.id), amount = Number(hold.amount), active = hold.status === "reserved", captured = hold.status === "captured";
      if (!["reserved", "captured", "released", "refunded"].includes(String(hold.status))) findings.push({ code: "unknown_hold_status", severity: "blocking", detail: `未知預扣狀態 ${hold.id}: ${hold.status}` });
      check("hold_available_receipts", active || captured ? -amount : 0, sum(receipts, "availableDelta"), `訂單 ${hold.id} 的扣點收據不一致`);
      check("hold_reserved_receipts", active ? amount : 0, sum(receipts, "reservedDelta"), `訂單 ${hold.id} 的預扣收據不一致`);
      const price = hold.pricing as { amount?: number } | null;
      if (price?.amount !== undefined) check("original_price_receipt", amount, price.amount, `訂單 ${hold.id} 的原始報價不一致`);
      if (active) {
        const resource = hold.kind === "search" ? rows("ProspectingOrder").find(r => r.id === hold.resourceId) : data.tables.NetworkConnection.find(r => r.id === hold.resourceId && r.senderId === id);
        if (!resource) findings.push({ code: "orphan_hold", severity: "blocking", detail: `預扣 ${hold.id} 找不到本人的原訂單／邀請` });
        else if (Number(time(hold.expiresAt)) <= at.getTime()) findings.push({ code: "overdue_token_hold", severity: "warning", detail: `預扣 ${hold.id} 已逾期，結果未確認前保留原預扣，不自動退款` });
      }
    }
    const account = { ...user, plan: plans.toPlanKey(String(user.plan)), trialPlan: user.trialPlan ? plans.toPlanKey(String(user.trialPlan)) : null, betaAccess: beta } as unknown as Parameters<typeof gate.getEffectivePlan>[0];
    const effectivePlan = gate.getEffectivePlan(account, at), originalPlan = oldGate.getEffectivePlan(account, at), withoutBetaPlan = oldGate.getEffectivePlan({ ...account!, betaAccess: false }, at), rightsBefore = await oldAccess.features(id, tx), rightsAfter = await access.features(id, tx);
    const sourceRows = access.sources(user as unknown as Parameters<typeof access.sources>[0], at);
    if (effectivePlan !== originalPlan) findings.push({ code: "effective_plan_changed", severity: "blocking", detail: `正式版 ${originalPlan}／候選版 ${effectivePlan}，不可自動改動方案權益` });
    if (JSON.stringify(oldAccess.sources(user as unknown as Parameters<typeof access.sources>[0], at)) !== JSON.stringify(sourceRows)) findings.push({ code: "entitlement_sources_changed", severity: "blocking", detail: "正式版與候選版的有效權益來源不一致" });
    if (JSON.stringify(rightsBefore) !== JSON.stringify(rightsAfter)) findings.push({ code: "rights_reduced", severity: "blocking", detail: "轉換前後功能權益不一致" });
    const subscription = rows("Subscription").find(r => r.paypalSubscriptionId === user.paypalSubscriptionId);
    if (user.paypalSubscriptionId && !subscription) findings.push({ code: "missing_subscription", severity: "blocking", detail: "會員指向的訂閱找不到對應紀錄" });
    if (subscription && (subscription.plan !== user.plan || subscription.status !== user.subscriptionStatus || time(subscription.currentPeriodEnd) !== time(user.currentPeriodEnd))) findings.push({ code: "subscription_cache_mismatch", severity: "blocking", detail: "會員訂閱快取與訂閱紀錄不一致；本次不向 PayPal 重整或寫回" });
    const monthly = ledger.find(r => r.eventKey === `monthly:${id}:${period}`);
    const monthlyOwed = effectivePlan !== "free" && !monthly ? quote.monthlyGrant : 0;
    if (monthlyOwed) findings.push({ code: "monthly_grant_not_posted", severity: "warning", detail: `本 UTC 月尚未發放的方案權益另列 ${monthlyOwed} 點，不當成既有入帳餘額` });
    let conversion: null | { before: unknown; after: unknown; rows: unknown; afterPendingAiRelease: unknown; afterEntitlementsDue: unknown; preservedHoldCount: number } = null;
    try {
      const trial = await legacy.trialConversion(tx, id, at);
      const originalCycle = await oldAi.allowanceCycleFor(account as Parameters<typeof oldAi.allowanceCycleFor>[0], at, tx);
      const originalRemaining = originalCycle ? oldAi.AI_INCLUDED_PER_MONTH - (time(ai?.cycleStart) === originalCycle.start.getTime() ? Number(ai?.includedUsed ?? 0) + Number(ai?.includedReserved ?? 0) : 0) : 0;
      check("original_ai_remaining", originalRemaining, trial.before.included?.remaining ?? 0, "正式部署與候選版的當期 AI 額度不同");
      if ((originalCycle?.start.toISOString() ?? null) !== (trial.before.included?.cycleStart ?? null) || (originalCycle?.end.toISOString() ?? null) !== (trial.before.included?.expiresAt ?? null)) findings.push({ code: "original_ai_cycle_changed", severity: "blocking", detail: "正式部署與候選版的 AI 週期或到期時間不同" });
      const totalBefore = Number(wallet?.available ?? 0) + Number(ai?.bonusBalance ?? 0) + Number(ai?.rewardBalance ?? 0) + Number(reward?.balance ?? 0) / 20 + (trial.before.included?.remaining ?? 0);
      check("converted_available", units(totalBefore), units(trial.after.available), "各來源換算後可用額度不一致");
      check("converted_reserved", units(Number(wallet?.reserved ?? 0) + usages.filter(r => r.status === "pending").length), units(trial.after.reserved), "預扣來源換算前後不一致");
      check("permanent_balance", units(Number(wallet?.available ?? 0) + Number(ai?.bonusBalance ?? 0) + Number(ai?.rewardBalance ?? 0) + Number(reward?.balance ?? 0) / 20), units(trial.after.permanent), "永久餘額出現期限或流失");
      if (trial.wallet.lots.filter(l => l.origin === "included").some(l => l.expiresAt !== trial.before.included?.expiresAt)) findings.push({ code: "expiry_changed", severity: "blocking", detail: "原 AI 週期到期日改變" });
      for (const pending of importPendingAi(trial.wallet, at)) settle(trial.wallet, pending, "refund", "逾期 AI 預扣試算 / Expired AI hold simulation", at, true);
      const afterPendingAiRelease = summary(trial.wallet, at);
      if (monthlyOwed) grant(trial.wallet, { key: `monthly:${period}`, amount: units(monthlyOwed), origin: "monthly", reason: "未入帳的本月權益試算 / Unposted monthly entitlement simulation" }, at);
      conversion = { before: trial.before, after: trial.after, rows: trial.rows, afterPendingAiRelease, afterEntitlementsDue: summary(trial.wallet, at), preservedHoldCount: Object.keys(trial.wallet.holds).length };
    } catch (error) { findings.push({ code: "conversion_blocked", severity: "blocking", detail: error instanceof Error ? error.message : String(error) }); }
    const protectedRows = { user, subscriptions: rows("Subscription"), legacyGrants: rows("LegacyFeatureGrant"), founderOrders: rows("FounderOrder"), feedbackGrant: rows("TrialFeedbackGrant"), role: rows("MatchmakingProfile"), mentor: rows("MentorCertification") };
    members.push({ userId: id, email: user.email, name: [user.firstName, user.lastName].filter(Boolean).join(" "), status: findings.some(f => f.severity === "blocking") ? "blocked" : findings.some(f => f.severity === "warning") ? "review" : "ready", balances: { tokenAvailable: wallet?.available ?? 0, tokenReserved: wallet?.reserved ?? 0, unredeemedPoints: reward?.balance ?? 0, rewardAi: ai?.rewardBalance ?? 0, purchasedAi: ai?.bonusBalance ?? 0 }, entitlements: { effectivePlan, originalPlan, withoutBetaPlan, betaRaisesPlan: originalPlan !== withoutBetaPlan, baseline: baselineRoot ? "deployed_git_source" : "fixture_rules", betaAccess: beta, sources: sourceRows, originalFields: user, featuresBefore: rightsBefore, featuresAfter: rightsAfter, legacyGrants: rows("LegacyFeatureGrant"), mentor: rows("MentorCertification"), monthlyGrant: effectivePlan === "free" ? 0 : quote.monthlyGrant, lockedMonthlyGrantIfEligible: quote.monthlyGrant, includedAiPerCycle: effectivePlan === "free" ? 0 : 150, monthlyOwed, protectedFingerprint: hash(protectedRows), actions: "preserve_all_source_rows_and_original_dates" }, conversion, findings });
  }
  return { asOf: data.asOf, pricing: quote, originalPricing: originalQuote, conversionRates: { creditsPerToken: 1, creditsPerAi: 1, creditsPerRewardPoint: 1 / 20, originalAiPerRewardPoint: originalRewardRatio }, members, totals: { members: members.length, ready: members.filter(m => m.status === "ready").length, review: members.filter(m => m.status === "review").length, blocked: members.filter(m => m.status === "blocked").length, tokenAvailable: members.reduce((s, m) => s + Number(m.balances.tokenAvailable), 0), tokenReserved: members.reduce((s, m) => s + Number(m.balances.tokenReserved), 0), unredeemedPoints: members.reduce((s, m) => s + Number(m.balances.unredeemedPoints), 0) } };
}
