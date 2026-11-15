"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, PlayIcon } from "@heroicons/react/24/outline";
import { useLocale } from "next-intl";
import { memberFetch, MemberFetchError } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import { countryLabel } from "@/lib/member-options";
import type { Locale } from "@/i18n/routing";
import type { visitorSummary } from "@/lib/network/service";
import type { getViewerPrivacy, identifiedVisitors } from "@/lib/network/identified-visitors";
import { PrivatePhoto } from "../matchmaking/CardView";
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50";
const msg = (e: unknown) => e instanceof Error ? e.message : String(e);
export function ViewerPrivacySettings({ numbered = false }: { numbered?: boolean } = {}) {
  const zh = useLocale() === "zh-tw";
  const [state, setState] = useState<Awaited<ReturnType<typeof getViewerPrivacy>> | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pending = useRef({ key: "", id: "" });
  const load = useCallback(async () => { try { setState(await memberFetch("/api/network/viewer-privacy")); setError(""); } catch (e) { setError(msg(e)); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function save(enabled: boolean) {
    if (!state || busy) return; setBusy(true); setError("");
    const key = `${enabled}:${state.revision}`; if (pending.current.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try { setState(await memberFetch("/api/network/viewer-privacy", { method: "PATCH", body: JSON.stringify({ enabled, revision: state.revision, requestId: pending.current.id }) })); pending.current.key = ""; }
    catch (e) { setError(msg(e)); if (e instanceof MemberFetchError && e.status === 409) { try { setState(await memberFetch("/api/network/viewer-privacy")); } catch (cause) { setError(`${msg(e)}\n${msg(cause)}`); } } }
    finally { setBusy(false); }
  }
  return <section className="space-y-4">{numbered && <h3 className="text-2xl font-semibold"><span className="mr-3 text-sm font-normal text-dark/45">03</span>{zh ? "我的瀏覽身分" : "My viewer identity"}</h3>}<div className="rounded-2xl border border-dark/10 bg-white p-5 sm:p-6">{!numbered && <h3 className="mb-3 font-semibold">{zh ? "瀏覽身份" : "Viewer identity"}</h3>}{state ? <><label className="flex min-h-11 cursor-pointer items-center justify-between gap-4"><span><span className="block text-base font-medium sm:text-lg">{zh ? "公開我的瀏覽身份" : "Make my viewer identity visible"}</span><span className="mt-1 block text-sm text-dark/60 sm:text-base">{zh ? "開啟後，你看過的人會知道是你" : "When enabled, members you visit can see your identity"}</span></span><input type="checkbox" role="switch" aria-label={zh ? "公開我的瀏覽身份" : "Make my viewer identity visible"} className="peer sr-only" checked={state.enabled} disabled={busy || !state.available && !state.enabled} onChange={e => void save(e.target.checked)} /><span aria-hidden="true" className="flex h-6 w-11 shrink-0 items-center rounded-full bg-neutral-200 p-0.5 peer-checked:justify-end peer-checked:bg-black peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:opacity-40"><span className="h-5 w-5 rounded-full bg-white" /></span></label>{!state.available && <p className="mt-2 text-sm">{zh ? "具名瀏覽目前停用。" : "Identified views are currently disabled."}</p>}</> : <p role="status">{zh ? "載入身份設定…" : "Loading privacy settings…"}</p>}{error && <div role="alert" className="mt-3 whitespace-pre-wrap break-words text-sm text-red-800">{error}<button className={`${button} mt-2`} onClick={() => void load()}>{zh ? "重新載入／重試" : "Reload / retry"}</button></div>}</div></section>;
}
export default function ViewerOverview() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [data, setData] = useState<Awaited<ReturnType<typeof visitorSummary>> | null>(null), [error, setError] = useState("");
  const [layout, setLayout] = useState("list"), [people, setPeople] = useState<Awaited<ReturnType<typeof identifiedVisitors>> | null>(null), [peopleError, setPeopleError] = useState(""), [upgrade, setUpgrade] = useState(false), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setData(await memberFetch("/api/network/visitors")); setError(""); } catch (e) { setError(msg(e)); } }, []);
  const loadPeople = useCallback(async (cursor?: string) => { setBusy(true); try { const result = await memberFetch<NonNullable<typeof people>>(`/api/network/visitors/members${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`); setPeople(old => cursor && old ? { ...result, members: [...old.members, ...result.members] } : result); setPeopleError(""); setUpgrade(false); } catch (e) { setPeople(null); setPeopleError(msg(e)); setUpgrade(e instanceof MemberFetchError && e.status === 403); } finally { setBusy(false); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => { void Promise.resolve().then(() => loadPeople()); }, [loadPeople]);
  return <section className="space-y-8" data-viewer-overview>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-dark/10 pb-5"><div><h2 className="text-4xl font-semibold sm:text-[2.5rem] tracking-tight">{zh ? "誰看過我" : "Who viewed me"}</h2><p className="mt-2 text-base text-dark/60">{zh ? "本週" : "This week"}</p></div><button className={button + " gap-2 rounded-full! text-base!"} disabled={busy} onClick={() => { void load(); void loadPeople(); }}><ArrowPathIcon aria-hidden="true" className="h-4 w-4" />{zh ? "重新整理" : "Refresh"}</button></header>
    {error && <div role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}<button className={button} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
    <section className="space-y-4" aria-label={zh ? "本週訪客" : "This week's visitors"}><h3 className="text-2xl font-semibold"><span className="mr-3 text-sm font-normal text-dark/45">01</span>{zh ? "本週訪客" : "This week's visitors"}</h3>{data && <div className="grid gap-4 lg:grid-cols-3">
      {(["founders", "investors", "others"] as const).map(key => {
        const delta = data.comparable ? data[key] - data.previous[key] : 0;
        const label = key === "founders" ? (zh ? "創辦人" : "Founders") : key === "investors" ? (zh ? "投資人" : "Investors") : (zh ? "其他會員" : "Other members");
        const Arrow = PlayIcon;
        return <div key={key} role="group" aria-label={label} className="flex min-w-0 items-center gap-4 rounded-2xl border border-dark/10 bg-white p-6">
          <div className={`flex w-10 shrink-0 flex-col items-center gap-2 text-center ${delta > 0 ? "text-green-700" : delta < 0 ? "text-red-800" : "text-neutral-400"}`}>
            {delta ? <><Arrow aria-hidden={false} role="img" aria-label={delta > 0 ? (zh ? "增加" : "Increase") : (zh ? "減少" : "Decrease")} className={`h-6 w-6 ${delta > 0 ? "-rotate-90" : "rotate-90"}`} /><span className="text-base font-medium sm:text-lg tabular-nums">{Math.abs(delta)}</span></> : <span className="text-2xl leading-none" aria-label={data.comparable ? (zh ? "無變化" : "No change") : (zh ? "無比較資料" : "Comparison unavailable")}>–</span>}
          </div><div className="min-w-0"><p className="text-base text-neutral-600 sm:text-lg">{label}</p><p className="text-5xl font-semibold sm:text-6xl leading-tight tabular-nums">{data[key]}</p><p className="mt-1 text-sm text-neutral-500 sm:text-base">{zh ? "上週：" : "Last week: "}{data.comparable ? data.previous[key] : "–"}</p></div>
        </div>;
      })}
    </div>}</section>
    {!data && !error && <p role="status">{zh ? "載入訪客統計…" : "Loading visitor totals…"}</p>}
    <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-2xl font-semibold"><span className="mr-3 text-sm font-normal text-dark/45">02</span>{zh ? "訪客名單" : "Visitors"}</h3><div className="inline-flex overflow-hidden rounded-xl border border-dark/20">{["list", "photos"].map(v => <button className={`min-h-11 px-5 text-sm ${layout === v ? "bg-black text-white" : "bg-white"}`} aria-pressed={layout === v} key={v} onClick={() => setLayout(v)}>{v === "list" ? (zh ? "清單" : "List") : (zh ? "照片" : "Photos")}</button>)}</div></div><div className="min-h-72 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6">{peopleError && <div role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{peopleError}{upgrade ? <Link className={`${button} mt-2`} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "查看會員網絡方案" : "View network plans"}</Link> : <button className={button} disabled={busy} onClick={() => void loadPeople()}>{zh ? "重試" : "Retry"}</button>}</div>}{people && (people.members.length ? <div className={layout === "photos" ? "grid grid-cols-2 gap-4 sm:grid-cols-3" : "space-y-3"}>{people.members.map(({ card, viewedAt }, index) => <Link className={`min-w-0 rounded-xl border border-dark/15 p-4 focus-visible:outline-2 ${layout === "photos" ? index === 0 ? "col-span-2 row-span-2" : "" : "flex min-h-20 items-center gap-4"}`} key={card.id} href={pathForLocale(`/dashboard/matchmaking/${card.id}`, locale)}>{layout === "photos" && (card.photo ? <PrivatePhoto url={card.photo} alt={zh ? "會員照片" : "Member photo"} /> : <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-4xl">{(card.displayName || card.companyName || "N").slice(0, 1)}</div>)}<div className="min-w-0"><p className="mt-2 break-words font-semibold">{card.displayName || card.companyName || (zh ? "會員" : "Member")}</p><p className="mt-1 text-sm">{({ founder: zh ? "創辦人" : "Founder", investor: zh ? "投資人" : "Investor", mentor: zh ? "導師" : "Mentor", partner: zh ? "合作夥伴" : "Partner", buyer: zh ? "買家" : "Buyer" })[card.role]}{card.country ? ` · ${countryLabel(card.country, locale)}` : ""}</p><time className="mt-2 block text-xs" dateTime={viewedAt}>{new Date(viewedAt).toLocaleString(locale)}</time></div></Link>)}</div> : !people.available && <p className="text-sm">{zh ? "具名瀏覽目前停用。" : "Identified views are currently disabled."}</p>)}{busy && <p role="status">{zh ? "載入訪客…" : "Loading viewers…"}</p>}{people?.next && <button className={button} disabled={busy} onClick={() => void loadPeople(people.next!)}>{zh ? "載入更多" : "Load more"}</button>}</div></section>
  </section>;
}
