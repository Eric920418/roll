import type { Prisma } from "@prisma/client";

/** 將任意值轉為 Prisma Json 輸入型別（雙語物件 / 設定 blob 寫入用） */
export const asJson = (v: unknown): Prisma.InputJsonValue =>
  v as Prisma.InputJsonValue;
