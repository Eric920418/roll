import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/auth/guard";
import { ok, unauthorized, failFromError } from "@/lib/api";

// 會員後台「帳號 / 個人資料」頁的儲存端點。
// 與 /api/auth/onboarding 不同：這裡一次更新全部 profile 欄位，且「不」推進 onboardingStep —
// 這是設定編輯，不是 onboarding 流程。
// proxy 對 /api/* 放行，故此 route 自行以 getUserSession() 守衛（符合「二次守衛」慣例）。

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export async function PATCH(req: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return unauthorized();

    const body = await req.json();
    const data = body?.data ?? {};

    const fields = {
      // Step 2：公司資訊
      companyName: str(data.companyName),
      industry: str(data.industry),
      companySize: str(data.companySize),
      website: str(data.website),
      country: str(data.country),
      // Step 3：需求評估。targetMarkets 已自表單移除、不再寫入（保留 DB 既有值）；
      // needs 仍保留於帳號頁，供 Tools 落地清單個人化生成。
      needs: strArray(data.needs),
      timeline: str(data.timeline),
      budgetRange: str(data.budgetRange),
      notes: str(data.notes),
    };

    await prisma.onboardingProfile.upsert({
      where: { userId: session.uid },
      create: { userId: session.uid, ...fields },
      update: fields,
    });

    return ok({ saved: true });
  } catch (error) {
    return failFromError(error);
  }
}
