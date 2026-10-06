"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { RewardSummary } from "@/lib/rewards/service";
import { rewardKeys } from "@/lib/rewards/policy";
export async function rewardRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const raw = await response.text();
  let body; try { body = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status}: ${raw || response.statusText}`); }
  if (!response.ok) throw new Error(`${body.error || response.statusText}${body.code ? ` (${body.code})` : ""}`);
  return body.data as T;
}
type Context = { data: RewardSummary | null; error: string; loading: boolean; userId: string; refresh: () => Promise<void>; update: (data: RewardSummary) => void };
const RewardsContext = createContext<Context | null>(null);
export function RewardsProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [data, setData] = useState<RewardSummary | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const summaryUrl = useCallback(() => {
    try {
      const pending = sessionStorage.getItem(`nova-redeem:${userId}`);
      if (pending && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(pending)) {
        sessionStorage.removeItem(`nova-redeem:${userId}`);
        return "/api/rewards";
      }
      return pending ? `/api/rewards?redemptionRequestId=${encodeURIComponent(pending)}` : "/api/rewards";
    } catch { return "/api/rewards"; }
  }, [userId]);
  const reconcile = useCallback((summary: RewardSummary) => {
    if (summary.confirmedRedemptionRequestId) {
      try { if (sessionStorage.getItem(`nova-redeem:${userId}`) === summary.confirmedRedemptionRequestId) sessionStorage.removeItem(`nova-redeem:${userId}`); } catch { /* The transaction is still reconciled by its server summary. */ }
    }
  }, [userId]);
  const refresh = useCallback(async () => {
    const currentRevision = revision.current;
    try { const summary = await rewardRequest<RewardSummary>(summaryUrl()); if (currentRevision === revision.current) { reconcile(summary); setData(summary); setError(""); } }
    catch (cause) { if (currentRevision === revision.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [summaryUrl, reconcile]);
  const update = useCallback((summary: RewardSummary) => { revision.current++; reconcile(summary); setData(summary); setError(""); setLoading(false); }, [reconcile]);
  useEffect(() => {
    let active = true;
    const currentRevision = revision.current;
    rewardRequest<RewardSummary>(summaryUrl()).then(summary => { if (active && currentRevision === revision.current) update(summary); }).catch(cause => { if (active && currentRevision === revision.current) { setError(cause instanceof Error ? cause.message : String(cause)); setLoading(false); } });
    let day = rewardKeys().day;
    const focus = () => { if (document.visibilityState === "visible") { day = rewardKeys().day; void refresh(); } };
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    // Writes update the provider directly; only a calendar change needs a
    // background refresh. Returning to the page still refreshes the balance.
    const timer = window.setInterval(() => { if (rewardKeys().day !== day) focus(); }, 60000);
    return () => { active = false; window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); window.clearInterval(timer); };
  }, [refresh, update, summaryUrl]);
  return <RewardsContext.Provider value={{ data, error, loading, userId, refresh, update }}>{children}</RewardsContext.Provider>;
}
export function useRewards() { const context = useContext(RewardsContext); if (!context) throw new Error("RewardsProvider missing"); return context; }
export function RewardBadge() {
  const { data, error } = useRewards();
  return <span className="relative z-10 rounded-full bg-current/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums" title={error || undefined}>{data ? data.balance.toLocaleString() : "—"}</span>;
}
