import { unstable_cache } from "next/cache";
import type {
  Service,
  Event,
  Client,
  WorkCase,
  Video,
  InsightTeaser,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TAGS, SETTINGS_TAG } from "./tags";

/** 取得 Setting blob（key 不存在回空物件），快取於 settings 標籤 */
export const getSetting = (key: string) =>
  unstable_cache(
    () =>
      prisma.setting
        .findUnique({ where: { key } })
        .then((r) => (r?.value as Record<string, unknown> | undefined) ?? {}),
    ["setting", key],
    { tags: [SETTINGS_TAG], revalidate: 60 },
  )();

// 前台用 getter：僅取 published，依 order 排序，包 unstable_cache + tag。
// mutation 後由 admin API 呼叫 revalidateContent(TAGS.x) 失效。
const opts = (tag: string): { tags: string[]; revalidate: number } => ({
  tags: [tag],
  revalidate: 60,
});

export const getServices = (): Promise<Service[]> =>
  unstable_cache(
    () =>
      prisma.service.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    ["pub", TAGS.services],
    opts(TAGS.services),
  )();

export const getEvents = (): Promise<Event[]> =>
  unstable_cache(
    () =>
      prisma.event.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    ["pub", TAGS.events],
    opts(TAGS.events),
  )();

export const getClients = (): Promise<Client[]> =>
  unstable_cache(
    () =>
      prisma.client.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    ["pub", TAGS.clients],
    opts(TAGS.clients),
  )();

export const getWorkCases = (): Promise<WorkCase[]> =>
  unstable_cache(
    () =>
      prisma.workCase.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    ["pub", TAGS.work],
    opts(TAGS.work),
  )();

export const getVideos = (): Promise<Video[]> =>
  unstable_cache(
    () =>
      prisma.video.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    ["pub", TAGS.videos],
    opts(TAGS.videos),
  )();

export const getInsightTeasers = (): Promise<InsightTeaser[]> =>
  unstable_cache(
    () =>
      prisma.insightTeaser.findMany({
        where: { published: true },
        orderBy: { order: "asc" },
      }),
    ["pub", TAGS.insights],
    opts(TAGS.insights),
  )();
