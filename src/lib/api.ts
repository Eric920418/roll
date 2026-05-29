import { NextResponse } from "next/server";

/** 成功回應 */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

/** 錯誤回應 — 錯誤訊息完整回傳前端（符合專案規範：所有錯誤顯示在前端） */
export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** 未授權 */
export function unauthorized() {
  return fail("未授權，請重新登入", 401);
}

/** 將未知例外轉為完整字串回應 */
export function failFromError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return fail(message, status);
}
