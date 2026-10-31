"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import MatchmakingPage from "./MatchmakingPage";
import MatchmakingSharing from "./MatchmakingSharing";
import ProspectSearch from "../prospecting/ProspectSearch";
export default function MatchmakingWorkspace({ userId, initialTab = "members" }: { userId: string; initialTab?: string }) {
  const zh = useLocale() === "zh-tw";
  const initial = ["members", "prospects", "sharing"].includes(initialTab) ? initialTab : "members";
  const [tab, setTab] = useState(initial);
  const [visited, setVisited] = useState(() => new Set([initial]));
  const tabs = ["members", "prospects", "sharing"];
  function select(id: string) { setTab(id); setVisited(v => new Set([...v, id])); const url = new URL(window.location.href); url.searchParams.set("tab", id); window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`); }
  return <div className="min-w-0 space-y-6">
    <h1 className="text-3xl font-semibold sm:text-4xl">Matchmaking</h1>
    <div role="tablist" aria-label="Matchmaking" className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-100 p-2">{tabs.map((id, index) => <button key={id} id={`matchmaking-tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls={`matchmaking-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={`min-h-11 min-w-0 break-words rounded-lg px-2 py-3 text-xs sm:px-4 sm:text-sm font-semibold focus-visible:outline-2 ${tab === id ? "bg-black text-white" : "bg-white"}`} onClick={() => select(id)} onKeyDown={e => { const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : direction ? tabs[(index + direction + tabs.length) % tabs.length] : null; if (next) { e.preventDefault(); select(next); document.getElementById(`matchmaking-tab-${next}`)?.focus(); } }}>{id === "members" ? (zh ? "會員交流" : "Member network") : id === "prospects" ? (zh ? "找新公司" : "Find new companies") : (zh ? "投資人分享" : "Investor sharing")}</button>)}</div>
    {tabs.map(id => <div key={id} role="tabpanel" id={`matchmaking-panel-${id}`} aria-labelledby={`matchmaking-tab-${id}`} hidden={tab !== id}>{visited.has(id) && (id === "members" ? <MatchmakingPage active={tab === id} /> : id === "prospects" ? <ProspectSearch userId={userId} active={tab === id} /> : <MatchmakingSharing active={tab === id} />)}</div>)}
  </div>;
}
