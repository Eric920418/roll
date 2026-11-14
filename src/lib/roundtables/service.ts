import { memberRoles } from "@/lib/matchmaking/roles";
import { evidenceStateSchema } from "@/lib/evidence/schema";
import { weeklyEvidence } from "@/lib/evidence/service";
import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MemberError, changed } from "@/lib/member-http";
import { features, networkAccount } from "@/lib/network/access";
import { queueNotification } from "@/lib/network/notifications";
import { flowStep } from "@/lib/action-plan/flow/catalog";
import { today } from "@/lib/roadmap/schema";
import { mentorDraftSchema, commitmentSchema, similarEvidenceStages, type RoundtableMutation, type mentorReviewSchema } from "./schema";
import type { z } from "zod";
type DB = Prisma.TransactionClient;
const json = (value: unknown) => value as Prisma.InputJsonValue;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const include = { host: { select: { mentorCertification: true } }, registrations: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }], include: { calendarItem: true } } } satisfies Prisma.RoundtableInclude;
const activeStatuses = ["pending", "confirmed", "waitlisted"];
async function eligible(userId: string, tx: DB) {
  const account = await networkAccount(userId, tx);
  return account.effectivePlan !== "free" && Boolean(account.matchmakingProfile && memberRoles(account.matchmakingProfile).includes("founder")) && (await features(userId, tx)).network;
}
async function blocked(tx: DB, a: string | null, b: string) {
  return a && await tx.networkConnection.findFirst({ where: { status: "blocked", OR: [{ senderId: a, recipientId: b }, { senderId: b, recipientId: a }] }, select: { id: true } });
}

