import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Account } from "@/lib/auth/account";
import { completeAiUsage, reserveAiUsage } from "@/lib/ai/allowance";
import { checkRateLimit, DAY_MS } from "@/lib/rate-limit";
import { generateIcp, IcpAiError } from "./ai";
import { hasIcp, nextIcpQuestion, readIcp, type IcpDraft, type IcpMessage, type IcpWorkspaceView } from "./schema";

export class IcpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const conflict = () => new IcpError("ICP 已在另一個分頁更新，請重新載入工作區；你的輸入仍保留。 / ICP changed in another tab. Reload the workspace; your input is preserved.", 409);
const LOCK_MS = 120_000;
const json = (value: IcpDraft | IcpMessage[]) => value as unknown as Prisma.InputJsonValue;

export async function getIcpWorkspace(userId: string, locale: "en" | "zh-tw"): Promise<IcpWorkspaceView> {
  const [workspace, profile] = await Promise.all([
    prisma.icpWorkspace.findUnique({ where: { userId } }),
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { icp: true, icpDetails: true, icpVersion: true } }),
  ]);
  const saved = readIcp(profile?.icpDetails);
  const draft = readIcp(workspace?.draft);
  const messages = workspace ? workspace.messages as IcpMessage[] : [nextIcpQuestion(null, [], locale)!];
  return {
    revision: workspace?.revision ?? 0, profileVersion: workspace?.profileVersion ?? profile?.icpVersion ?? 0,
    currentProfileVersion: profile?.icpVersion ?? 0, messages, draft, saved, legacy: profile?.icp ?? null,
    pending: Boolean(workspace?.pendingRequestId && workspace.pendingSince && Date.now() - workspace.pendingSince.getTime() < LOCK_MS),
    error: workspace?.lastError ?? null,
  };
}

async function ensureWorkspace(userId: string, locale: "en" | "zh-tw") {
  const profile = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { icpVersion: true } });
  return prisma.icpWorkspace.upsert({
    where: { userId }, update: {},
    create: { userId, messages: json([nextIcpQuestion(null, [], locale)!]), profileVersion: profile?.icpVersion ?? 0 },
  });
}

async function expireAnalysis(workspace: Awaited<ReturnType<typeof ensureWorkspace>>, userId: string, locale: "en" | "zh-tw") {
  if (workspace.pendingRequestId && workspace.pendingSince && Date.now() - workspace.pendingSince.getTime() >= LOCK_MS) {
    const expired = await prisma.icpWorkspace.updateMany({ where: { userId, pendingRequestId: workspace.pendingRequestId, revision: workspace.revision }, data: { pendingRequestId: null, pendingSince: null, usageId: null } });
    if (expired.count && workspace.usageId) await completeAiUsage(workspace.usageId, false);
    return ensureWorkspace(userId, locale);
  }
  return workspace;
}

