import { analyticsFetch } from "@/lib/analytics";
export class MemberFetchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function memberFetch<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const { timeoutMs, ...request } = init || {};
  const zh = typeof document !== "undefined" && document.documentElement.lang === "zh-tw";
  const deadline = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
  let receivedStatus: number | undefined;
  try {
    const response = await analyticsFetch(url, { ...request, signal: deadline ? AbortSignal.any([deadline, ...(request.signal ? [request.signal] : [])]) : request.signal, cache: "no-store", headers: { ...(request.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...request.headers } });
    receivedStatus = response.status;
    const body = await response.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { throw new MemberFetchError(`HTTP ${response.status}\n${body || response.statusText}`, response.status); }
    if (!response.ok) throw new MemberFetchError([`HTTP ${response.status}`, parsed?.error || body, parsed?.code, parsed?.requestId].filter(Boolean).join("\n"), response.status);
    if (timeoutMs && (!parsed || typeof parsed !== "object" || !("data" in parsed))) throw new MemberFetchError(`HTTP ${response.status}\n${zh ? "回應格式不正確，請重試" : "Invalid response format; retry"}\ninvalid_response`, response.status);
    return parsed.data as T;
  } catch (error) {
    if (deadline?.aborted && !request.signal?.aborted) {
      const message = (zh ? `等待超過 ${Math.ceil(timeoutMs! / 1000)} 秒，尚未收到完整回應；請重試。` : `No complete response within ${Math.ceil(timeoutMs! / 1000)} seconds; retry.`) + "\nread_timeout";
      throw receivedStatus ? new MemberFetchError(`HTTP ${receivedStatus}\n${message}`, receivedStatus) : new Error(message);
    }
    throw error;
  }
}