async function stageFit(tx:DB,sessionId:string,userId:string){
  const members=await tx.roundtableRegistration.findMany({where:{roundtableId:sessionId,status:"confirmed"},select:{userId:true}}),ids=[...new Set([userId,...members.map(r=>r.userId)])];
  const rows=await tx.evidenceWorkspace.findMany({where:{userId:{in:ids}},select:{userId:true,data:true}});
  return similarEvidenceStages(ids.map(id=>evidenceStateSchema.parse(rows.find(r=>r.userId===id)?.data||{}).maxStage));
}
async function lockMentor(tx: DB, userId: string) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
  const cert = await tx.mentorCertification.findUnique({ where: { userId } });
  if (cert?.status !== "approved") throw new MemberError("只有認證通過的導師可以主持 / Approved mentor certification is required", 403);
  return cert;
}
async function lockSession(tx: DB, id: string) {
  await tx.$queryRawUnsafe('SELECT "id" FROM "Roundtable" WHERE "id" = $1 FOR UPDATE', id);
  const row = await tx.roundtable.findUnique({ where: { id }, include });
  if (!row) throw new MemberError("找不到圓桌 / Roundtable not found", 404);
  return row;
}
function open(row: { status: string; startsAt: Date }) {
  if (row.status !== "scheduled" || row.startsAt.getTime() <= Date.now()) throw new MemberError("報名已截止或場次已結束／取消 / Registration is closed or the session ended or was cancelled", 409);
}
async function notice(tx: DB, userId: string, row: { id: string; topic: string }, event: string, key: string) {
  await queueNotification(tx, userId, "roundtable:" + row.id + ":" + key, "roundtable", { roundtableId: row.id, topic: row.topic, event });
}
async function promote(tx: DB, row: { id: string; hostId: string | null; capacity: number; status: string; startsAt: Date; topic: string }) {
  if (!row.hostId || row.status !== "scheduled" || row.startsAt.getTime() <= Date.now()) return;
  const count = await tx.roundtableRegistration.count({ where: { roundtableId: row.id, status: "confirmed" } });
  const slots = row.capacity - 1 - count;
  if (slots <= 0) return;
  let filled = 0;
  while (filled < slots) {
    const reg = await tx.roundtableRegistration.findFirst({ where: { roundtableId: row.id, status: "waitlisted", approvedAt: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    if (!reg) break;
    const peers=await tx.roundtableRegistration.findMany({where:{roundtableId:row.id,status:"confirmed"},select:{userId:true}});
    const peerBlocked=(await Promise.all(peers.map(p=>blocked(tx,p.userId,reg.userId)))).some(Boolean);
    const automatic=await tx.roundtableMatchRequest.findFirst({where:{userId:reg.userId,sessionId:row.id},select:{requestId:true}});
    const phaseChanged=automatic&&!await stageFit(tx,row.id,reg.userId);
    if (!await eligible(reg.userId, tx) || await blocked(tx, row.hostId, reg.userId) || peerBlocked || phaseChanged) {
      await tx.roundtableRegistration.update({ where: { id: reg.id }, data: { status: "rejected", approvedAt: null, reason: "目前資格、配組階段或交流權限不符，請重新選擇適合場次 / Eligibility, grouping stage or connection access changed; choose a suitable session" } });
      await notice(tx, reg.userId, row, "rejected", "eligibility:" + reg.id + ":" + reg.createdAt.getTime());
      continue;
    }
    await tx.roundtableRegistration.update({ where: { id: reg.id }, data: { status: "confirmed" } });
    await notice(tx, reg.userId, row, "confirmed", "seat:" + reg.id + ":" + reg.createdAt.getTime());
    filled++;
  }
}
async function cancel(tx: DB, row: Awaited<ReturnType<typeof lockSession>>, reason: string) {
  if (row.status !== "scheduled") throw new MemberError("只有未結案場次可取消 / Only an unfinished session can be cancelled", 409);
  await tx.roundtable.update({ where: { id: row.id }, data: { status: "cancelled", cancelReason: reason, revision: { increment: 1 } } });
  for (const reg of row.registrations.filter(r => activeStatuses.includes(r.status))) await notice(tx, reg.userId, row, "cancelled", "cancel:" + reg.id);
}
export async function mentorQueue() {
  const rows = await prisma.mentorCertification.findMany({ include: { user: { select: { email: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
  return rows.map(r => ({ id: r.id, userId: r.userId, email: r.user.email, status: r.status, revision: r.revision, draft: mentorDraftSchema.parse(r.draft), note: r.note, history: r.history, updatedAt: r.updatedAt.toISOString() }));
}
export async function reviewMentor(adminEmail: string, input: z.infer<typeof mentorReviewSchema>) {
  await prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    const source = await tx.mentorCertification.findUnique({ where: { id: input.id }, include: { user: { select: { email: true } } } });
    if (!source) throw new MemberError("找不到申請 / Application not found", 404);
    if (source.user.email.toLowerCase() === adminEmail.toLowerCase()) throw new MemberError("不可審核自己的認證 / You cannot review your own certification", 403);
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', source.userId);
    const current = await tx.mentorCertification.findUniqueOrThrow({ where: { id: input.id } });
    if (current.revision !== input.revision) throw changed();
    if (input.status === "revoked" ? current.status !== "approved" : current.status !== "pending") throw new MemberError("認證狀態已變更；請重新載入 / Certification state changed; reload", 409);
    const history = [...(Array.isArray(current.history) ? current.history : []), { at: new Date().toISOString(), by: adminEmail, status: input.status, note: input.note }];
    await tx.mentorCertification.update({ where: { id: current.id }, data: { status: input.status, note: input.note, revision: { increment: 1 }, history } });
    if (input.status === "revoked") {
      const rows = await tx.roundtable.findMany({ where: { hostId: current.userId, status: "scheduled" }, orderBy: { id: "asc" }, select: { id: true } });
      for (const row of rows) await cancel(tx, await lockSession(tx, row.id), "主持導師認證已撤銷 / Host mentor certification was revoked");
    }
  }, { timeout: 15000 });
  return mentorQueue();
}
function project(row: Awaited<ReturnType<typeof lockSession>>, userId: string, blockedPeers: Set<string>) {
  const host = row.hostId === userId, mine = row.registrations.find(r => r.userId === userId);
  const member = mine?.status === "confirmed", hostBlocked = Boolean(row.hostId && blockedPeers.has(row.hostId)), authorized = (host || member) && !hostBlocked;
  const cert = row.host?.mentorCertification, mentor = cert && (cert.status === "approved" || host) ? mentorDraftSchema.parse(cert.draft) : null;
  const approvedQueue = row.registrations.filter(r => r.status === "waitlisted" && r.approvedAt);
  const commitment = (r: typeof row.registrations[number]) => {
    const value = commitmentSchema.safeParse(r.commitment).data;
    return value ? { ...value, done: r.calendarItem?.done || false } : null;
  };
  const status = !row.hostId && row.status === "scheduled" ? "cancelled" : row.status;
  return {
    seriesId: row.seriesId, frameworkStages: row.frameworkStages, id: row.id, topic: row.topic, description: row.description, steps: row.steps, industry: row.industry, languages: row.languages,
    startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(), timezone: row.timezone, capacity: row.capacity,
    registrationMode: row.registrationMode, status, cancelReason: row.cancelReason || (!row.hostId && status === "cancelled" ? "主持帳號已停用，場次取消；報名紀錄保留 / Host account removed; session cancelled and records retained" : ""), revision: row.revision, host,
    mentor: { name: hostBlocked ? "NOVA" : mentor?.publicName || "NOVA", bio: hostBlocked ? "" : mentor?.bio || "", certified: !hostBlocked && cert?.status === "approved" },
    confirmed: row.registrations.filter(r => r.status === "confirmed").length + (row.hostId ? 1 : 0),
    waiting: approvedQueue.length, pending: host ? row.registrations.filter(r => r.status === "pending" || r.status === "waitlisted" && !r.approvedAt).length : undefined,
    meetingUrl: authorized && row.status === "scheduled" && cert?.status === "approved" ? row.meetingUrl : null,
    mine: mine ? { id: mine.id, revision: mine.revision, preparation: mine.preparation, feedback: mine.feedback, status: mine.status, approved: Boolean(mine.approvedAt), name: mine.name, question: mine.question, reason: mine.reason,
      position: mine.status === "waitlisted" && mine.approvedAt ? approvedQueue.findIndex(r => r.id === mine.id) + 1 : null, attendance: mine.attendance, commitment: commitment(mine) } : null,
    people: authorized ? row.registrations.filter(r => host || !blockedPeers.has(r.userId) && r.status === "confirmed").map(r => ({ id: r.id, name: blockedPeers.has(r.userId) ? "不可交流會員 / Unavailable member" : r.name, unavailable: blockedPeers.has(r.userId), status: r.status, approved: Boolean(r.approvedAt), attendance: r.attendance,
      preparation: r.status === "confirmed" && !blockedPeers.has(r.userId) && r.preparation && typeof r.preparation === "object" && "share" in r.preparation && r.preparation.share === true ? r.preparation : null, ...(host ? { feedback: r.feedback, question: blockedPeers.has(r.userId) ? "" : r.question, reason: r.reason } : {}), commitment: row.status === "completed" && !blockedPeers.has(r.userId) ? commitment(r) : null })) : [],
  };
}
export async function getRoundtables(userId: string, id?: string) {
  const [cert, access, card, account, connections, upcoming, own, selected] = await Promise.all([
    prisma.mentorCertification.findUnique({ where: { userId } }), features(userId),
    prisma.matchmakingProfile.findUnique({ where: { userId }, select: { role: true, roles: true } }),
    networkAccount(userId),
    prisma.networkConnection.findMany({ where: { status: "blocked", OR: [{ senderId: userId }, { recipientId: userId }] }, select: { senderId: true, recipientId: true } }),
    prisma.roundtable.findMany({ where: { status: "scheduled", endsAt: { gt: new Date() }, host: { mentorCertification: { status: "approved" } } }, orderBy: { startsAt: "asc" }, take: 30, include }),
    prisma.roundtable.findMany({ where: { OR: [{ hostId: userId }, { registrations: { some: { userId } } }] }, orderBy: { startsAt: "desc" }, take: 30, include }),
    id ? prisma.roundtable.findUnique({ where: { id }, include }) : null,
  ]);
  const blockedPeers = new Set(connections.flatMap(c => [c.senderId, c.recipientId]).filter(id => id !== userId));
  const rows = [...new Map([...upcoming, ...own, ...(selected ? [selected] : [])].map(r => [r.id, r])).values()];
  return {
    serverTime: new Date().toISOString(),
    certification: cert ? { status: cert.status, revision: cert.revision, draft: mentorDraftSchema.parse(cert.draft), note: cert.note } : null,
    canApply: account.effectivePlan !== "free" && access.network && Boolean(card && memberRoles(card).includes("founder")),
    sessions: rows.map(row => project(row, userId, blockedPeers)),
  };
}
export type RoundtableState = Awaited<ReturnType<typeof getRoundtables>>;
export async function myCommitments(userId: string) {
  const rows = await prisma.roundtableRegistration.findMany({ where: { userId, commitment: { not: Prisma.DbNull } }, orderBy: { updatedAt: "desc" }, take: 100, include: { roundtable: { select: { id: true, topic: true, endsAt: true } }, calendarItem: true } });
  return rows.map(r => ({ id: r.id, session: r.roundtable.id, topic: r.roundtable.topic, at: r.roundtable.endsAt.toISOString(), planId: r.planId, stepId: r.stepId, ...commitmentSchema.parse(r.commitment), done: r.calendarItem?.done || false, revision: r.calendarItem?.revision ?? 0, calendarRemoved: Boolean(r.calendarItem?.deletedAt) }));
}
export async function mutateRoundtable(userId: string, input: RoundtableMutation, auto?: {requestId:string;requestHash:string}): Promise<string | null> {
  if(input.action === "autoApply") {
    const requestHash=hash(input),replay=await prisma.roundtableMatchRequest.findUnique({where:{userId_requestId:{userId,requestId:input.requestId}}});
    if(replay){if(replay.requestHash!==requestHash)throw changed();return replay.sessionId;}
    const account=await networkAccount(userId),state=evidenceStateSchema.parse((await prisma.evidenceWorkspace.findUnique({where:{userId}}))?.data||{});
    const options=await prisma.roundtable.findMany({where:{status:"scheduled",startsAt:{gt:new Date()},languages:{has:input.language},host:{mentorCertification:{status:"approved"}}},orderBy:{startsAt:"asc"},take:100});
    const matching=options.filter(r=>r.hostId!==userId&&(!r.frameworkStages.length||r.frameworkStages.some(n=>Math.abs(n-state.maxStage)<=1))&&(r.industry==="all"||r.industry===account.profile?.industry)).sort((a,b)=>Number(b.timezone===input.timezone)-Number(a.timezone===input.timezone)||a.startsAt.getTime()-b.startsAt.getTime());
    for(const candidate of matching){
      const peers=await prisma.roundtableRegistration.findMany({where:{roundtableId:candidate.id,status:"confirmed"},select:{userId:true,user:{select:{evidenceWorkspace:{select:{data:true}}}}}});
      if(!similarEvidenceStages([state.maxStage,...peers.map(p=>evidenceStateSchema.parse(p.user.evidenceWorkspace?.data||{}).maxStage)]))continue;
      if(await blocked(prisma as unknown as DB,candidate.hostId,userId)||(await Promise.all(peers.map(p=>blocked(prisma as unknown as DB,p.userId,userId)))).some(Boolean))continue;
      return mutateRoundtable(userId,{action:"apply",id:candidate.id,name:input.name,question:input.question,consent:true},{requestId:input.requestId,requestHash});
    }
    throw new MemberError("目前沒有符合階段、產業與語言的真實場次；請查看其他圓桌 / No real session matches your stage, industry and language; browse other sessions",404);
  }
  return prisma.$transaction(async raw => {
    const tx = raw as unknown as DB;
    if (input.action === "mentorApply") {
      await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
      const cert = await tx.mentorCertification.findUnique({ where: { userId } });
      if (cert?.status === "pending" && cert.revision === input.revision + 1 && hash(mentorDraftSchema.parse(cert.draft)) === hash(input.draft)) return null;
      if ((cert?.revision || 0) !== input.revision) throw changed();
      if (cert?.status === "approved") throw new MemberError("已認證資料由管理員核對，不能自行覆寫 / Approved certification cannot be overwritten", 409);
      const history = [...(Array.isArray(cert?.history) ? cert.history : []), { at: new Date().toISOString(), status: "pending", draft: input.draft }];
      if (history.length > 100) throw new MemberError("申請變更過多，請聯絡管理員 / Contact an administrator about further changes", 409);
      await tx.mentorCertification.upsert({ where: { userId }, create: { userId, draft: json(input.draft), revision: 1, history }, update: { draft: json(input.draft), status: "pending", note: "", revision: { increment: 1 }, history } });
      return null;
    }
    if (input.action === "commitmentDone") {
      const reg = await tx.roundtableRegistration.findFirst({ where: { id: input.registrationId, userId, commitment: { not: Prisma.DbNull } }, include: { calendarItem: true } });
      if (!reg?.calendarItem) throw new MemberError("找不到本人承諾 / Your commitment was not found", 404);
      const saved = await tx.weekCalendarItem.updateMany({ where: { id: reg.calendarItem.id, userId, revision: input.revision }, data: { done: input.done, revision: { increment: 1 } } });
      if (!saved.count) throw changed();
      return reg.roundtableId;
    }
    if (["create", "edit", "meetingLink", "cancel", "decide", "finish"].includes(input.action)) await lockMentor(tx, userId);
    if (input.action === "create") {
      const existing = await tx.roundtable.findUnique({ where: { hostId_requestId: { hostId: userId, requestId: input.requestId } } });
      if (existing) { if (existing.requestHash !== sessionHash(input.draft)) throw changed(); return existing.id; }
      if (Date.parse(input.draft.startsAt) <= Date.now()) throw new MemberError("請選擇未來開始時間 / Choose a future start time", 400);
      if (await tx.roundtable.count({ where: { hostId: userId, status: "scheduled", endsAt: { gt: new Date(input.draft.startsAt) }, startsAt: { lt: new Date(input.draft.endsAt) } } })) throw new MemberError("主持場次時間重疊 / Your hosted sessions overlap", 409);
      const { repeatCount, ...draft } = input.draft, seriesId = repeatCount > 1 ? hash([userId,input.requestId]) : null;
      let first = "";
      for(let i=0;i<repeatCount;i++) {
        const startsAt = new Date(Date.parse(draft.startsAt)+i*14*86400000), endsAt = new Date(Date.parse(draft.endsAt)+i*14*86400000);
        if(await tx.roundtable.count({where:{hostId:userId,status:"scheduled",endsAt:{gt:startsAt},startsAt:{lt:endsAt}}}))throw new MemberError("系列場次與已有會議重疊，未建立任何場次 / A series session overlaps; no sessions created",409);
        const created=await tx.roundtable.create({data:{...draft,seriesId,hostId:userId,requestId:input.requestId+(i?":"+i:""),requestHash:sessionHash(input.draft),startsAt,endsAt}});if(!i)first=created.id;
      }
      return first;
    }
    if(auto){await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;const replay=await tx.roundtableMatchRequest.findUnique({where:{userId_requestId:{userId,requestId:auto.requestId}}});if(replay){if(replay.requestHash!==auto.requestHash)throw changed();return replay.sessionId;}}
    const rememberAuto=async(sessionId:string)=>{if(auto)await tx.roundtableMatchRequest.create({data:{userId,...auto,sessionId}});};
    const row = await lockSession(tx, input.id);
    if(input.action === "prepare" || input.action === "feedback") {
      const reg=row.registrations.find(r=>r.userId===userId);
      if(!reg || reg.status!=="confirmed" || await blocked(tx,row.hostId,userId))throw new MemberError("只有正式成員可提交 / Only a confirmed participant can submit",403);
      if(input.action === "feedback") {
        if(row.status!=="completed"||reg.attendance!=="attended")throw new MemberError("出席並結案後才能評分 / Attend the completed session before rating",409);
        if(reg.feedback) { const old=reg.feedback as {requestId?:string;rating?:number;note?:string};if(old.requestId===input.requestId&&old.rating===input.rating&&old.note===input.note)return row.id;throw new MemberError("評分已保存，不能覆寫 / Feedback is already saved and cannot be overwritten",409); }
        await tx.roundtableRegistration.update({where:{id:reg.id},data:{feedback:{requestId:input.requestId,rating:input.rating,note:input.note,at:new Date().toISOString()},revision:{increment:1}}});return row.id;
      }
      open(row);if(reg.revision!==input.revision)throw changed();
      const summary=await weeklyEvidence(userId,new Date(),tx);
      await tx.roundtableRegistration.update({where:{id:reg.id},data:{question:input.question,preparation:{...summary,share:input.share,submittedAt:new Date().toISOString()},revision:{increment:1}}});return row.id;
    }
    if (input.action === "apply") {
      open(row);
      if (row.hostId === userId) throw new MemberError("主持已保留一席，不需報名 / A host seat is already reserved", 409);
      if (row.host?.mentorCertification?.status !== "approved") throw new MemberError("主持認證無效，無法報名 / Host certification is inactive", 409);
      if (await blocked(tx, row.hostId, userId)) throw new MemberError("此圓桌目前無法申請 / This session is unavailable for applications", 403);
      for(const peer of row.registrations.filter(r=>r.status === "confirmed")) if(await blocked(tx,peer.userId,userId))throw new MemberError("此組已有無法交流的會員，請選其他場次 / A group member cannot connect with you; choose another session",403);
      if(auto&&!await stageFit(tx,row.id,userId))throw new MemberError("小組階段已改變，請重新配組 / Group stages changed; try matching again",409);
      if (!await eligible(userId, tx)) throw new MemberError("需創辦人身分與有效商機媒合權益 / Founder identity and eligible member-network access are required", 403);
      const reg = row.registrations.find(r => r.userId === userId);
      if (reg && activeStatuses.includes(reg.status)) { if (reg.name !== input.name || reg.question !== input.question) throw new MemberError("已有報名；請先取消再修改問題 / Already registered; withdraw before changing your question", 409); await rememberAuto(row.id); return row.id; }
      const plan = await tx.actionPlan.findFirst({ where: { userId, activeKey: userId, archivedAt: null }, include: { actions: { orderBy: { executionOrder: "asc" } } } });
      const current = plan?.actions.find(a => !a.done);
      const status = row.registrationMode === "instant" ? "waitlisted" : row.registrations.filter(r => r.status === "confirmed").length >= row.capacity - 1 ? "waitlisted" : "pending";
      const data = { name: input.name, question: input.question, consentAt: new Date(), createdAt: new Date(), status, approvedAt: row.registrationMode === "instant" ? new Date() : null, reason: "", preparation: Prisma.DbNull, feedback: Prisma.DbNull, revision:{increment:1}, planId: plan?.id || null, stepId: current ? flowStep(current)?.id || current.id : null };
      if (reg) await tx.roundtableRegistration.update({ where: { id: reg.id }, data });
      else await tx.roundtableRegistration.create({ data: { ...data, revision:0, userId, roundtableId: row.id } });
      await promote(tx, row);
      await rememberAuto(row.id);
    } else if (input.action === "withdraw") {
      open(row);
      const reg = row.registrations.find(r => r.userId === userId);
      if (!reg) throw new MemberError("找不到本人報名 / Registration not found", 404);
      if (reg.status === "cancelled") return row.id;
      if (!activeStatuses.includes(reg.status)) throw new MemberError("此報名已結案 / Registration is already closed", 409);
      await tx.roundtableRegistration.update({ where: { id: reg.id }, data: { status: "cancelled", approvedAt: null, reason: "會員取消 / Withdrawn by member" } });
      await promote(tx, row);
    } else {
      if (row.hostId !== userId) throw new MemberError("只有主持可管理此場次 / Only the host can manage this session", 403);
      const completionHash = input.action === "finish" ? hash([...input.entries].sort((a, b) => a.registrationId.localeCompare(b.registrationId))) : null;
      if (input.action === "finish" && row.status === "completed" && row.completionHash === completionHash) return row.id;
      if (row.revision !== input.revision) throw changed();
      if (input.action === "cancel") { await cancel(tx, row, input.reason); return row.id; }
      if (input.action === "finish") {
        if (row.status !== "scheduled" || row.endsAt.getTime() > Date.now()) throw new MemberError("會議結束後才能確認出席與承諾 / Confirm attendance and commitments after the session ends", 409);
        const accepted = row.registrations.filter(r => r.status === "confirmed");
        if (new Set(input.entries.map(e => e.registrationId)).size !== input.entries.length || accepted.length !== input.entries.length || input.entries.some(e => !accepted.some(r => r.id === e.registrationId))) throw new MemberError("請核對全部正式成員，不可包含候補 / Account for every confirmed member; exclude waitlisted applicants", 400);
        for (const entry of input.entries) {
          const reg = accepted.find(r => r.id === entry.registrationId)!;
          if (entry.attendance === "absent" && entry.commitment || entry.attendance === "attended" && !entry.commitment) throw new MemberError("出席者須有承諾，未出席者不建立待辦 / Attendees need commitments; absentees receive none", 400);
          if (entry.commitment && await blocked(tx, row.hostId, reg.userId)) throw new MemberError("交流權限已停止，不能代寫承諾 / Connection access ended; no new commitment can be assigned", 409);
          let calendarItemId: string | undefined;
          if (entry.commitment) {
            if (entry.commitment.dueDate < today(row.endsAt)) throw new MemberError("承諾期限不能早於會議結束日 / The deadline must follow the session date", 400);
            const task = await tx.weekCalendarItem.create({ data: { userId: reg.userId, kind: "personal", title: entry.commitment.title, note: "來自圓桌會議 / From roundtable: " + row.topic + "\n" + entry.commitment.criteria, date: new Date(entry.commitment.dueDate), requestId: "roundtable:" + row.id + ":" + reg.id } });
            calendarItemId = task.id;
          }
          await tx.roundtableRegistration.update({ where: { id: reg.id }, data: { attendance: entry.attendance, commitment: entry.commitment ? json(entry.commitment) : Prisma.DbNull, calendarItemId } });
          await notice(tx, reg.userId, row, entry.commitment ? "commitment" : "completed", "outcome:" + reg.id);
        }
        await tx.roundtable.update({ where: { id: row.id }, data: { status: "completed", completionHash, revision: { increment: 1 } } });
        if(row.seriesId) for(const entry of input.entries.filter(e=>e.attendance==="absent")) {
          const reg=accepted.find(r=>r.id===entry.registrationId)!;
          const recent=await tx.roundtableRegistration.findMany({where:{userId:reg.userId,roundtable:{seriesId:row.seriesId,hostId:row.hostId,status:"completed",endsAt:{lte:row.endsAt}}},orderBy:{roundtable:{endsAt:"desc"}},take:2});
          if(recent.length===2&&recent.every(r=>r.attendance==="absent")) {
            const future=await tx.roundtable.findMany({where:{seriesId:row.seriesId,hostId:row.hostId,status:"scheduled",startsAt:{gt:new Date()},registrations:{some:{userId:reg.userId,status:{in:activeStatuses}}}},orderBy:{id:"asc"}});
            for(const session of future){const locked=await lockSession(tx,session.id);await tx.roundtableRegistration.updateMany({where:{roundtableId:session.id,userId:reg.userId,status:{in:activeStatuses}},data:{status:"cancelled",approvedAt:null,reason:"連續兩場缺席，釋出本系列後續名額 / Two consecutive absences released future series seats"}});await promote(tx,locked);await notice(tx,reg.userId,locked,"cancelled","absence:"+reg.id);}
          }
        }
        return row.id;
      }
      if (input.action === "meetingLink") {
        if (row.status !== "scheduled" || row.endsAt.getTime() <= Date.now()) throw new MemberError("場次已結束 / Session ended", 409);
        await tx.roundtable.update({ where: { id: row.id }, data: { meetingUrl: input.meetingUrl, revision: { increment: 1 } } });
        return row.id;
      }
      open(row);
      if (input.action === "edit") {
        if(input.draft.repeatCount!==1)throw new MemberError("修改場次不能另建系列，請建立新系列 / Create a new series separately",400);
        if (row.registrations.length) throw new MemberError("已有報名紀錄，請取消並另建場次；可單獨更新會議連結 / Applications exist; cancel and create a new session. Meeting links can be updated separately", 409);
        if (Date.parse(input.draft.startsAt) <= Date.now()) throw new MemberError("請選擇未來時間 / Choose a future time", 400);
        if (await tx.roundtable.count({ where: { hostId: userId, id: { not: row.id }, status: "scheduled", endsAt: { gt: new Date(input.draft.startsAt) }, startsAt: { lt: new Date(input.draft.endsAt) } } })) throw new MemberError("主持場次時間重疊 / Hosted sessions overlap", 409);
        await tx.roundtable.update({ where: { id: row.id }, data: { ...editableDraft(input.draft), startsAt: new Date(input.draft.startsAt), endsAt: new Date(input.draft.endsAt), revision: { increment: 1 } } });
        return row.id;
      }
      if (input.action === "decide") {
        const reg = row.registrations.find(r => r.id === input.registrationId);
        if (!reg || !["pending", "waitlisted", "confirmed"].includes(reg.status)) throw new MemberError("找不到待處理報名 / No actionable registration found", 404);
        if (input.decision === "approve" && (reg.status === "confirmed" || reg.approvedAt)) throw new MemberError("此報名已核准 / Registration was already approved", 409);
        await tx.roundtableRegistration.update({ where: { id: reg.id }, data: { status: input.decision === "approve" ? "waitlisted" : "rejected", approvedAt: input.decision === "approve" ? new Date() : null, reason: input.reason } });
        await promote(tx, row);
        await notice(tx, reg.userId, row, input.decision === "approve" ? "approved" : "rejected", "decision:" + reg.id + ":" + row.revision);
      }
    }
    await tx.roundtable.update({ where: { id: row.id }, data: { revision: { increment: 1 } } });
    return row.id;
  }, { timeout: 15000 });
}

function editableDraft(draft: import("zod").infer<typeof import("./schema").sessionDraftSchema>) { return Object.fromEntries(Object.entries(draft).filter(([key])=>key!=="repeatCount")) as Omit<typeof draft,"repeatCount">; }
function sessionHash(draft: import("zod").infer<typeof import("./schema").sessionDraftSchema>) { const {repeatCount,frameworkStages,...base}=draft;return hash(repeatCount===1&&!frameworkStages.length?base:{...base,repeatCount,frameworkStages}); }
