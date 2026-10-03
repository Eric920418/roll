import { NextResponse } from "next/server";
import { z } from "zod";
import { failFromError } from "@/lib/api";
import { RewardError } from "./service";
export function rewardFailure(error: unknown) {
  if (error instanceof RewardError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".") || "欄位"}: ${i.message}`).join("；"), code: "invalid_input" }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "無效 JSON / Invalid JSON", code: "invalid_json" }, { status: 400 });
  return failFromError(error);
}
export function privateRewardResponse<T>(data: T) {
  return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
}
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) throw new RewardError("請從平台頁面提交 / Submit from the platform", 403, "invalid_origin");
}
