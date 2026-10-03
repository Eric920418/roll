"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function notifyPlanChanged(userId?: string) {
  window.dispatchEvent(new Event("nova-plan-changed"));
  if (userId && typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(`nova-plan:${userId}`); channel.postMessage("changed"); channel.close(); }
}
export default function PlanRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`nova-plan:${userId}`) : null;
    if (channel) channel.onmessage = refresh;
    window.addEventListener("focus", refresh); window.addEventListener("nova-plan-changed", refresh);
    return () => { channel?.close(); window.removeEventListener("focus", refresh); window.removeEventListener("nova-plan-changed", refresh); };
  }, [router, userId]);
  return null;
}
