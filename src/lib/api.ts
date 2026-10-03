import { NextResponse } from "next/server";
import { SecurityUnavailableError } from "./security/http";
import { logSecurityError, publicErrorMessage } from "./security/log";

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

/**
 * 將未知例外轉為回應。
 * - status < 500（呼叫端明確指定的業務錯誤）：原文回傳前端，符合專案「錯誤全顯前端」規範。
 * - status >= 500（非預期例外）：回通用訊息 + code，伺服器只記錄安全的例外類型與追蹤碼，
 *   避免把 Prisma / DB / 堆疊等內部細節外洩給 client。
 */
export function failFromError(error: unknown, status = 500) {
  if (status >= 500) {
    const requestId = logSecurityError("api.unexpected", error);
    const unavailable = error instanceof SecurityUnavailableError;
    return NextResponse.json(
      { error: publicErrorMessage(requestId), code: unavailable ? "security_unavailable" : "internal", requestId },
      { status: unavailable ? 503 : status, headers: unavailable ? { "Retry-After": "60" } : undefined },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return fail(message, status);
}

export function rateLimited(retryAfterMs: number) {
  return NextResponse.json({ error: "請求過於頻繁，請稍後重試 / Too many attempts; try again later", code: "tooManyAttempts" },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } });
}
