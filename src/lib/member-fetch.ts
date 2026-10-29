import { analyticsFetch } from "@/lib/analytics";
export class MemberFetchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function memberFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await analyticsFetch(url, { ...init, cache: "no-store", headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers } });
  const body = await response.text();
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new MemberFetchError(`HTTP ${response.status}\n${body || response.statusText}`, response.status); }
  if (!response.ok) throw new MemberFetchError([`HTTP ${response.status}`, parsed.error || body, parsed.code, parsed.requestId].filter(Boolean).join("\n"), response.status);
  return parsed.data as T;
}
