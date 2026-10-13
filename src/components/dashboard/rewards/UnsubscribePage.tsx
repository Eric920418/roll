"use client";
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { rewardRequest } from "./RewardsProvider";
export default function UnsubscribePage({ token, taskAlerts = false }: { token: string; taskAlerts?: boolean }) {
  const zh = useLocale() === "zh-tw";
  const t = useTranslations("Rewards"), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  async function unsubscribe() {
    setBusy(true); setError("");
    try { await rewardRequest(`/api/${taskAlerts ? "week-plan/alerts" : "rewards"}/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" }); setDone(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <main className="nova-theme flex min-h-screen items-center justify-center p-5"><section className="w-full max-w-md rounded-2xl border border-dark/10 bg-white p-8"><p className="text-sm font-extrabold tracking-[0.2em]">NOVA</p><h1 className="mt-6 text-2xl font-extrabold">{taskAlerts ? done ? (zh ? "任務提醒已關閉" : "Task alerts turned off") : (zh ? "關閉任務 Email 提醒" : "Turn off task email alerts") : done ? t("unsubscribed") : t("unsubscribeTitle")}</h1><p className="mt-3 text-sm leading-6 text-dark/60">{taskAlerts ? done ? (zh ? "目前已設定的任務提醒已取消；日後可在新任務中自行開啟。每日回訪提醒不受影響。" : "Current task alerts are cancelled. You can opt in for a new task later. Daily return reminders are unchanged.") : (zh ? "請確認是否關閉目前所有任務 Email 提醒。開啟本頁不會修改設定。" : "Confirm to turn off all current task alerts. Opening this page does not change settings.") : done ? t("unsubscribeDoneDetail") : t("unsubscribeDetail")}</p>{error && <p role="alert" className="mt-4 whitespace-pre-wrap break-words text-sm text-red-700">{error}</p>}{!done && <button type="button" disabled={busy || !token} onClick={() => void unsubscribe()} className="mt-6 min-h-11 w-full rounded-xl bg-dark px-4 py-3 text-sm font-bold text-white disabled:opacity-40">{busy ? t("working") : t("unsubscribe")}</button>}</section></main>;
}
