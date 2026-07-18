import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, fail, unauthorized, failFromError } from "@/lib/api";

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

// 基本 URL 正規化：補上 https:// 後能被 URL() 解析才保留，否則存 null（僅資料品質，不阻擋存檔）。
const webUrl = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    new URL(withScheme);
    return withScheme;
  } catch {
    return null;
  }
};

export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const step = body?.step;
    const data = body?.data ?? {};

    // onboardingStep 只前進不倒退；已 completed 者重訪不改動步驟（避免把進度退回）。
    const current = await prisma.user.findUnique({
      where: { id: session.uid },
      select: { onboardingStep: true, completed: true },
    });
    const advanceTo = async (target: number) => {
      if (current?.completed) return;
      const next = Math.max(current?.onboardingStep ?? 1, target);
      if (next !== current?.onboardingStep) {
        await prisma.user.update({
          where: { id: session.uid },
          data: { onboardingStep: next },
        });
      }
    };

    if (step === "company") {
      const fields = {
        companyName: str(data.companyName),
        industry: str(data.industry),
        companySize: str(data.companySize),
        website: webUrl(data.website),
        country: str(data.country),
      };
      await prisma.onboardingProfile.upsert({
        where: { userId: session.uid },
        create: { userId: session.uid, ...fields },
        update: fields,
      });
      await advanceTo(3); // 公司資訊填完 → Step 3
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
      await advanceTo(4); // 需求填完 → 測驗（Step 4）；completed 留待測驗完成才設
      return ok({ nextStep: "quiz" });
    }

    return fail("未知的 onboarding 步驟", 400);
  } catch (error) {
    return failFromError(error);
  }
}
