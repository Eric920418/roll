import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { changed, MemberError } from "@/lib/member-http";
import type { Reflection, ReflectionEntry } from "./schema";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const select = { id: true, blocker: true, controllable: true, nextAction: true, revision: true, createdAt: true, updatedAt: true } as const;
const serialize = (row: Omit<ReflectionEntry, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date }): ReflectionEntry => ({ id: row.id, blocker: row.blocker, controllable: row.controllable, nextAction: row.nextAction, revision: row.revision, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
export async function listReflections(userId: string, page: number) {
  const rows = await prisma.mindsetEntry.findMany({ where: { userId, deletedAt: null }, select, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21 });
  return { entries: rows.slice(0, 20).map(serialize), hasMore: rows.length > 20 };
}
export async function getReflection(userId: string, id: string) {
  const row = await prisma.mindsetEntry.findFirst({ where: { id, userId, deletedAt: null }, select });
  if (!row) throw new MemberError("找不到反思紀錄 / Reflection not found", 404);
  return serialize(row);
}
export async function createReflection(userId: string, requestId: string, reflection: Reflection) {
  const hash = digest(reflection);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.mindsetEntry.findUnique({ where: { userId_createRequestId: { userId, createRequestId: requestId } } });
    if (existing) {
      if (existing.createRequestHash !== hash || existing.deletedAt) throw changed();
      return serialize({ ...existing });
    }
    return serialize(await tx.mindsetEntry.create({ data: { userId, ...reflection, createRequestId: requestId, createRequestHash: hash, lastRequestId: requestId, lastRequestHash: hash }, select }));
  });
}
export async function changeReflection(userId: string, id: string, revision: number, requestId: string, reflection?: Reflection) {
  const hash = digest({ action: reflection ? "edit" : "delete", revision, reflection });
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const row = await tx.mindsetEntry.findFirst({ where: { id, userId } });
    if (!row) throw new MemberError("找不到反思紀錄 / Reflection not found", 404);
    if (row.lastRequestId === requestId) { if (row.lastRequestHash !== hash) throw changed(); return { saved: true }; }
    if (row.deletedAt) throw new MemberError("找不到反思紀錄 / Reflection not found", 404);
    if (row.revision !== revision) throw changed();
    await tx.mindsetEntry.update({ where: { id }, data: { ...(reflection || { deletedAt: new Date(), blocker: "", controllable: "", nextAction: "" }), revision: { increment: 1 }, lastRequestId: requestId, lastRequestHash: hash } });
    return { saved: true };
  });
}
