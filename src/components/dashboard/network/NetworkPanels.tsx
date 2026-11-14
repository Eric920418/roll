"use client";
import type { tokenQuote } from "@/lib/billing/commerce";
import ReportDraft from "./ReportDraft";
import EvidencePreferences from "../evidence/Preferences";
import ViewerOverview, { ViewerPrivacySettings } from "./ViewerOverview";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { MemberFetchError, memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { CONDITIONS, SECTIONS, conditionLabel, visitorCountLabel } from "@/lib/network/policy";
import { PrivatePhoto } from "../matchmaking/CardView";
import type { CardOwner } from "@/lib/matchmaking/service";
import type { listConnections } from "@/lib/network/service";
import type { watchSummary } from "@/lib/network/watches";
import type { notificationList } from "@/lib/network/notifications";
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";
const field = "min-h-11 w-full rounded-xl border border-dark/20 bg-white p-3";
const panel = "rounded-2xl border border-dark/15 bg-white p-5";
const api = <T,>(path: string, method = "GET", data?: unknown) => memberFetch<T>(`/api/network/${path}`, method === "GET" ? {} : { method, body: JSON.stringify(data) });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
function ErrorMessage({ error }: { error: string }) { return error ? <p role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null; }
export function useNetwork(active = true) {
  const zh = useLocale() === "zh-tw";
  const [value, setValue] = useState<{ enabled: boolean; network: boolean; portal: boolean; invite: boolean; verifiedInvestor: boolean; pricing: Awaited<ReturnType<typeof tokenQuote>> } | null>(null), [error, setError] = useState("");
  const generation = useRef(0), readAbort = useRef<AbortController | null>(null);
  const load = useCallback(async (callerSignal?: AbortSignal) => {
    readAbort.current?.abort(); const abort = new AbortController(); readAbort.current = abort;
    const signal = callerSignal ? AbortSignal.any([callerSignal, abort.signal]) : abort.signal;
    const request = ++generation.current;
    setError("");
    try {
      const next = await memberFetch<NonNullable<typeof value>>("/api/network/features", { signal, timeoutMs: 20000 });
      if (!next || [next.enabled, next.network, next.portal, next.invite, next.verifiedInvestor].some(v => typeof v !== "boolean")) throw new MemberFetchError(`HTTP 200\n${zh ? "會員權益回應格式不正確" : "Invalid member access response"}\ninvalid_response`, 200);
      if (!signal?.aborted && request === generation.current) { setValue(next); setError(""); }
    } catch (e) { if (!signal?.aborted && request === generation.current) setError(message(e)); }
  }, [zh]);
  useEffect(() => { if (!active) return; const abort = new AbortController(); void Promise.resolve().then(() => { if (!abort.signal.aborted) return load(abort.signal); }); return () => { abort.abort(); readAbort.current?.abort(); }; }, [load, active]);
  return { value, error, load };
}
export function NetworkBadge() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", { value, error, load } = useNetwork(), [unread, setUnread] = useState(0), [pollError, setPollError] = useState("");
  useEffect(() => {
    if (!value?.enabled) return;
    const refresh = () => { if (document.visibilityState === "visible") void api<{ unread: number }>("unread").then(v => { setUnread(v.unread); setPollError(""); }).catch(e => setPollError(message(e))); };
    refresh(); const interval = setInterval(refresh, 60000); return () => clearInterval(interval);
  }, [value?.enabled]);
  if (!value?.enabled && !error) return null;
  return <div className="mb-5 flex flex-wrap items-center justify-end gap-3"><ErrorMessage error={error || pollError} />{error && <button className={button} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button>}{value?.enabled && <>{value.portal && <Link className={button} href={pathForLocale("/dashboard/business-plan", locale)}>{zh ? "商業計畫書 PDF" : "Business plan PDF"}</Link>}<Link className={button} href={pathForLocale("/dashboard/messages", locale)}>{zh ? "聊天與分享" : "Chats & sharing"}</Link><Link className={button} href={pathForLocale("/dashboard/notifications", locale)}>{zh ? "通知" : "Notifications"} {unread > 0 && <span className="ml-2 rounded-full bg-dark px-2 text-white">{unread}</span>}</Link></>}</div>;
}
export function VisitRecorder({ profileId, portalId }: { profileId?: string; portalId?: string }) {
  const { value } = useNetwork(), [error, setError] = useState("");
  useEffect(() => {
    if (!value?.enabled) return;
    let timer: ReturnType<typeof setTimeout>, recorded = false, alive = true;
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible" || recorded) return;
      timer = setTimeout(() => {
        if (document.visibilityState !== "visible" || recorded) return;
        recorded = true;
        void api("views", "POST", profileId ? { profileId } : { portalId }).catch(e => { if (alive) setError(message(e)); });
      }, 2000);
    };
    schedule(); document.addEventListener("visibilitychange", schedule);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener("visibilitychange", schedule); };
  }, [value?.enabled, profileId, portalId]);
  return <ErrorMessage error={error} />;
}
export function CardPrivacySettings() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", { value, error: configError } = useNetwork();
  const [owner, setOwner] = useState<CardOwner | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setOwner(await memberFetch<CardOwner>("/api/matchmaking/me")); setError(""); } catch (e) { setError(message(e)); } }, []);
  useEffect(() => { if (value?.enabled) void Promise.resolve().then(load); }, [value?.enabled, load]);
  if (!value?.enabled) return <ErrorMessage error={configError} />;
  async function save(hidden: boolean) {
    if (!owner) return; setBusy(true);
    try { setOwner(await memberFetch<CardOwner>("/api/matchmaking/me", { method: "PATCH", body: JSON.stringify(hidden ? { action: "hide", revision: owner.revision, requestId: crypto.randomUUID() } : { action: "publish", revision: owner.revision, requestId: crypto.randomUUID(), confirmed: true, draft: owner.draft }) })); setError(""); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section className={`${panel} my-8`}><h2 className="text-xl font-semibold">{zh ? "商機媒合" : "Business matching"}</h2><ErrorMessage error={error} />{owner ? <><label className="flex min-h-11 items-center gap-3"><input type="checkbox" disabled={busy} checked={owner.hiddenByUser ?? !owner.visible} onChange={e => void save(e.target.checked)} />{zh ? "隱藏我的卡片" : "Hide my card"}</label><p className="my-2 text-sm">{owner.source?.companyName || (zh ? "請先補齊公司資料" : "Complete your company profile")}{!owner.visible && !owner.hiddenByUser && (zh ? " · 資料待補；補齊後自動公開，可先勾選隱藏。" : " · Pending company details; publishes when complete unless you hide it.")}</p>{owner.visible && owner.id && <Link className={button} href={pathForLocale(`/dashboard/matchmaking/${owner.id}`, locale)}>{zh ? "公開預覽" : "Public preview"}</Link>} <Link className={button} href={pathForLocale("/dashboard/matchmaking/me/edit", locale)}>{zh ? "卡片與照片設定" : "Card & photo settings"}</Link><div className="mt-5"><ViewerPrivacySettings /></div></> : <button className={button} onClick={() => void load()}>{zh ? "載入／重試" : "Load / retry"}</button>}</section>;
}
export function VisitorStats() {
  const { value, error } = useNetwork();
  return value?.enabled ? <ViewerOverview /> : <ErrorMessage error={error} />;
}
export function InvestorProgress({ confirmationOnly = false }: { confirmationOnly?: boolean }) {
  const zh = useLocale() === "zh-tw", { value, error: configError } = useNetwork(), [data, setData] = useState<Awaited<ReturnType<typeof watchSummary>> | null>(null), [error, setError] = useState("");
  const load = useCallback(async () => { try { setData(await api("progress")); setError(""); } catch (e) { setError(message(e)); } }, []);
  useEffect(() => { if (!value?.enabled) return; void Promise.resolve().then(load); const changed = () => void load(); window.addEventListener("nova-plan-changed", changed); return () => window.removeEventListener("nova-plan-changed", changed); }, [value?.enabled, load]);
  if (!value?.enabled) return <ErrorMessage error={configError} />;
  async function update(body: unknown) { try { await api("progress", "PATCH", body); await load(); } catch (e) { setError(message(e)); } }
  if (confirmationOnly) return <div><ErrorMessage error={error} />{data?.workspaces.map(p => p && "journeyId" in p.scope && p.interviews >= p.target && !p.complete ? <button key={p.key} className={button} onClick={() => void update({ confirmInterviews: p.scope })}>{zh ? "確認完整訪談階段完成" : "Confirm full conversation stage completion"}</button> : null)}</div>;
  return <section className={`${panel} my-5`}><h2 className="font-semibold">{zh ? "投資人觀察進度" : "Investor interest"}</h2><ErrorMessage error={error} />{data && <><p className="my-2">{zh ? `有 ${data.investors} 位投資人關注。` : `${data.investors} investors are following.`} {data.next && (zh ? `再完成 ${data.next.remaining} 家有效訪談，將通知其中 ${data.next.investors} 位。` : `${data.next.remaining} more company conversations will notify ${data.next.investors} of them.`)}</p><p className="text-sm text-dark/65">{zh ? `待同意 ${data.pending} · 需重新確認 ${data.paused} · 通知處理中 ${data.queued} · 已通知 ${data.notified}` : `Awaiting consent ${data.pending} · Paused ${data.paused} · Queued ${data.queued} · Notified ${data.notified}`}</p>{data.next && <progress className="my-3 h-2 w-full" max={data.next.target} value={Math.max(0, data.next.target - data.next.remaining)} aria-label={zh ? "距離下一個觀察門檻" : "Progress towards next observation threshold"} />}{value.portal && <label className="my-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={data.fundraising} onChange={e => void update({ fundraising: e.target.checked })} />{zh ? "開放募資（僅向同意分享的投資人揭露）" : "Open for fundraising (only disclosed to investors you approve)"}</label>}{data.workspaces.map(p => p && "journeyId" in p.scope && p.interviews >= p.target && !p.complete ? <button key={p.key} className={button} onClick={() => void update({ confirmInterviews: p.scope })}>{zh ? "確認完整訪談階段完成" : "Confirm full conversation stage completion"}</button> : null)}</>}{error && <button className={button} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button>}</section>;
}
export function InvitePanel({ profileId, opening }: { profileId: string; opening: string }) {
  const attempt = useRef<{ key: string; body: unknown } | null>(null);
  const locale = useLocale() as Locale, zh = locale === "zh-tw", { value, error: configError, load: reloadPricing } = useNetwork();
  const [state, setState] = useState<Awaited<ReturnType<typeof import("@/lib/network/service").connectionForProfile>> | null>(null), [conditions, setConditions] = useState<string[]>([]), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setState(await api(`profiles/${encodeURIComponent(profileId)}/connection`)); setError(""); } catch (e) { setError(message(e)); } }, [profileId]);
  useEffect(() => { if (value?.enabled) void Promise.resolve().then(load); }, [value?.enabled, load]);
  if (!value?.enabled) return <ErrorMessage error={configError} />;
  if (state?.own) return null;
  const connection = state?.connection, pending = connection?.status === "pending", accepted = connection?.status === "accepted", blocked = connection?.status === "blocked";
  return <section className={panel}><ErrorMessage error={error} />{!state ? <button className={button} onClick={() => void load()}>{zh ? "載入聊天／重試" : "Load chat / retry"}</button> : blocked ? <p>{zh ? "此連結無法邀請聊天" : "Chat is unavailable for this connection"}</p> : accepted || pending && !connection?.outgoing ? <Link className={`${button} bg-black text-white`} href={pathForLocale(`/dashboard/messages?connection=${connection!.id}`, locale)}>{accepted ? (zh ? "開啟聊天" : "Open chat") : (zh ? "回覆聊天邀請" : "Respond to chat request")}</Link> : pending ? <p role="status">{zh ? "等待對方接受邀請" : "Chat request pending"}</p> : <>{value.verifiedInvestor && <details className="mb-4"><summary className="min-h-11 cursor-pointer text-sm">{zh ? "投資人觀察條件（選填）" : "Investor watch conditions (optional)"}</summary>{CONDITIONS.map(c => <label key={c} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={conditions.includes(c)} onChange={e => setConditions(v => e.target.checked ? [...v, c] : v.filter(x => x !== c))} />{conditionLabel(c, zh)}</label>)}</details>}{value.invite ? <><p className="mb-3 text-sm">{zh ? `預扣 ${value.pricing.inviteFee} Token；接受才結算，拒絕、撤回或逾期退回。` : `${value.pricing.inviteFee} Token held; charged on acceptance, released on decline, cancellation or expiry.`}</p><p className="mb-3 text-xs">{zh ? "開場訊息會隨邀請送出；私人資料另經同意才分享。" : "Your opening message goes with the invitation. Private sharing needs separate consent."}</p><details className="mb-3"><summary className="min-h-11 cursor-pointer py-3 text-xs underline">{zh ? "費用與資料使用規則" : "Fees and data use"}</summary><p className="mb-3 text-sm">{zh ? `預扣 ${value.pricing.inviteFee} Token；對方接受才結算。拒絕、撤回或七日未回覆自動退回。上方開場訊息會隨邀請送出；私人資料仍需另行同意分享。` : `${value.pricing.inviteFee} Token held now and charged on acceptance. Holds are released on decline or cancellation, or after seven days without a reply. Your opening message above is sent with the request; private sharing requires separate consent.`}</p></details><button className={`${button} bg-black text-white`} disabled={busy || !opening.trim()} onClick={async () => { setBusy(true); try { const key = JSON.stringify({ profileId, opening: opening.trim(), conditions }); if (attempt.current?.key !== key) attempt.current = { key, body: { profileId, opening: opening.trim(), conditions, pricingVersion: value.pricing.version, requestId: crypto.randomUUID() } }; await api("connections", "POST", attempt.current.body); attempt.current = null; window.dispatchEvent(new Event("nova-tokens-changed")); await load(); } catch (e) { setError(message(e)); if (e instanceof MemberFetchError && e.status === 409) { attempt.current = null; await reloadPricing(); } } finally { setBusy(false); } }}>{busy ? (zh ? "送出中…" : "Sending…") : (zh ? "提出交流" : "Request to chat")}</button></> : <Link className={button} href={pathForLocale("/dashboard/account#plan", locale)}>{zh ? "升級 NOVA 以邀請聊天" : "Upgrade to NOVA to request a chat"}</Link>}</>}</section>;
}
type Connection = Awaited<ReturnType<typeof listConnections>>[number];
type Message = { id: string; body: string; mine: boolean; createdAt: string };
export function MessagesPage({ active = true, embedded = false, onUnreadChange }: { active?: boolean; embedded?: boolean; onUnreadChange?: (count: number) => void }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", { value, error: configError, load: reloadNetwork } = useNetwork(active);
  const requested = useSearchParams().get("connection");
  const [rows, setRows] = useState<Connection[]>([]), [selected, setSelected] = useState(""), [messages, setMessages] = useState<Message[]>([]), [cursor, setCursor] = useState<string | null | undefined>(undefined), [body, setBody] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<{ revision: number; sections: string[]; workspace: string }>({ revision: 0, sections: [], workspace: "" });
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof watchSummary>> | null>(null);
  const pending = useRef<{ body: string; requestId: string } | null>(null);
  const drafts = useRef(new Map<string, { body: string; pending: typeof pending.current }>());
  const selectedRef = useRef("");
  const load = useCallback(async () => { try {
    const next = await api<Connection[]>("connections"); setRows(next); onUnreadChange?.(next.reduce((sum, row) => sum + row.unread, 0));
  } catch (e) { setError(message(e)); } }, [onUnreadChange]);
  function selectConnection(item: Connection) {
    drafts.current.set(selectedRef.current, { body, pending: pending.current });
    const draft = drafts.current.get(item.id);
    setBody(draft?.body || ""); pending.current = draft?.pending || null;
    selectedRef.current = item.id; setSelected(item.id); setMessages([]); setCursor(undefined);
    setSharing({ revision: item.sharing.revision, sections: item.sharing.sections, workspace: item.sharing.scope ? JSON.stringify(item.sharing.scope) : "" });
  }
  useEffect(() => {
    if (!active || !requested || selectedRef.current === requested) return;
    const item = rows.find(row => row.id === requested);
    if (item) { const timer = setTimeout(() => selectConnection(item), 0); return () => clearTimeout(timer); }
    // Selection retains the outgoing draft; typing never reloads the message list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, rows, active]);
  const loadMessages = useCallback(async (id: string, before?: string) => {
    try {
      const result = await api<{ messages: Message[]; next: string | null }>(`connections/${id}/messages${before ? `?cursor=${encodeURIComponent(before)}` : ""}`);
      if (selectedRef.current !== id) return;
      setMessages(old => [...new Map([...old, ...result.messages].map(m => [m.id, m])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
      if (before || cursor === undefined) setCursor(result.next);
    } catch (e) { setError(message(e)); }
  }, [cursor]);
  useEffect(() => { if (!active || !value?.enabled) return; void Promise.resolve().then(load); void api<Awaited<ReturnType<typeof watchSummary>>>("progress").then(setProgress).catch(e => setError(message(e))); }, [value?.enabled, load, active]);
  const current = rows.find(r => r.id === selected);
  useEffect(() => {
    const id = current?.id, status = current?.status;
    if (!active || !id || !status || !["accepted", "blocked"].includes(status)) return;
    const refresh = () => { if (document.visibilityState === "visible") { void loadMessages(id); void load(); } };
    refresh(); const timer = setInterval(refresh, 15000); return () => clearInterval(timer);
  }, [current?.id, current?.status, loadMessages, load, active]);
  useEffect(() => {
    if (!active || !value?.enabled || current && ["accepted", "blocked"].includes(current.status)) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(timer);
  }, [active, value?.enabled, current, load]);
  async function action(fn: () => Promise<unknown>) { setBusy(true); try { await fn(); window.dispatchEvent(new Event("nova-tokens-changed")); window.dispatchEvent(new Event("nova-notifications-changed")); setError(""); await load(); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
  if (!value?.enabled) return <><ErrorMessage error={configError} />{configError && <button className={button} onClick={() => void reloadNetwork()}>{zh ? "重試" : "Retry"}</button>}<p role="status">{!value ? (zh ? "載入聊天…" : "Loading chats…") : (zh ? "會員聊天尚未開放" : "Member chat is not yet available")}</p></>;
  return <div className="space-y-4">{!embedded && <h1 className="text-xl font-semibold">{zh ? "訊息" : "Messages"}</h1>}{!embedded && <EvidencePreferences />}<ErrorMessage error={error} />{error && <button className={button} onClick={() => { setError(""); void load(); }}>{zh ? "重試" : "Retry"}</button>}<div className="grid gap-5 lg:grid-cols-[260px_1fr]"><aside className={`${panel} space-y-2`}>{!rows.length && <p>{zh ? "尚無邀請或聊天" : "No invitations or chats yet"}</p>}{rows.map(r => <button key={r.id} className={`${button} w-full justify-start ${r.id === selected ? "bg-dark text-white" : ""}`} onClick={() => { selectConnection(r); const url = new URL(window.location.href); url.searchParams.set("connection", r.id); window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`); }}>{r.company} · {statusLabel(r.status, zh)} {r.unread > 0 ? `(${r.unread})` : ""}</button>)}</aside>{current && <section className={`${panel} space-y-4`}><h2 className="text-xl font-semibold">{current.company}</h2>{current.photo && <div className="max-w-40"><PrivatePhoto url={current.photo} alt={zh ? "已接受連結的會員照片" : "Connected member photo"} /></div>}{current.portalId && <Link className={button} href={pathForLocale(`/investor/${current.portalId}`, locale)}>{zh ? "查看對方同意分享的公司資料" : "View approved company information"}</Link>}{current.privateProgress && <p>{zh ? "已同意分享的進度" : "Approved progress"}: {current.privateProgress.interviews}/{current.privateProgress.target} · {zh ? "實收公司" : "Paying companies"}: {current.privateProgress.paid}</p>}{current.profileId && <Link className={button} href={pathForLocale(`/dashboard/matchmaking/${current.profileId}`, locale)}>{zh ? "公司卡片" : "Company card"}</Link>}{current.tokenFee && <div className="rounded-xl bg-neutral-50 p-4 text-sm"><p>{current.outgoing ? (zh ? "你的交流費用" : "Your invitation fee") : (zh ? "寄件者的交流費用" : "Sender invitation fee")}: {current.tokenFee.amount} Token · {statusLabel(current.tokenFee.status, zh)}</p>{current.status === "pending" && <><p>{zh ? "未回覆退回時間" : "Unanswered hold expires"}: {new Date(current.tokenFee.expiresAt).toLocaleString(locale)}</p><p className="mt-3 whitespace-pre-wrap break-words">{current.tokenFee.opening}</p></>}</div>}{current.status === "pending" && current.outgoing && <button className={button} disabled={busy} onClick={() => void action(() => api(`connections/${current.id}`, "PATCH", { action: "cancel", revision: current.revision }))}>{zh ? "撤回邀請並退回預扣" : "Cancel invitation and release hold"}</button>}{current.status === "pending" && !current.outgoing && <div className="flex gap-3">{(["accept", "decline"] as const).map(a => <button disabled={busy} className={button} key={a} onClick={() => void action(() => api(`connections/${current.id}`, "PATCH", { action: a, revision: current.revision }))}>{zh ? (a === "accept" ? "接受聊天邀請" : "拒絕") : a}</button>)}</div>}{current.status === "pending" && current.outgoing && <p>{zh ? "等待對方接受；私人資料尚未開放。" : "Waiting for acceptance; private data is not shared."}</p>}{["accepted", "blocked"].includes(current.status) && <><button className={button} disabled={!cursor} onClick={() => { if (cursor) void loadMessages(current.id, cursor); }}>{zh ? "載入較早訊息" : "Load earlier messages"}</button><div role="log" aria-label={zh ? "聊天紀錄" : "Messages"} className="max-h-[50vh] space-y-3 overflow-y-auto">{messages.map(m => <div key={m.id} className={`rounded-xl p-3 ${m.mine ? "ml-6 bg-dark/5" : "mr-6 border border-dark/10"}`}><p className="whitespace-pre-wrap break-words">{m.body}</p><time className="text-xs text-dark/60">{new Date(m.createdAt).toLocaleString(locale)}</time></div>)}</div><button className={button} onClick={() => void action(() => api(`connections/${current.id}`, "PATCH", { action: "read", revision: current.revision }))}>{zh ? "標為已讀" : "Mark read"}</button></>}{current.status === "accepted" && <><ReportDraft disabled={busy || !active} onInsert={value => setBody(previous => [previous,value].filter(Boolean).join("\n\n"))} />{messages.some(m => /\b\d{4}-\d{2}-\d{2}\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/.test(m.body)) && <Link className={button} href={pathForLocale("/dashboard/insights?connection=" + encodeURIComponent(current.id), locale)}>{zh ? "把這次交流記錄為客戶對話" : "Record this exchange as a customer conversation"}</Link>}<label className="block">{zh ? "文字訊息" : "Message"}<textarea className={field} rows={4} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} /></label><button className={button} disabled={busy || !body.trim()} onClick={() => void action(async () => { if (pending.current?.body !== body.trim()) pending.current = { body: body.trim(), requestId: crypto.randomUUID() }; await api(`connections/${current.id}/messages`, "POST", pending.current); setBody(""); pending.current = null; await loadMessages(current.id); })}>{zh ? "送出" : "Send"}</button>{value.portal && current.verified && (current.roles?.includes("investor") || current.role === "investor") && <fieldset className="space-y-3 rounded-xl border p-4"><legend>{zh ? "同意向這位投資人分享" : "Share with this investor"}</legend><p className="text-sm">{zh ? "未勾選不分享；原始訪談及成交附件不會自動分享。" : "Unchecked sections stay private. Raw conversations and payment attachments are never shared automatically."}</p>{SECTIONS.map(s => <label key={s} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={sharing.sections.includes(s)} onChange={e => setSharing(v => ({ ...v, sections: e.target.checked ? [...v.sections, s] : v.sections.filter(x => x !== s) }))} />{sectionLabel(s, zh)}</label>)}<label className="block">{zh ? "觀察工作區" : "Progress workspace"}<select className={field} value={sharing.workspace} onChange={e => setSharing(v => ({ ...v, workspace: e.target.value }))}><option value="">{zh ? "選擇工作區" : "Select workspace"}</option>{progress?.workspaces.map(p => p && <option key={p.key} value={JSON.stringify(p.scope)}>{"planId" in p.scope ? (zh ? "目前行動計畫" : "Current action plan") : (zh ? "客戶探索工作區" : "Customer discovery workspace")} · {p.interviews}/{p.target}</option>)}</select></label><button className={button} disabled={busy} onClick={() => void action(async () => { const result = await api<{ revision: number }>(`connections/${current.id}/sharing`, "PATCH", { revision: sharing.revision, sections: sharing.sections, ...(sharing.workspace ? { scope: JSON.parse(sharing.workspace) } : {}) }); setSharing(v => ({ ...v, revision: result.revision })); })}>{zh ? "確認同意分享" : "Confirm sharing consent"}</button></fieldset>}{current.sharing.sections.length > 0 && <button className={button} disabled={busy} onClick={() => void action(async () => { const result = await api<{ revision: number }>(`connections/${current.id}/sharing`, "PATCH", { revision: sharing.revision, sections: [] }); setSharing({ revision: result.revision, sections: [], workspace: "" }); })}>{zh ? "撤銷我對此人的全部分享" : "Revoke all my sharing with this member"}</button>}</>}{current.watches.map((w, i) => <p className="flex flex-wrap items-center gap-3 text-sm" key={i}>{conditionLabel(w.condition, zh)} · {statusLabel(w.status, zh)}{<button className={button} disabled={busy} onClick={() => void action(() => api(`watches/${w.id}`, "PATCH", { enabled: w.status === "disabled" }))}>{w.status === "disabled" ? (zh ? "重新啟用" : "Enable watch") : (zh ? "停用觀察" : "Disable watch")}</button>}</p>)}{current.status !== "blocked" && <button className={`${button} text-red-800`} disabled={busy} onClick={() => void action(() => api(`connections/${current.id}`, "PATCH", { action: "block", revision: current.revision }))}>{zh ? "封鎖並停止私人分享" : "Block and stop private sharing"}</button>}</section>}</div></div>;
}
function statusLabel(key: string, zh: boolean) {
  if (!zh) return key;
  return ({ expired: "已逾期", cancelled: "已撤回", reserved: "預扣中", captured: "已結算", released: "預扣已退回", refunded: "已退款", pending: "待接受／同意", accepted: "已接受", declined: "已拒絕", blocked: "已封鎖", active: "觀察中", paused: "暫停／需確認", queued: "通知處理中", notified: "服務已接受通知", disabled: "已停用", merged: "已合併" })[key] || key;
}
function sectionLabel(key: string, zh: boolean) { return ({ signals: zh ? "觀察條件與進度通知" : "Progress signals & notifications", profile: zh ? "公司資料" : "Company profile", strategy: zh ? "策略" : "Strategy", actionPlan: zh ? "行動計畫" : "Action plan", kpis: "KPIs", milestones: zh ? "里程碑" : "Milestones", updates: zh ? "更新" : "Updates", businessPlan: zh ? "商業計畫書" : "Business plan" })[key] || key; }
export function NotificationSettings() {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", { value, error: accessError, load: reloadAccess } = useNetwork();
  const [draft, setDraft] = useState<{ weeklyEmail: boolean; watchEmail: boolean } | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const next = await api<Awaited<ReturnType<typeof notificationList>>>("notifications"); setDraft(next.preferences); setError(""); } catch (e) { setError(message(e)); } }, []);
  useEffect(() => { if (value?.enabled) void Promise.resolve().then(load); }, [value?.enabled, load]);
  async function save() {
    if (!draft || busy) return; setBusy(true); setError(""); setNotice("");
    try { await api("preferences", "PATCH", { ...draft, locale }); setNotice(zh ? "通知偏好已儲存" : "Preferences saved"); }
    catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  return <section id="notifications" className="mt-10 scroll-mt-6 space-y-4" aria-labelledby="notification-settings-title"><h2 id="notification-settings-title" className="text-xl font-semibold">{zh ? "通知設定" : "Notification settings"}</h2><EvidencePreferences embedded /><ErrorMessage error={accessError || error} />{(accessError || error) && <button className={button} onClick={() => void (accessError ? reloadAccess() : load())}>{zh ? "重新載入設定" : "Reload settings"}</button>}{value?.enabled && draft && <fieldset disabled={busy} className={panel + " space-y-3"}><legend className="font-semibold">{zh ? "其他 Email" : "More email alerts"}</legend>{(["weeklyEmail", "watchEmail"] as const).map(key => <label key={key} className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.checked })} />{key === "weeklyEmail" ? (zh ? "訪客摘要" : "Visitor summary") : (zh ? "投資人動態" : "Investor updates")}</label>)}<button className={button} onClick={() => void save()}>{zh ? "儲存偏好" : "Save preferences"}</button></fieldset>}{notice && <p role="status">{notice}</p>}</section>;
}
export function NotificationsPage() {
  const zh = useLocale() === "zh-tw", locale = useLocale(), { value, error: configError } = useNetwork(), [data, setData] = useState<Awaited<ReturnType<typeof notificationList>> | null>(null), [error, setError] = useState("");
  const load = useCallback(async () => { try { setData(await api("notifications")); setError(""); } catch (e) { setError(message(e)); } }, []);
  useEffect(() => { if (value?.enabled) void Promise.resolve().then(load); }, [value?.enabled, load]);
  async function update(path: string, body: unknown) { try { await api(path, "PATCH", body); window.dispatchEvent(new Event("nova-notifications-changed")); await load(); } catch (e) { setError(message(e)); } }
  if (!value?.enabled) return <><ErrorMessage error={configError} /><p role="status">{!value ? (zh ? "載入通知…" : "Loading notifications…") : (zh ? "通知尚未開放" : "Notifications are not yet available")}</p></>;
  return <div className="space-y-5"><h1 className="text-3xl font-semibold">{zh ? "通知" : "Notifications"}</h1><Link className={button} href={pathForLocale("/dashboard/account#notifications", locale as Locale)}>{zh ? "通知設定" : "Notification settings"}</Link><ErrorMessage error={error} /><button className={button} onClick={() => void load()}>{zh ? "重新載入" : "Reload"}</button>{data && <>{data.notifications.length ? <button className={button} onClick={() => void update("notifications", { ids: data.notifications.map(n => n.id) })}>{zh ? "全部標為已讀" : "Mark all read"}</button> : <p>{zh ? "目前沒有通知。零人瀏覽不產生週報。" : "No notifications. Weeks with no views do not generate a summary."}</p>}{data.notifications.map(n => <article key={n.id} className={panel}><p className="font-semibold">{n.kind === "evidence" ? String(zh ? n.payload.titleZh : n.payload.titleEn) : n.kind === "message" ? (zh ? "你有新的訊息" : "You have a new message") : n.kind === "connection_accepted" ? (zh ? "交流邀請已接受" : "Your invitation was accepted") : n.kind === "weekly" ? (zh ? `上週有 ${visitorCountLabel(n.payload, zh)}看了你的頁面` : `${visitorCountLabel(n.payload, zh)} viewed your page`) : n.kind === "watch" ? `${n.payload.company} · ${conditionLabel(String(n.payload.condition), zh)}` : n.kind === "roundtable" ? String(n.payload.topic || "") + " · " + ((zh ? { confirmed: "名額已確認", approved: "報名已核准，請查看名額", rejected: "報名未通過", cancelled: "場次已取消", commitment: "會後承諾已寫入今日任務", completed: "會議已結案" } : { confirmed: "Seat confirmed", approved: "Application approved; check seat status", rejected: "Application declined", cancelled: "Session cancelled", commitment: "Commitment added to today's tasks", completed: "Session completed" })[String(n.payload.event)] || (zh ? "狀態已更新" : "Status updated")) : n.kind === "invitation" ? (zh ? "你有新的連結／分享請求" : "A connection / sharing request is waiting") : (zh ? "此通知目前不再具備可讀權限或條件已改變" : "Access or conditions for this notification have changed")}</p><time className="text-xs text-dark/60">{new Date(n.createdAt).toLocaleString(locale)}</time>{n.kind === "roundtable" && <Link className={button + " mt-3"} href={pathForLocale("/dashboard/matchmaking?tab=roundtables&roundtable=" + encodeURIComponent(String(n.payload.roundtableId || "")), locale as Locale)}>{zh ? "查看圓桌與承諾" : "View roundtable and commitments"}</Link>}{["invitation","message","connection_accepted"].includes(n.kind) && <Link className={`${button} mt-3`} href={pathForLocale("/dashboard/messages", locale as Locale)}>{zh ? "查看請求" : "Open requests"}</Link>}{n.kind === "evidence" && <Link className={button} href={pathForLocale(n.payload.category === "roundtable" ? "/dashboard/matchmaking?tab=roundtables" : "/dashboard/agenda", locale as Locale)}>{zh ? "查看下一步" : "Review next step"}</Link>}{n.delivery && <p className="mt-2 text-xs">Email: {n.delivery.status === "accepted" ? (zh ? "服務已接受寄送；不代表實際送達" : "Service accepted; delivery is not confirmed") : n.delivery.status}</p>}{n.delivery?.lastError && <ErrorMessage error={n.delivery.lastError} />}</article>)}</>}</div>;
}
export function UnsubscribeConfirm({ token }: { token: string }) {
  const zh = useLocale() === "zh-tw", [notice, setNotice] = useState(""), [error, setError] = useState("");
  return <main className="mx-auto max-w-xl space-y-5 p-8"><h1 className="text-2xl font-semibold">{zh ? "確認退訂此類 Email" : "Confirm email unsubscribe"}</h1><p>{zh ? "只會停止這一類 Email；站內通知及分享授權不受影響。" : "This stops this email category only. In-app notifications and sharing permissions stay unchanged."}</p><ErrorMessage error={error} /><p role="status">{notice}</p><button disabled={Boolean(notice)} className={button} onClick={async () => { try { await memberFetch("/api/notifications/unsubscribe", { method: "POST", body: JSON.stringify({ token }) }); setNotice(zh ? "已退訂" : "Unsubscribed"); setError(""); } catch (e) { setError(message(e)); } }}>{zh ? "確認退訂" : "Confirm unsubscribe"}</button></main>;
}
export function PrintPlan() { const zh = useLocale() === "zh-tw"; return <button className={`${button} print:hidden`} onClick={() => window.print()}>{zh ? "列印／儲存 PDF" : "Print / save PDF"}</button>; }
