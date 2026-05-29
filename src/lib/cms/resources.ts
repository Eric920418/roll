import "server-only";
import type { ZodType } from "zod";
import { prisma } from "@/lib/prisma";
import { TAGS } from "./tags";
import {
  serviceSchema,
  eventSchema,
  clientSchema,
  workSchema,
  videoSchema,
  insightSchema,
} from "./validation";

// Prisma delegate 的最小共用介面（各 model 形狀一致，用於泛型 CRUD）
type Delegate = {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

export type ResourceDef = {
  label: string;
  model: Delegate;
  schema: ZodType;
  tag: string;
};

const d = (m: unknown) => m as unknown as Delegate;

export const resources: Record<string, ResourceDef> = {
  services: { label: "服務項目", model: d(prisma.service), schema: serviceSchema, tag: TAGS.services },
  events: { label: "活動", model: d(prisma.event), schema: eventSchema, tag: TAGS.events },
  clients: { label: "客戶 Logo", model: d(prisma.client), schema: clientSchema, tag: TAGS.clients },
  work: { label: "案例", model: d(prisma.workCase), schema: workSchema, tag: TAGS.work },
  videos: { label: "影片", model: d(prisma.video), schema: videoSchema, tag: TAGS.videos },
  insights: { label: "深度指南卡", model: d(prisma.insightTeaser), schema: insightSchema, tag: TAGS.insights },
};

export function getResource(key: string): ResourceDef | null {
  return resources[key] ?? null;
}
