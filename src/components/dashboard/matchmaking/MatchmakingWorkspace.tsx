"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import MatchmakingPage from "./MatchmakingPage";
import ProspectSearch from "../prospecting/ProspectSearch";
export default function MatchmakingWorkspace({ userId, initialTab = "members" }: { userId: string; initialTab?: string }) {
  const zh = useLocale() === "zh-tw";
  const [tab, setTab] = useState(initialTab === "prospects" ? "prospects" : "members");
  const [visited, setVisited] = useState(() => new Set([initialTab === "prospects" ? "prospects" : "members"]));
  const tabs = ["members", "prospects"];
  function select(id: string) { setTab(id); setVisited(v => new Set([...v, id])); }
  return <div className="min-w-0 space-y-6">
    <h1 className="text-3xl font-semibold sm:text-4xl">Matchmaking</h1>
    <div role="tablist" aria-label="Matchmaking" className="flex gap-2 rounded-xl bg-neutral-100 p-2">{tabs.map((id, index) => <button key={id} id={`matchmaking-tab-${id}`} role="tab" type="button" aria-selected={tab === id} aria-controls={`matchmaking-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={`min-h-11 flex-1 rounded-lg px-4 py-3 text-sm font-semibold focus-visible:outline-2 ${tab === id ? "bg-black text-white" : "bg-white"}`} onClick={() => select(id)} onKeyDown={e => { const direction = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; const next = e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[1] : direction ? tabs[(index + direction + 2) % 2] : null; if (next) { e.preventDefault(); select(next); document.getElementById(`matchmaking-tab-${next}`)?.focus(); } }}>{id === "members" ? (zh ? "會員交流" : "Member network") : (zh ? "找新公司" : "Find new companies")}</button>)}</div>
    {tabs.map(id => <div key={id} role="tabpanel" id={`matchmaking-panel-${id}`} aria-labelledby={`matchmaking-tab-${id}`} hidden={tab !== id}>{visited.has(id) && (id === "members" ? <MatchmakingPage active={tab === id} /> : <ProspectSearch userId={userId} active={tab === id} />)}</div>)}
  </div>;
}
