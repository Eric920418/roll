/** Preserve the complete public API error, status and tracking ID in admin forms. */
export async function readAdminResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  let json: { data?: unknown; error?: unknown; requestId?: unknown } | null = null;
  try { json = JSON.parse(body); } catch { /* Report the response body below. */ }
  if (response.ok && json && Object.hasOwn(json, "data")) return json.data;
  const detail = typeof json?.error === "string" ? json.error : json?.error != null ? JSON.stringify(json.error) : body || "伺服器未回傳儲存結果";
  let message = `HTTP ${response.status}: ${detail}`;
  if (typeof json?.requestId === "string" && !message.includes(json.requestId)) message += `\n追蹤碼 / Reference: ${json.requestId}`;
  throw new Error(message);
}
