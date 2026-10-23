import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/auth/guard";
import { fail, ok, unauthorized } from "@/lib/api";
import { z } from "zod";

const organizationSchema = z.object({ id: z.uuid(), name: z.string().min(1).max(256) });

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  let response;
  try {
    const client = new Anthropic({ timeout: 10000, maxRetries: 0 });
    const organization = organizationSchema.parse(await client.get<unknown>("/v1/organizations/me", {
      headers: { "anthropic-version": "2026-10-21" },
    }));
    response = ok({ provider: "anthropic", organization, deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null });
  } catch (error) {
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    response = fail(
      status === 401 ? "正式站 AI 金鑰驗證失敗 / Production AI key authentication failed" :
      status === 403 ? "正式站 AI 金鑰無權查詢組織 / Production AI key cannot retrieve its organization" :
      "無法取得正式站 AI 組織，請稍後重試 / Unable to retrieve production AI organization; try again later",
      503,
    );
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
