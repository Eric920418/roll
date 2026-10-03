"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import type { RewardSummary } from "@/lib/rewards/service";
import { rewardRequest, useRewards } from "./RewardsProvider";
const control = "min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-dark/30";
const button = "inline-flex min-h-11 items-center justify-center rounded-xl bg-dark px-5 py-2 text-sm font-bold text-white hover:bg-dark/85 disabled:opacity-40";
export default function RewardsPage() {
  const t = useTranslations("Rewards"), locale = useLocale() as Locale;
  const { data, loading, error, refresh, update, userId } = useRewards();
  const [busy, setBusy] = useState(false), [localError, setLocalError] = useState(""), [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [more, setMore] = useState<RewardSummary["entries"]>([]), [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [enabled, setEnabled] = useState(false), [time, setTime] = useState("09:00"), [timeZone, setTimeZone] = useState("Asia/Taipei");
  const initialized = useRef(false);
  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setEnabled(data.reminder?.enabled ?? false); setTime(data.reminder?.time ?? "09:00");
    setTimeZone(data.reminder?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Taipei");
  }, [data]);
  async function redeem() {
    setBusy(true); setLocalError(""); setNotice("");
    const storageKey = `nova-redeem:${userId}`;
    try {
      const requestId = sessionStorage.getItem(storageKey) ?? crypto.randomUUID(); sessionStorage.setItem(storageKey, requestId);
      const result = await rewardRequest<{ summary: RewardSummary }>("/api/rewards/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }) });
      sessionStorage.removeItem(storageKey); update(result.summary); setMore([]); setCursor(undefined); setNotice(t("redeemed")); dialog.current?.close();
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : String(cause)); dialog.current?.close(); await refresh(); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setLocalError(""); setNotice("");
    try { update(await rewardRequest<RewardSummary>("/api/rewards/reminder", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, time, timeZone, locale }) })); setNotice(t("saved")); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function loadMore() {
    if (!data) return; setBusy(true); setLocalError("");
    try { const next = await rewardRequest<RewardSummary>(`/api/rewards?cursor=${encodeURIComponent(cursor ?? data.nextCursor ?? "")}`); setMore(previous => [...previous, ...next.entries]); setCursor(next.nextCursor); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const timeZones = [...new Set([timeZone, ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["Asia/Taipei", "Asia/Tokyo", "Europe/London", "America/New_York", "UTC"])])];
  return <div className="font-[family-name:var(--font-body)]">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-dark/45">{t("eyebrow")}</p>
    <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] font-[family-name:var(--font-heading)]">{t("title")}</h1>
    <p className="mt-2 max-w-xl text-sm leading-6 text-dark/60">{t("subtitle")}</p>
    {(error || localError) && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{localError || error}</p><button type="button" className="min-h-11 underline" onClick={() => { setLocalError(""); void refresh(); }}>{t("retry")}</button></div>}
    {(notice || data?.confirmedRedemptionRequestId) && <p role="status" className="mt-5 rounded-xl border border-dark/15 bg-white p-4 text-sm font-semibold">✓ {notice || t("redeemed")}</p>}
    {loading ? <p role="status" className="mt-8 text-sm text-dark/50">{t("loading")}</p> : data && <>
      <div className="mt-7 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="rounded-2xl bg-dark p-6 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">{t("available")}</p>
          <p className="mt-4 text-6xl font-extrabold tracking-[-0.05em] tabular-nums">{data.balance.toLocaleString()}<span className="ml-3 text-lg font-normal tracking-normal text-white/60">{t("points")}</span></p>
          <div className="mt-8 border-t border-white/20 pt-5"><div className="flex justify-between gap-4 text-sm"><span>{t("rewardRemaining")}</span><strong>{data.rewardRemaining}</strong></div><div className="mt-3 flex justify-between gap-4 text-xs text-white/60"><span>{t("monthRedeemed")}</span><span>{data.monthlyRedeemed} / 20</span></div></div>
        </section>
        <section className="flex flex-col rounded-2xl border border-dark/10 bg-white p-6 sm:p-8">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-dark/45">POLARIS</span><h2 className="mt-3 text-2xl font-extrabold">{t("rewardPack")}</h2><p className="mt-3 text-sm leading-6 text-dark/60">{t("packDetail")}</p>
          <div className="mt-auto pt-6"><button type="button" className={button+" w-full"} disabled={busy || data.balance < 100 || data.monthlyRedeemed >= 20} onClick={() => { setLocalError(""); dialog.current?.showModal(); }}>{t("redeem")}</button><p className="mt-3 text-center text-xs text-dark/50">{data.monthlyRedeemed >= 20 ? t("monthlyLimit") : data.balance < 100 ? t("toNext", { points: 100-data.balance }) : t("ready")}</p></div>
        </section>
      </div>
      <section className="mt-6 rounded-2xl border border-dark/10 bg-white p-6"><h2 className="text-lg font-extrabold">{t("today")}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.opportunities.map((opportunity, i) => <Link key={`${opportunity.kind}:${i}`} href={pathForLocale(opportunity.href, locale)} className="flex min-h-24 items-center justify-between gap-4 rounded-xl border border-dark/10 p-4 hover:border-dark/40"><span className="text-sm font-semibold">{opportunity.kind === "action" ? opportunity.title : t(`opportunity.${opportunity.kind}`)}</span><span className="shrink-0 text-sm font-bold">+{opportunity.points} →</span></Link>)}</div>{!data.opportunities.length && <p className="mt-3 text-sm text-dark/60">{t("allDone")}</p>}</section>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <section id="reminder" className="scroll-mt-6 rounded-2xl border border-dark/10 bg-white p-6"><h2 className="text-lg font-extrabold">{t("reminderTitle")}</h2><p className="mt-2 text-sm leading-6 text-dark/60">{t("reminderDetail")}</p><form onSubmit={save} className="mt-4 space-y-4"><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold"><input type="checkbox" className="h-5 w-5 accent-black" checked={enabled} disabled={busy || !data.emailAvailable && !data.reminder?.enabled} onChange={e => setEnabled(e.target.checked)} />{t("reminderOptIn")}</label>{!data.emailAvailable && <p role="status" className="rounded-xl bg-dark/[0.04] p-3 text-xs leading-5 text-dark/60">{t("emailUnavailable")}</p>}<div className="grid gap-3 sm:grid-cols-[0.7fr_1.3fr]"><label className="space-y-2 text-xs font-bold"><span>{t("time")}</span><select className={control} value={time} disabled={busy} onChange={e => setTime(e.target.value)}>{Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i/4)).padStart(2,"0")}:${String(i%4*15).padStart(2,"0")}`).map(value => <option key={value}>{value}</option>)}</select></label><label className="min-w-0 space-y-2 text-xs font-bold"><span>{t("timeZone")}</span><select className={control} value={timeZone} disabled={busy} onChange={e => setTimeZone(e.target.value)}>{timeZones.map(value => <option key={value}>{value}</option>)}</select></label></div><p className="text-xs leading-5 text-dark/50">{t("timing")}</p><button type="submit" className={button} disabled={busy || enabled && !data.emailAvailable}>{busy ? t("working") : t("save")}</button></form>{data.reminder?.nextSendAt && <p className="mt-4 text-xs text-dark/60">{t("nextSend", { date: new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: data.reminder.timeZone }).format(new Date(data.reminder.nextSendAt)) })}</p>}{data.delivery && <div className="mt-4 border-t border-dark/10 pt-4 text-xs leading-5"><p>{t("lastSend")}: {t(`delivery.${data.delivery.status}`)}</p>{data.delivery.lastError && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-red-700">{data.delivery.lastError}</p>}<p className="text-dark/50">{t("acceptedDetail")}</p></div>}</section>
        <section className="rounded-2xl border border-dark/10 bg-white p-6"><h2 className="text-lg font-extrabold">{t("rulesTitle")}</h2><dl className="mt-4 divide-y divide-dark/10">{(["visit", "action", "quiz", "profile"] as const).map((kind,i) => <div key={kind} className="flex justify-between gap-4 py-3 text-sm"><dt><p className="font-semibold">{t(`rule.${kind}`)}</p><p className="mt-1 text-xs leading-5 text-dark/50">{t(`rule.${kind}Detail`)}</p></dt><dd className="shrink-0 font-bold">+{[5,30,50,50][i]}</dd></div>)}</dl><p className="mt-4 text-xs leading-6 text-dark/55">{t("rulesFootnote")}</p></section>
      </div>
      <section className="mt-6 rounded-2xl border border-dark/10 bg-white p-6"><h2 className="text-lg font-extrabold">{t("history")}</h2>{!data.entries.length ? <p className="mt-4 text-sm text-dark/55">{t("historyEmpty")}</p> : <ul className="mt-3 divide-y divide-dark/10">{[...data.entries,...more].filter((entry,index,list)=>list.findIndex(e=>e.id===entry.id)===index).map(entry => <li key={entry.id} className="flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-semibold">{t(`entry.${entry.kind}`)}</p><time dateTime={entry.createdAt} className="mt-1 block text-xs text-dark/50">{new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(entry.createdAt))}</time></div><span className="text-sm font-bold tabular-nums">{entry.points > 0 ? "+" : ""}{entry.points}</span></li>)}</ul>}{(cursor === undefined ? data.nextCursor : cursor) && <button className={button+" mt-3"} disabled={busy} type="button" onClick={() => void loadMore()}>{t("loadMore")}</button>}</section>
    </>}
    <dialog ref={dialog} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-dark/10 bg-white p-6 text-dark backdrop:bg-black/40" aria-labelledby="redeem-heading" onCancel={event => { if (busy) event.preventDefault(); }}><h2 id="redeem-heading" className="text-xl font-extrabold">{t("confirmTitle")}</h2><p className="mt-3 text-sm leading-6 text-dark/60">{t("confirmDetail")}</p><div className="mt-6 flex gap-3"><button type="button" className="min-h-11 flex-1 rounded-xl border border-dark/20 text-sm font-bold disabled:opacity-40" disabled={busy} onClick={() => dialog.current?.close()}>{t("cancel")}</button><button type="button" className={button+" flex-1"} disabled={busy} onClick={() => void redeem()}>{busy ? t("working") : t("confirm")}</button></div></dialog>
  </div>;
}
