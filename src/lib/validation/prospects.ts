import "server-only";
import { z } from "zod";
import type { Account } from "@/lib/auth/account";
import { scopeSchema } from "./schema";
import { orderInputSchema } from "@/lib/prospecting/schema";
import { createProspectOrder } from "@/lib/prospecting/service";
export const prospectInputSchema = orderInputSchema.omit({ count: true }).extend({ scope: scopeSchema.optional(), locale: z.enum(["en", "zh-tw"]), prospectCount: z.union([z.literal(5), z.literal(10)], { error: "公司搜尋已更新，請重新載入並選五家或十家 / Search updated; reload and select five or ten companies" }) }).strict();
export async function generateProspects(account: Account, input: z.infer<typeof prospectInputSchema>) {
  return createProspectOrder(account.id, orderInputSchema.parse({ requestId: input.requestId, revision: input.revision, country: input.country, description: input.description, count: input.prospectCount }));
}
