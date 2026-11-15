import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { activeOrderStatuses } from "./schema";

const tag = "prospecting-next-work";
// shortcut: external SQL writes rely on hourly revalidation; invalidate this tag when adding external writers.
export const nextProspectingWorkAt = unstable_cache(async () => {
  const [order, hold] = await Promise.all([
    prisma.prospectingOrder.aggregate({ where: { status: { in: activeOrderStatuses } }, _min: { nextAttemptAt: true } }),
    prisma.tokenReservation.aggregate({ where: { status: "reserved" }, _min: { expiresAt: true } }),
  ]);
  const dates = [order._min.nextAttemptAt, hold._min.expiresAt].filter((date): date is Date => date !== null);
  return dates.length ? new Date(Math.min(...dates.map(date => date.getTime()))).toISOString() : null;
}, [tag], { tags: [tag], revalidate: 3600 });

export function invalidateProspectingSchedule() {
  revalidateTag(tag, { expire: 0 });
}
