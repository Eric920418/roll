import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

const founderTag = "founder-payment-schedule", referralTag = "referral-schedule";
const reportTag = "report-delivery-schedule", newsletterTag = "newsletter-schedule";
const earliest = (dates: (Date | null)[]) => {
  const times = dates.filter((date): date is Date => date !== null).map(date => date.getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
};

// shortcut: external SQL writes rely on hourly revalidation; invalidate the relevant tag for external writers.
export const nextFounderWorkAt = unstable_cache(async () => {
  const rows = await prisma.founderOrder.findMany({ where: { OR: [
    { status: "capturing", paypalOrderId: { not: null } },
    { status: "paid", paypalCaptureId: { not: null } },
  ] }, select: { status: true, captureExpiresAt: true, paymentCheckedAt: true } });
  return earliest(rows.map(row => row.status === "capturing" ? row.captureExpiresAt || new Date(0) : row.paymentCheckedAt ? new Date(row.paymentCheckedAt.getTime() + 86400000) : new Date(0)));
}, [founderTag], { tags: [founderTag], revalidate: 3600 });

export const nextReferralWorkAt = unstable_cache(async () => {
  const row = await prisma.referral.findFirst({ where: { status: { in: ["pending", "pending_payment", "granted", "review"] } },
    orderBy: [{ checkedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], select: { checkedAt: true } });
  return row ? new Date(row.checkedAt ? row.checkedAt.getTime() + 15 * 60000 : 0).toISOString() : null;
}, [referralTag], { tags: [referralTag], revalidate: 3600 });

export const nextReportWorkAt = unstable_cache(async () => {
  const row = await prisma.marketReportDelivery.aggregate({ where: { status: { in: ["pending", "processing"] } }, _min: { nextAttemptAt: true } });
  return row._min.nextAttemptAt?.toISOString() || null;
}, [reportTag], { tags: [reportTag], revalidate: 3600 });

export const nextNewsletterWorkAt = unstable_cache(async () => {
  const [subscriber, delivery] = await Promise.all([
    prisma.newsletterSubscriber.aggregate({ where: { status: "active" }, _min: { nextDigestAt: true } }),
    prisma.newsletterDelivery.aggregate({ where: { status: { in: ["pending", "processing"] } }, _min: { nextAttemptAt: true } }),
  ]);
  return earliest([subscriber._min.nextDigestAt, delivery._min.nextAttemptAt]);
}, [newsletterTag], { tags: [newsletterTag], revalidate: 3600 });

export const invalidateFounderSchedule = () => revalidateTag(founderTag, { expire: 0 });
export const invalidateReferralSchedule = () => revalidateTag(referralTag, { expire: 0 });
export const invalidateReportSchedule = () => revalidateTag(reportTag, { expire: 0 });
export const invalidateNewsletterSchedule = () => revalidateTag(newsletterTag, { expire: 0 });
