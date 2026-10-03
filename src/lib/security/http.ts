import { NextResponse } from "next/server";

/** Browser mutations only. Provider callbacks must authenticate separately. */
export function browserMutationGuard(req: Request, json = true): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "請從本站頁面提交 / Submit from this site", code: "invalid_origin" }, { status: 403 });
  }
  if (json && req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "請使用 JSON 格式 / JSON content required", code: "invalid_content_type" }, { status: 415 });
  }
  return null;
}

export class SecurityUnavailableError extends Error {
  constructor() { super("Security service unavailable"); this.name = "SecurityUnavailableError"; }
}
