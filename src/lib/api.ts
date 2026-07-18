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

/**
 * 將未知例外轉為回應。
 * - status < 500（呼叫端明確指定的業務錯誤）：原文回傳前端，符合專案「錯誤全顯前端」規範。
 * - status >= 500（非預期例外）：回通用訊息 + code，真實訊息只寫進 server log，
 *   避免把 Prisma / DB / 堆疊等內部細節外洩給 client。
 */
export function failFromError(error: unknown, status = 500) {
  if (status >= 500) {
    console.error("[api] unexpected error:", error);
    return NextResponse.json(
      { error: "伺服器發生非預期錯誤，請稍後再試。", code: "internal" },
      { status },
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return fail(message, status);
}
