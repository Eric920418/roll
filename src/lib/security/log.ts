/** Never serialize raw exceptions: SDK messages may contain SQL, credentials or payloads. */
export function logSecurityError(event: string, error: unknown, requestId = crypto.randomUUID()) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const identifier = (v: unknown) => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v) ? v : undefined;
  console.error({ event, requestId, name: identifier(value.name), code: identifier(value.code),
    status: typeof value.status === "number" ? value.status : undefined });
  return requestId;
}
export function publicErrorMessage(requestId: string) {
  return `伺服器暫時無法完成請求，請稍後重試 / Please retry later. 追蹤碼 / Reference: ${requestId}`;
}
