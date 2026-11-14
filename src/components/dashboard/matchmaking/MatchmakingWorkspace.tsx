"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import MatchmakingPage from "./MatchmakingPage";
import RoundtablesPanel from "./RoundtablesPanel";
import ViewerOverview, { ViewerPrivacySettings } from "../network/ViewerOverview";
import { MessagesPage, useNetwork } from "../network/NetworkPanels";
import { memberFetch } from "@/lib/member-fetch";
import { MATCHMAKING_TABS, matchmakingTab, type MatchmakingTab } from "@/lib/dashboard/home";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

export default function MatchmakingWorkspace({ userId, initialTab, initialMentor }: { userId: string; initialTab?: string; initialMentor?: string }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const initial = matchmakingTab(initialMentor === "apply" ? "roundtables" : initialTab);
  const [tab, setTab] = useState(initial), [visited, setVisited] = useState(() => new Set<MatchmakingTab>([initial]));
  const [mentorRequest, setMentorRequest] = useState(initialMentor === "apply" ? 1 : 0);
  const [unread, setUnread] = useState(0), [error, setError] = useState("");
  const { value: network, error: networkError, load: reloadNetwork } = useNetwork();
  const activate = useCallback((id: MatchmakingTab) => { setTab(id); setVisited(v => new Set([...v, id])); }, []);
  useEffect(() => { const timer = setTimeout(() => { activate(initial); if (initialMentor === "apply") setMentorRequest(n=>n+1); }, 0); return () => clearTimeout(timer); }, [initial, initialMentor, activate]);
  useEffect(() => {
    const sync = () => { const url = new URL(window.location.href); activate(matchmakingTab(url.searchParams.get("tab") || undefined)); if (url.searchParams.get("mentor") === "apply") setMentorRequest(n=>n+1); };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [activate]);
  const loadUnread = useCallback(async () => {
    try { const rows = await memberFetch<Array<{ unread: number }>>("/api/network/connections"); setUnread(rows.reduce((sum, r) => sum + r.unread, 0)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);
  useEffect(() => {
    if (!network?.enabled || tab === "messages") return;
    const refresh = () => { if (document.visibilityState === "visible") void loadUnread(); };
    refresh(); const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [network?.enabled, tab, loadUnread]);
  function select(id: MatchmakingTab) {
    activate(id);
    const url = new URL(window.location.href); url.searchParams.set("tab", id); if (id !== "roundtables") url.searchParams.delete("mentor");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }
  const labels = zh ? ["推薦給你", "所有會員", "圓桌會議", "誰看過我", "訊息"] : ["For you", "All members", "Roundtables", "Viewed you", "Messages"];
  return <div className="min-w-0 space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-dark/10 pb-4"><div><h1 className="text-2xl font-semibold tracking-tight">{zh ? "商機媒合" : "Business matching"}</h1></div><Link href={pathForLocale("/dashboard/matchmaking/me/edit", locale)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2">{zh ? "編輯我的卡片" : "Edit my card"}</Link></header>
    <div role="tablist" aria-label={zh ? "商機媒合" : "Business matching"} className="flex min-w-0 gap-1 border-b border-dark/10 sm:gap-4">
      {MATCHMAKING_TABS.map((id, index) => <button key={id} id={`matchmaking-tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls={`matchmaking-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={`min-h-11 min-w-0 flex-1 border-b-2 px-1 py-3 text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-none sm:px-2 sm:text-sm ${tab === id ? "border-black text-black" : "border-transparent text-dark/50"}`} onClick={() => select(id)} onKeyDown={e => {
        const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        const next = e.key === "Home" ? MATCHMAKING_TABS[0] : e.key === "End" ? MATCHMAKING_TABS.at(-1) : direction ? MATCHMAKING_TABS[(index + direction + MATCHMAKING_TABS.length) % MATCHMAKING_TABS.length] : null;
        if (next) { e.preventDefault(); select(next); document.getElementById(`matchmaking-tab-${next}`)?.focus(); }
      }}>{labels[index]}{id === "messages" && unread > 0 && <span className="ml-1 inline-block rounded-full border border-current/20 px-1 text-[10px] tabular-nums sm:text-xs" aria-label={zh ? `${unread} 則未讀訊息` : `${unread} unread messages`}>{unread}</span>}</button>)}
    </div>
    {(networkError || error) && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{networkError || error}</p><button className="mt-2 min-h-11 underline" type="button" onClick={() => void (networkError ? reloadNetwork() : loadUnread())}>{zh ? "重試" : "Retry"}</button></div>}
    {MATCHMAKING_TABS.map(id => <div key={id} role="tabpanel" id={`matchmaking-panel-${id}`} aria-labelledby={`matchmaking-tab-${id}`} hidden={tab !== id}>
      {visited.has(id) && (id === "visitors" ? (tab === id && (network?.enabled ? <div className="space-y-5"><ViewerOverview /><ViewerPrivacySettings /></div> : <p role="status" className="text-sm">{network ? (zh ? "訪客紀錄目前未開放。" : "Visitor records are currently unavailable.") : (zh ? "載入訪客權益…" : "Loading visitor access…")}</p>)) : id === "roundtables" ? <RoundtablesPanel userId={userId} active={tab === id} mentorRequest={mentorRequest} /> : id === "messages" ? <div className="space-y-5"><nav aria-label={zh ? "訊息工具" : "Message tools"} className="flex flex-wrap items-center gap-2"><Link className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 whitespace-nowrap px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm hover:bg-dark/5 focus-visible:outline-2 focus-visible:outline-offset-2" href={pathForLocale("/dashboard/notifications", locale)}>{zh ? "通知" : "Notifications"}</Link><Link className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 whitespace-nowrap px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm hover:bg-dark/5 focus-visible:outline-2 focus-visible:outline-offset-2" href={pathForLocale("/dashboard/account#notifications", locale)}>{zh ? "通知設定" : "Notification settings"}</Link>{network?.portal && <Link className="inline-flex min-h-11 items-center rounded-xl border border-dark/15 whitespace-nowrap px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm hover:bg-dark/5 focus-visible:outline-2 focus-visible:outline-offset-2" href={pathForLocale("/dashboard/business-plan", locale)}>{zh ? "公司資料 PDF" : "Company information PDF"}</Link>}</nav><MessagesPage key={userId} embedded active={tab === id} onUnreadChange={setUnread} /></div> : <MatchmakingPage active={tab === id} memberView={id} />)}
    </div>)}
  </div>;
}
