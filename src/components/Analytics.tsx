"use client";
import Script from "next/script";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { analyticsPath, flushAnalytics, engagementInterval, safeAnalyticsPayload, track, type AnalyticsFeature } from "@/lib/analytics";

const hosts = ["rollon.com.tw", "www.rollon.com.tw", "www.rollgrp.com", "rollgrp.com"];
export default function Analytics() {
  const pathname = usePathname();
  const enabled = process.env.NEXT_PUBLIC_UMAMI_ENABLED === "true";
  const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "", script = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL || "https://cloud.umami.is/script.js";
  const configured = enabled && /^[\da-f]{8}-[\da-f-]{27}$/i.test(website) && /^https:\/\/([a-z0-9-]+\.)?umami\.is\/script\.js$/.test(script);
  useEffect(() => {
    (window as unknown as { novaAnalyticsBeforeSend: typeof safeAnalyticsPayload }).novaAnalyticsBeforeSend = safeAnalyticsPayload;
  }, []);
  useEffect(() => {
    if (!configured || !hosts.includes(location.hostname) || !analyticsPath(pathname)) return;
    const path = analyticsPath(pathname)!;
    const feature: AnalyticsFeature | null = path.includes("matchmaking") ? "matchmaking" : path.includes("messages") ? "chat_invite" : path.includes("profile") ? "icp" : path.includes("agenda") || path.includes("insights") ? "interview" : path.includes("rewards") ? "rewards" : path.includes("feedback") ? "feedback" : path.includes("account") || path === "/product" ? "upgrade" : null;
    if (!feature) return;
    let last = performance.now(), active = last, elapsed = 0;
    let visible = document.visibilityState === "visible" && document.hasFocus();
    const accumulate = () => { const now = performance.now(); elapsed += engagementInterval(last, now, active, visible); last = now; };
    const activity = () => { accumulate(); active = performance.now(); };
    const flush = () => { accumulate(); if (elapsed >= 1000) track("feature_time", { feature, seconds: elapsed / 1000 }); elapsed = 0; };
    const visibility = () => { flush(); visible = document.visibilityState === "visible" && document.hasFocus(); if (visible) active = performance.now(); };
    for (const name of ["pointerdown", "keydown", "scroll"]) window.addEventListener(name, activity, { passive: true });
    for (const name of ["focus", "blur", "pagehide"]) window.addEventListener(name, visibility);
    document.addEventListener("visibilitychange", visibility);
    return () => { flush(); for (const name of ["pointerdown", "keydown", "scroll"]) window.removeEventListener(name, activity); for (const name of ["focus", "blur", "pagehide"]) window.removeEventListener(name, visibility); document.removeEventListener("visibilitychange", visibility); };
  }, [pathname, configured]);
  if (!configured) return null;
  return <Script id="nova-umami" strategy="afterInteractive" src={script} onReady={flushAnalytics} data-website-id={website} data-domains={hosts.join(",")} data-exclude-search="true" data-exclude-hash="true" data-do-not-track="true" data-before-send="novaAnalyticsBeforeSend" />;
}
