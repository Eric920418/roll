/**
 * 已開始的文字串流無法再改 HTTP status；只回傳固定產品文案，避免上游狀態、JSON 或 request id 外洩。
 */
export function publicCopilotFailureMessage(
  locale: string | undefined,
  upstreamError: unknown,
): string {
  void upstreamError;
  return locale === "zh-tw"
    ? "顧問暫時無法連線，請稍後再試。"
    : "The advisor is temporarily unavailable. Please try again later.";
}