export async function runIcp(account: Account, input: { action: "answer" | "retry"; text?: string; revision: number; requestId: string; locale: "en" | "zh-tw" }) {
  const userId = account.id;
  let workspace = await ensureWorkspace(userId, input.locale);
  if (workspace.lastRequestId === input.requestId) return getIcpWorkspace(userId, input.locale);
  workspace = await expireAnalysis(workspace, userId, input.locale);
  if (workspace.pendingRequestId) throw new IcpError("POLARIS 正在分析，請稍候再載入。 / POLARIS is analysing. Please reload shortly.", 409);
  if (workspace.revision !== input.revision) throw conflict();
  const messages = [...workspace.messages as IcpMessage[]];
  if (input.action === "answer") {
    if (!input.text?.trim() || messages.at(-1)?.role !== "assistant" || messages.filter(m => m.role === "user").length >= 3) {
      throw new IcpError("請回答目前問題；三輪後可編輯或重新生成草稿。 / Answer the current question; after three rounds, edit or retry the draft.");
    }
    messages.push({ role: "user", content: input.text.trim() });
  }
  const claimed = await prisma.icpWorkspace.updateMany({
    where: { userId, revision: input.revision, pendingRequestId: null },
    data: { messages: json(messages), revision: { increment: 1 }, pendingRequestId: input.requestId, pendingSince: new Date(), lastError: null },
  });
  if (!claimed.count) throw conflict();
  let usageId: string | null = null;
  let succeeded = false;
  try {
    const rate = await checkRateLimit(`icp:${userId}`, 40, DAY_MS, false);
    if (!rate.ok) throw new IcpError("已達本日 ICP 分析上限（40 次），請明天再試。 / Daily ICP analysis limit reached (40).", 429);
    usageId = await reserveAiUsage(account);
    if (!usageId) throw new IcpError("本月 AI 額度已用完，請前往 Account and plan 加購。 / AI allowance exhausted. Visit Account and plan.", 429);
    const attached = await prisma.icpWorkspace.updateMany({ where: { userId, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { usageId } });
    if (!attached.count) throw conflict();
    const draft = await generateIcp(account.profile, messages, input.locale);
    // A retry replaces an unanswered follow-up, never creates a fourth question.
    if (input.action === "retry" && messages.at(-1)?.role === "assistant") messages.pop();
    const next = nextIcpQuestion(draft, messages, input.locale);
    if (next) messages.push(next);
    const committed = await prisma.icpWorkspace.updateMany({
      where: { userId, pendingRequestId: input.requestId, revision: input.revision + 1 },
      data: { draft: json(draft), messages: json(messages), pendingRequestId: null, pendingSince: null, usageId: null, lastRequestId: input.requestId, lastError: null },
    });
    if (!committed.count) throw conflict();
    succeeded = hasIcp(draft);
    return await getIcpWorkspace(userId, input.locale);
  } catch (cause) {
    const timeout = cause instanceof Error && /timeout|timed out/i.test(cause.name + cause.message);
    const error = cause instanceof IcpError ? cause : new IcpError(
      cause instanceof IcpAiError ? cause.message : timeout
        ? "AI 分析逾時，回答已保留，請重試。 / AI analysis timed out. Your answers are saved; retry."
        : "AI 暫時無法完成分析，回答已保留，請重試或手動編輯。 / AI analysis failed. Your answers are saved; retry or edit manually.",
      cause instanceof IcpAiError ? 422 : timeout ? 504 : 502,
    );
    if (!(cause instanceof IcpError)) console.error("[icp] analysis failed", cause);
    await prisma.icpWorkspace.updateMany({ where: { userId, pendingRequestId: input.requestId, revision: input.revision + 1 }, data: { pendingRequestId: null, pendingSince: null, usageId: null, lastError: error.message } });
    throw error;
  } finally {
    if (usageId) await completeAiUsage(usageId, succeeded);
  }
}

export async function patchIcp(userId: string, input: { action: "edit" | "save"; draft: IcpDraft; revision: number; profileVersion: number; requestId: string; locale: "en" | "zh-tw" }) {
  if (!hasIcp(input.draft)) throw new IcpError("請至少填寫一項 ICP 資訊。 / Enter at least one ICP field.");
  await expireAnalysis(await ensureWorkspace(userId, input.locale), userId, input.locale);
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as Prisma.TransactionClient;
    const workspace = await tx.icpWorkspace.findUniqueOrThrow({ where: { userId } });
    if (workspace.lastRequestId === input.requestId) return;
    if (workspace.pendingRequestId) throw new IcpError("AI 正在分析，請稍候再編輯。 / Wait for the AI analysis to finish.", 409);
    if (workspace.revision !== input.revision) throw conflict();
    const changed = await tx.icpWorkspace.updateMany({ where: { userId, revision: input.revision, pendingRequestId: null }, data: {
      draft: json(input.draft), revision: { increment: 1 }, lastRequestId: input.requestId, lastError: null,
    } });
    if (!changed.count) throw conflict();
    if (input.action === "save") {
      // Workspace remembers the original saved version: refreshing another tab cannot silently approve its replacement.
      if (workspace.profileVersion !== input.profileVersion) throw conflict();
      await tx.onboardingProfile.upsert({ where: { userId }, update: {}, create: { userId, targetMarkets: [], needs: [] } });
      const saved = await tx.onboardingProfile.updateMany({ where: { userId, icpVersion: input.profileVersion }, data: {
        icpDetails: json(input.draft), icp: input.draft.summary || [input.draft.who, input.draft.problem].filter(Boolean).join(" · "), icpVersion: { increment: 1 },
      } });
      if (!saved.count) throw conflict();
      await tx.icpWorkspace.update({ where: { userId }, data: { profileVersion: input.profileVersion + 1 } });
    }
  });
  return getIcpWorkspace(userId, input.locale);
}
