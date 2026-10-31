import { getViewerPrivacy, writeViewerPrivacy, identifiedVisitors } from "@/lib/network/identified-visitors";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { browserMutationGuard } from "@/lib/security/http";
import { memberAccess, memberError, privateOk, MemberError } from "@/lib/member-http";
import { prisma } from "@/lib/prisma";
import { features } from "@/lib/network/access";
import { connectionSchema, inviteSchema, messageSchema, networkEnabled, scope, shareSchema } from "@/lib/network/policy";
import { connectionForProfile, changeConnection, invite, listConnections, messages, recordVisit, requireEnabled, sendMessage, share, visitorSummary } from "@/lib/network/service";
import { notificationList } from "@/lib/network/notifications";
import { evaluateWatches, updateProgress, watchSummary } from "@/lib/network/watches";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: Request, context: Context) {
  try {
    if (req.method !== "GET") { const blocked = browserMutationGuard(req, true); if (blocked) return blocked; }
    const uid = await memberAccess(req.method !== "GET"); if (uid instanceof Response) return uid;
    const { path } = await context.params, action = path.join("/");
    if (req.method === "GET" && action === "features") return privateOk({ enabled: networkEnabled(), ...await features(uid) });
    requireEnabled();
    if (req.method === "GET") {
      if (path[0] === "profiles" && path.length === 3 && path[2] === "connection") return privateOk(await connectionForProfile(uid, path[1]!));
      if (action === "connections") return privateOk(await listConnections(uid));
      if (path[0] === "connections" && path[2] === "messages" && path.length === 3) return privateOk(await messages(uid, path[1]!, new URL(req.url).searchParams.get("cursor") || undefined));
      if (action === "viewer-privacy") return privateOk(await getViewerPrivacy(uid));
      if (action === "visitors/members") return privateOk(await identifiedVisitors(uid, z.string().min(1).max(100).optional().parse(new URL(req.url).searchParams.get("cursor") || undefined)));
      if (action === "visitors") return privateOk(await visitorSummary(uid));
      if (action === "unread") return privateOk({ unread: await prisma.memberNotification.count({ where: { userId: uid, readAt: null } }) });
      if (action === "notifications") return privateOk(await notificationList(uid));
      if (action === "progress") return privateOk(await watchSummary(uid));
    }
    const body = req.method === "GET" ? {} : await req.json();
    if (req.method === "POST") {
      if (action === "connections") return privateOk(await invite(uid, inviteSchema.parse(body)), 201);
      if (path[0] === "connections" && path[2] === "messages" && path.length === 3) return privateOk(await sendMessage(uid, path[1]!, messageSchema.parse(body)), 201);
      if (action === "views") return privateOk(await recordVisit(uid, z.object({ profileId: z.string().min(1).optional(), portalId: z.string().min(1).optional() }).strict().refine(v => Boolean(v.profileId) !== Boolean(v.portalId)).parse(body)));
    }
    if (req.method === "PATCH") {
      if (action === "viewer-privacy") return privateOk(await writeViewerPrivacy(uid, body));
      if (path[0] === "connections" && path.length === 2) return privateOk(await changeConnection(uid, path[1]!, connectionSchema.parse(body)));
      if (path[0] === "connections" && path[2] === "sharing" && path.length === 3) return privateOk(await share(uid, path[1]!, shareSchema.parse(body)));
      if (action === "progress") return privateOk(await updateProgress(uid, z.object({ fundraising: z.boolean().optional(), confirmInterviews: scope.optional() }).strict().parse(body)));
      if (action === "preferences") {
        const data = z.object({ weeklyEmail: z.boolean(), watchEmail: z.boolean(), locale: z.enum(["en", "zh-tw"]) }).strict().parse(body);
        await prisma.memberNotificationPreference.upsert({ where: { userId: uid }, create: { userId: uid, ...data }, update: data }); return privateOk({ saved: true });
      }
      if (action === "notifications") {
        const input = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).strict().parse(body);
        await prisma.memberNotification.updateMany({ where: { userId: uid, id: { in: input.ids } }, data: { readAt: new Date() } }); return privateOk({ saved: true });
      }
      if (path[0] === "watches" && path.length === 2) {
        const input = z.object({ enabled: z.boolean() }).strict().parse(body);
        await prisma.$transaction(async tx => {
          const watch = await tx.investorWatch.findFirst({ where: { id: path[1], OR: [{ investorId: uid }, { startupId: uid }] } });
          if (!watch || watch.status === "merged") throw new MemberError("找不到觀察條件 / Watch not found", 404);
          await tx.investorWatch.update({ where: { id: watch.id }, data: { status: input.enabled ? (watch.scopeKey === "pending" ? "pending" : "active") : "disabled" } });
          if (input.enabled) await evaluateWatches(tx as unknown as Prisma.TransactionClient, watch.startupId);
        });
        return privateOk({ saved: true });
      }
    }
    throw new MemberError("找不到此操作 / Operation not found", 404);
  } catch (error) {
    const response = memberError(error), payload = await response.json();
    return Response.json({ ...payload, code: payload.code || `network_${response.status}` }, { status: response.status, headers: response.headers });
  }
}
export const GET = handle, POST = handle, PATCH = handle;
