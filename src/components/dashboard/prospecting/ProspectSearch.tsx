"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import CountrySelect from "@/components/ui/CountrySelect";
import { countryLabel } from "@/lib/member-options";
import { MemberFetchError, memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { orderInputSchema, type PublicProspect } from "@/lib/prospecting/schema";
import type { prospectSnapshot } from "@/lib/prospecting/service";
import { notifyPlanChanged } from "../PlanRefresh";
type Snapshot = Awaited<ReturnType<typeof prospectSnapshot>>;
type Order = Snapshot["orders"][number];
type Selected = PublicProspect & { orderId: string };
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/25 px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
const field = "min-h-11 w-full rounded-xl border border-dark/20 bg-white p-3 text-sm focus-visible:outline-2";
export default function ProspectSearch({ userId, active = true, onSelect }: { userId: string; active?: boolean; onSelect?: (company: Selected) => void }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [data, setData] = useState<Snapshot | null>(null), [country, setCountry] = useState("TW"), [description, setDescription] = useState(""), [count, setCount] = useState<5 | 10>(5);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState(""), [consent, setConsent] = useState(false), [conflict, setConflict] = useState(false), [adding, setAdding] = useState<Selected | null>(null), [storageReady, setStorageReady] = useState(false);
  const dirty = useRef(false), sending = useRef(false), loaded = useRef(false), attempt = useRef<{ key: string; body: ReturnType<typeof orderInputSchema.parse> } | null>(null);
  const storageKey = `nova:prospects:${userId}`;
  const load = useCallback(async (cursor?: string) => {
    try {
      const fresh = await memberFetch<Snapshot>(`/api/prospects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      setData(previous => cursor && previous ? { ...fresh, orders: [...new Map([...previous.orders, ...fresh.orders].map(o => [o.id, o])).values()] } : fresh);
      if (!dirty.current && !attempt.current) { setCountry(fresh.workspace.country); setDescription(fresh.workspace.description); }
      if (attempt.current && [...fresh.orders, ...(fresh.pending ? [fresh.pending] : [])].some(o => o.submissionId === attempt.current!.body.requestId)) { attempt.current = null; try { localStorage.removeItem(storageKey); } catch { /* A later retry still uses the saved key. */ } }
      loaded.current = true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, [storageKey]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      try {
        const cached = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (cached && typeof cached.description === "string" && cached.description.length <= 4000 && typeof cached.country === "string") { dirty.current = true; setDescription(cached.description); setCountry(cached.country); setCount(cached.count === 10 ? 10 : 5); const body = orderInputSchema.safeParse(cached.attempt?.body); if (body.success && typeof cached.attempt.key === "string") attempt.current = { key: cached.attempt.key, body: body.data }; }
      } catch { setNotice(zh ? "本機草稿無法讀取；伺服器名單保留。" : "Local draft unavailable; server lists are retained."); }
      if (!cancelled) setStorageReady(true);
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [storageKey, zh]);
  useEffect(() => { if (active && storageReady && !loaded.current) { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); } }, [active, storageReady, load]);
  const pending = Boolean(data?.pending);
  useEffect(() => {
    if (!active || !storageReady) return;
    const refresh = () => { if (document.visibilityState === "visible" && !sending.current) void load(); };
    const interval = window.setInterval(refresh, pending ? 15000 : 60000);
    document.addEventListener("visibilitychange", refresh); window.addEventListener("focus", refresh);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [active, storageReady, pending, load]);
  function store(nextCountry: string, nextDescription: string, nextCount: 5 | 10) {
    dirty.current = true; setConsent(false);
    try { localStorage.setItem(storageKey, JSON.stringify({ country: nextCountry, description: nextDescription, count: nextCount, attempt: attempt.current })); }
    catch { setNotice(zh ? "本機草稿無法保存，請勿關頁；伺服器紀錄保留。" : "Local draft could not be saved; keep this page open. Server history is retained."); }
  }
  async function submit() {
    if (!data || sending.current || conflict) return;
    setError(""); setNotice("");
    const key = JSON.stringify({ country, description: description.trim(), count });
    if (attempt.current?.key !== key) attempt.current = { key, body: { requestId: crypto.randomUUID(), revision: data.workspace.revision, country, description: description.trim(), count } };
    const parsed = orderInputSchema.safeParse(attempt.current.body);
    if (!parsed.success) { setError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")); return; }
    store(country, description, count); sending.current = true; setBusy(true);
    try {
      await memberFetch("/api/prospects/orders", { method: "POST", body: JSON.stringify(parsed.data) });
      dirty.current = false; attempt.current = null; setConsent(false); try { localStorage.removeItem(storageKey); } catch { /* Server idempotency remains authoritative. */ }
      setNotice(zh ? "已排入本站背景工作，供應商接單後會更新狀態；可關頁，稍後從任一入口查看。" : "Queued locally. Status updates after provider acceptance; you may leave and return through either entry.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); if (cause instanceof MemberFetchError && cause.status === 409) setConflict(true); await load(); }
    finally { sending.current = false; setBusy(false); }
  }
  const status = (value: string) => ({ pending: zh ? "等待提交" : "Waiting to submit", queued: zh ? "服務已接單" : "Provider accepted", running: zh ? "搜尋中" : "Searching", checking: zh ? "核對聯絡來源" : "Checking contact sources", reconciling: zh ? "待確認，原訂單保留" : "Reconciliation pending", completed: zh ? "已完成" : "Completed", failed: zh ? "未交付／未接受" : "Failed / not accepted" }[value] || value);
  async function recheck(order: Order) {
    if (sending.current) return; sending.current = true; setBusy(true); setError("");
    try { await memberFetch(`/api/prospects/orders/${order.id}/recheck`, { method: "POST", body: "{}" }); await load(); setNotice(zh ? "來源已重新核對，沒有重新下單或扣 AI。" : "Sources rechecked without reordering or using AI."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { sending.current = false; setBusy(false); }
  }
  async function followup() {
    if (!adding || sending.current) return; sending.current = true; setBusy(true); setError("");
    try { await memberFetch("/api/crm", { method: "POST", body: JSON.stringify({ prospectOrderId: adding.orderId, prospectCompanyId: adding.id }) }); setAdding(null); setNotice(zh ? "已加入既有公司跟進；尚未標為已聯絡，也未自動寄信。" : "Added to your leads; not marked contacted and no email was sent."); notifyPlanChanged(userId); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { sending.current = false; setBusy(false); }
  }
  return <section aria-label={zh ? "找新公司" : "Find new companies"} className="min-w-0 space-y-5 rounded-2xl border border-dark/15 bg-white p-5 sm:p-6">
    <header><p className="text-xs font-semibold uppercase tracking-widest">{zh ? "外部潛在客戶 · Omrade" : "External prospects · Omrade"}</p><h2 className="mt-2 text-2xl font-bold">{zh ? "找新公司" : "Find new companies"}</h2><p className="mt-2 text-sm">{zh ? "這些公司不是 NOVA 會員。Matchmaking 與 Next Steps 共用這裡的條件和名單。" : "These companies are not NOVA members. Matchmaking and Next Steps share these criteria and lists."}</p></header>
    {notice && <p role="status" className="whitespace-pre-wrap rounded-xl bg-neutral-100 p-4 text-sm">{notice}</p>}
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><p className="whitespace-pre-wrap break-words">{error}</p><button className={`${button} mt-3`} onClick={() => { setError(""); void load(); }}>{zh ? "重載資料，保留輸入" : "Reload data · keep input"}</button></div>}
    {!data ? !error && <p role="status">{zh ? "載入名單…" : "Loading lists…"}</p> : <>
      <div className="flex flex-wrap gap-3 text-sm"><span>{zh ? "本月交付" : "Delivered this month"} {data.quota.delivered}/10</span><span>{zh ? "預留" : "Reserved"} {data.quota.reserved}</span><span>{zh ? "剩餘" : "Remaining"} {data.quota.remaining} · {data.quota.period} UTC</span></div>
      {!data.enabled && <p role="status" className="rounded-xl bg-neutral-100 p-4 text-sm">{zh ? "公司搜尋服務尚未開放；已存名單仍可查看。" : "Company search is not enabled; saved lists remain readable."}</p>}
      {!data.access.canSearch && <p className="rounded-xl border p-4 text-sm">{data.access.activeTrial && !data.access.claimed ? (zh ? `完成三家有效訪談可領一次五家公司，目前 ${data.access.interviews}/3。` : `Complete three valid company interviews for one five-company POC: ${data.access.interviews}/3.`) : data.access.claimed ? (zh ? "已領取一次 POC；升級 NOVA 可繼續搜尋。" : "Your one-time POC was claimed. Upgrade to NOVA to continue searching.") : (zh ? "需 NOVA／ROLL ON 或有效既有搜尋權益；原始紀錄保留。" : "NOVA / ROLL ON or an eligible existing entitlement is required; your records are retained.")} <a className={`${button} ml-2`} href={pathForLocale("/dashboard/account#billing", locale)}>{zh ? "查看方案" : "View plans"}</a></p>}
      <form onSubmit={e => { e.preventDefault(); void submit(); }} className="space-y-4">
        <fieldset disabled={busy || !storageReady} className="grid min-w-0 gap-4 sm:grid-cols-2"><CountrySelect label={zh ? "目標公司所在國家" : "Target company country"} value={country} locale={locale} onChange={v => { setCountry(v); store(v, description, count); }} /><label className="text-sm font-semibold">{zh ? "本次交付批次" : "Requested batch"}<select className={`${field} mt-2`} value={count} onChange={e => { const n = Number(e.target.value) === 10 ? 10 : 5; setCount(n); store(country, description, n); }}><option value={5}>5 {zh ? "家公司" : "companies"}</option>{data.access.fullAccess && <option value={10}>10 {zh ? "家公司" : "companies"}</option>}</select></label></fieldset>
        <label className="block text-sm font-semibold">{zh ? "目標買方描述" : "Target buyer description"}<textarea className={`${field} mt-2 font-normal`} rows={5} maxLength={4000} minLength={10} required value={description} disabled={busy} onChange={e => { setDescription(e.target.value); store(country, e.target.value, count); }} /></label>
        {data.workspace.suggested && <button type="button" className={button} disabled={busy} onClick={() => { setDescription(data.workspace.suggested); store(country, data.workspace.suggested, count); }}>{zh ? "以 Saved ICP 更新草稿" : "Use Saved ICP in this draft"}</button>}
        <p className="text-sm">{zh ? "只使用全站共用免費量，不扣 AI。每月按供應商交付批次計算；排除重複或缺乏聯絡依據後，實際可用公司可能較少。不會自動補單或付費。" : "Uses shared free company allowance, not AI requests. Your monthly allowance counts provider-delivered batches; duplicates or missing contact evidence may reduce usable results. No automatic replacement orders or paid usage."}</p>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-5 shrink-0" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />{zh ? "我確認這些搜尋條件會傳送至 Omrade，另附已知排除網域；不傳原始訪談、私人聯絡人或成交證明。" : "I confirm these targeting criteria and known excluded domains will be sent to Omrade, without raw interviews, private contacts or payment evidence."}</label>
        {conflict && <div className="space-y-3 rounded-xl bg-amber-50 p-4 text-sm"><p>{zh ? "伺服器最新條件：" : "Latest server criteria:"} {countryLabel(data.workspace.country, locale)}</p><p className="whitespace-pre-wrap">{data.workspace.description}</p><button type="button" className={button} onClick={() => { setCountry(data.workspace.country); setDescription(data.workspace.description); dirty.current = false; attempt.current = null; setConflict(false); setConsent(false); }}>{zh ? "採用最新條件" : "Use latest criteria"}</button><button type="button" className={`${button} ml-2`} onClick={() => { attempt.current = null; setConflict(false); setConsent(false); }}>{zh ? "保留我的輸入並重新確認" : "Keep my input and reconfirm"}</button></div>}
        <button type="submit" className={`${button} bg-black text-white`} disabled={busy || !data.enabled || !data.access.canSearch || !consent || Boolean(data.pending) || conflict || data.quota.remaining < count}>{busy ? (zh ? "處理中…" : "Working…") : data.access.poc ? (zh ? "領取一次五家 POC" : "Claim one five-company POC") : (zh ? `搜尋 ${count} 家新公司` : `Find ${count} new companies`)}</button>
      </form>
      {data.pending && <div role="status" className="rounded-xl bg-black p-5 text-white"><strong>{status(data.pending.status)}</strong><p className="mt-2 text-sm">{countryLabel(data.pending.country, locale)} · {data.pending.requested} {zh ? "家。處理可能需數分鐘，供應商窗口最長 40 分鐘；逾時仍保留原單對帳，可稍後回來查看。" : "companies. Processing may take several minutes within the provider's 40-minute window. Delayed orders are retained for reconciliation; you can return later."}</p>{data.pending.error && <p className="mt-2 whitespace-pre-wrap text-sm">{data.pending.error}</p>}</div>}
      <div className="space-y-5">{data.orders.map(order => <article key={order.id} className="space-y-4 rounded-xl border border-dark/15 p-4"><header><h3 className="text-lg font-bold">{countryLabel(order.country, locale)} · {status(order.status)}</h3><p className="mt-1 text-sm">{zh ? `請求 ${order.requested} · 供應商交付 ${order.delivered} · 目前合格 ${order.usable}` : `Requested ${order.requested} · Provider delivered ${order.delivered} · Currently usable ${order.usable}`}</p><p className="mt-1 text-xs">{new Date(order.createdAt).toLocaleString(locale === "zh-tw" ? "zh-TW" : "en-US", { timeZone: "Asia/Taipei" })} · Taipei</p></header>
        {order.error && <p role="alert" className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm">{order.error} {order.code} {order.requestId}</p>}
        {order.stale && order.status === "completed" && <p className="text-sm text-amber-800">{zh ? "這批使用先前條件，或聯絡來源超過 24 小時，請核對日期與來源；不會自動重新搜尋。" : "This batch uses previous criteria or contact checks are over 24 hours old. Review its date and sources; no search runs automatically."}</p>}
        {order.status === "completed" && <button type="button" className={button} disabled={busy || pending} onClick={() => void recheck(order)}>{zh ? "重新核對聯絡來源（不耗公司／AI 額度）" : "Recheck contact sources (no company / AI allowance)"}</button>}
        {order.status === "completed" && order.usable < order.requested && <p className="text-sm">{zh ? "合格新公司不足，已排除缺來源、無聯絡依據及已記錄公司，沒有補入未核對名單。" : "Fewer qualified new companies remain after source, contact and known-company checks; no unverified filler was added."}</p>}
        <div className="grid gap-4 lg:grid-cols-2">{order.companies.map(company => <section key={company.id} className="min-w-0 rounded-xl border border-dark/15 p-4"><span className="rounded-full border px-3 py-1 text-xs">{company.quality === "strong" ? (zh ? "強匹配" : "Strong match") : (zh ? "可能適合 · 有條件待確認" : "Possible match · preferences unconfirmed")}</span><h4 className="mt-3 font-bold">{company.name}</h4>{company.note && <p className="mt-2 text-sm">{company.note}</p>}<p className="mt-2 text-sm">{company.contact.name ? `${company.contact.name}${company.contact.role ? ` · ${company.contact.role}` : ""}` : (zh ? "公司共用聯絡窗口；未確認具名決策者" : "Company contact route; no named decision maker confirmed")}</p>
          <a className={`${button} mt-3 max-w-full break-all`} href={company.contact.kind === "email" ? `mailto:${company.contact.value}` : company.contact.value} target={company.contact.kind === "page" ? "_blank" : undefined} rel="noopener noreferrer">{company.contact.kind === "email" ? company.contact.value : (zh ? "開啟官方聯絡頁" : "Open official contact page")}</a><a className={`${button} ml-2 mt-3`} href={company.contact.source} target="_blank" rel="noopener noreferrer">{zh ? "查看來源" : "View source"}</a><a className={`${button} mt-3`} href={company.website} target="_blank" rel="noopener noreferrer">{zh ? "公司官網" : "Company website"}</a>
          <details className="mt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{zh ? "供應商適配依據（不是原文引用或已驗證需求）" : "Provider fit evidence (not a verbatim quote or proven demand)"}</summary>{company.evidence.map((v, i) => <p key={i} className="my-2 text-sm">{v.criterion} <a href={v.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">{zh ? "來源" : "Source"} ↗</a></p>)}</details>
          <p className="text-xs">{zh ? "公開來源已核對，不代表信箱寄達、對方會回覆或願意付費。" : "Public source checked; inbox delivery, replies and willingness to pay remain untested."}</p>
          {data.access.fullAccess && <button className={`${button} mt-3`} type="button" disabled={busy || order.stale} onClick={() => onSelect ? onSelect({ ...company, orderId: order.id }) : setAdding({ ...company, orderId: order.id })}>{onSelect ? (zh ? "準備聯絡" : "Prepare outreach") : (zh ? "加入既有公司跟進" : "Add to your follow-up leads")}</button>}
        </section>)}</div>
      </article>)}</div>
      {!data.orders.length && <p className="rounded-xl bg-neutral-50 p-5 text-sm">{zh ? "尚未建立外部公司搜尋；平台會員卡片在「會員交流」。" : "No external company orders yet. Platform member cards are in Member network."}</p>}
      {data.nextCursor && <button type="button" className={button} disabled={busy} onClick={() => void load(data.nextCursor!)}>{zh ? "載入較早名單" : "Load older lists"}</button>}
      {adding && <div className="space-y-3 rounded-xl border border-dark/25 p-4"><p>{zh ? `確認將 ${adding.name} 加入你的聯絡人／既有公司跟進？不會寄信或標為已聯絡。` : `Add ${adding.name} to your contacts / follow-up leads? This sends no email and does not mark them contacted.`}</p><button className={button} disabled={busy} onClick={() => void followup()}>{zh ? "確認加入" : "Confirm add"}</button><button className={`${button} ml-2`} disabled={busy} onClick={() => setAdding(null)}>{zh ? "取消" : "Cancel"}</button></div>}
    </>}
  </section>;
}
