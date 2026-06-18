// 後端 auth API 回傳的穩定錯誤碼；前端據此顯示對應語系訊息（對應 messages 的 Auth.errors.*）。
export const AUTH_ERROR_CODES = [
  "generic",
  "emailTaken",
  "invalidCredentials",
  "missingFields",
  "passwordTooShort",
  "invalidEmail",
] as const;

/** 有已知 code → 回翻譯訊息；否則回 fallback（通常是後端原文 error，符合「錯誤全顯前端」）。 */
export function resolveAuthError(
  code: string | undefined,
  fallback: string,
  translate: (key: string) => string,
): string {
  if (code && (AUTH_ERROR_CODES as readonly string[]).includes(code)) {
    return translate(code);
  }
  return fallback;
}
