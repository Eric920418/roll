import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const step = body?.step;
    const data = body?.data ?? {};

    if (step === "company") {
      const fields = {
        companyName: str(data.companyName),
        industry: str(data.industry),
        companySize: str(data.companySize),
        website: str(data.website),
        country: str(data.country),
      };
      await prisma.onboardingProfile.upsert({
        where: { userId: session.uid },
        create: { userId: session.uid, ...fields },
        update: fields,
      });
      // 帳號已完成、公司資訊已填 → 推進到 Step 3
      await prisma.user.update({
        where: { id: session.uid },
        data: { onboardingStep: 3 },
      });
      return ok({ nextStep: "requirements" });
    }

    if (step === "requirements") {
      // 目標市場 / 需求兩欄已自表單移除；此處不再寫入，保留 DB 既有值不覆寫。
      const fields = {
        timeline: str(data.timeline),
        budgetRange: str(data.budgetRange),
        notes: str(data.notes),
      };
      await prisma.onboardingProfile.upsert({
        where: { userId: session.uid },
        create: { userId: session.uid, ...fields },
        update: fields,
      });
      // 需求填完 → 進入測驗（Step 4）；completed 留待測驗完成才設
      await prisma.user.update({
        where: { id: session.uid },
        data: { onboardingStep: 4 },
      });
      return ok({ nextStep: "quiz" });
    }

    return fail("未知的 onboarding 步驟", 400);
  } catch (error) {
    return failFromError(error);
  }
}
