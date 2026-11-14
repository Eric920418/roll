"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function NotificationBell() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [unread, setUnread] = useState<number | null>(null), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    try {
      const result = await memberFetch<{ unread: number }>("/api/network/unread", { signal: controller.signal, timeoutMs: 20000 });
      if (!Number.isSafeInteger(result?.unread) || result.unread < 0) throw new Error(zh ? "通知數量回應格式不正確" : "Invalid unread notification count");
      if (!controller.signal.aborted) { setUnread(result.unread); setError(""); }
    } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [zh]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { if (alive) void load(); }, visibility = () => { if (document.visibilityState === "visible") refresh(); else pending.current?.abort(); };
    void Promise.resolve().then(refresh); const interval = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh); window.addEventListener("nova-notifications-changed", refresh); document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; clearInterval(interval); pending.current?.abort(); window.removeEventListener("focus", refresh); window.removeEventListener("nova-notifications-changed", refresh); document.removeEventListener("visibilitychange", visibility); };
  }, [load]);
  const label = (zh ? "通知" : "Notifications") + (unread ? (zh ? `，${unread} 則未讀` : `, ${unread} unread`) : "");
  return <div className="relative max-w-full"><Link href={pathForLocale("/dashboard/notifications", locale)} aria-label={label} title={label} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-dark/15 bg-white focus-visible:outline-2 focus-visible:outline-offset-2"><svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{Boolean(unread) && <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-black px-1 text-center text-[10px] leading-5 text-white">{unread! > 99 ? "99+" : unread}</span>}</Link>{error && <div className="max-w-xs text-xs"><p role="alert" className="whitespace-pre-wrap break-words text-red-800">{error}</p><button type="button" className="min-h-11 underline" onClick={() => void load()}>{zh ? "重試通知" : "Retry notifications"}</button></div>}</div>;
}
