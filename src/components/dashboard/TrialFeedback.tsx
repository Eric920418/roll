"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import { memberFetch } from "@/lib/member-fetch";
import { simpleTrialAnswersSchema, type SimpleTrialAnswers } from "@/lib/dashboard/next-steps";
import type { trialFeedbackStatus } from "@/lib/dashboard/trial-feedback";
import { notifyPlanChanged } from "./PlanRefresh";
import { track, analyticsError } from "@/lib/analytics";

type Status = Awaited<ReturnType<typeof trialFeedbackStatus>>;
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/25 px-5 py-3 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function TrialFeedback({ userId, discovery = false }: { userId: string; discovery?: boolean; paidDiscovery?: boolean }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", pathname = usePathname(), router = useRouter();
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<SimpleTrialAnswers>({ liked: "yes", reason: null }), [choice, setChoice] = useState(false);
  const [draft, setDraft] = useState<string | null>(null), [share, setShare] = useState(false), [notice, setNotice] = useState(""), [opened, setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), sending = useRef(false), auto = useRef(""), focus = useRef<HTMLHeadingElement>(null);
  const inNextSteps = pathname === pathForLocale("/dashboard/agenda", locale);
  const key = status?.trial ? `nova:trial-feedback:v3:${userId}:${status.trial.startsAt}` : "";
  const load = useCallback(async () => { try { setStatus(await memberFetch<Status>("/api/feedback")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  useEffect(() => {
    if (!key) return;
    void Promise.resolve().then(() => { try { const stored = JSON.parse(localStorage.getItem(key) || "null"); const parsed = simpleTrialAnswersSchema.safeParse(stored); if (parsed.success) { setAnswers(parsed.data); setChoice(true); } }
    catch { setError(zh ? "無法恢復暫存回答，請重新點選。" : "Unable to restore your draft; select your answer again."); } });
  }, [key, zh]);
  useEffect(() => {
    if (!inNextSteps || status?.paid || !status?.trial?.due || status.submitted || auto.current === key) return;
    auto.current = key;
    try { if (sessionStorage.getItem(`${key}:dismissed`)) return; } catch { /* In-memory guard remains active. */ }
    if (!dialog.current?.open) dialog.current?.showModal();
  }, [inNextSteps, status, key]);
  useEffect(() => { if (dialog.current?.open) focus.current?.focus(); }, [step]);
  function change(next: SimpleTrialAnswers) { setAnswers(next); setChoice(true); setError(""); try { localStorage.setItem(key, JSON.stringify(next)); } catch { setError(zh ? "無法暫存，離開前請送出。" : "Unable to keep a draft; submit before leaving."); } }
  async function submit(claim = false) {
    if (!status?.trial || sending.current) return;
    const parsed = simpleTrialAnswersSchema.safeParse(answers);
    if (!claim && (!choice || !parsed.success)) { setError(zh ? "請點選答案與原因。" : "Select your answer and reason."); return; }
    sending.current = true; setBusy(true); setError("");
    const feature = claim ? "trial_incentive" : "feedback";
    track("flow_start", { feature });
    try {
      const fresh = await memberFetch<Status>("/api/feedback", { method: "POST", body: JSON.stringify(claim ? { action: "claimTrialIncentive", startsAt: status.trial.startsAt, locale } : { action: "trialSurvey", version: 3, startsAt: status.trial.startsAt, locale, answers: parsed.data }) });
      setStatus(fresh); track("flow_success", { feature });
      try { localStorage.removeItem(key); } catch { /* Server result is authoritative. */ }
      notifyPlanChanged(); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); track("flow_error", { feature, outcome: analyticsError(typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 0) }); }
    finally { sending.current = false; setBusy(false); }
  }
  const trial = status?.trial;
  function show() { dialog.current?.showModal(); focus.current?.focus(); track("flow_start", { feature: "feedback" }); }
  const defaultDraft = zh ? "我正在試用 @Nova AI。\n\n[請填入自己的使用心得]\n\nhttps://www.rollgrp.com/product" : "I've been trying @Nova AI.\n\n[Add your own experience here]\n\nhttps://www.rollgrp.com/product";
  const incentive = zh ? "完成回饋，延長原試用 3 天（每帳號一次）" : "Complete feedback for 3 extra days of your original trial (once per account)";
  return <>
    {inNextSteps && !status?.paid && trial?.available && <section className={`mb-5 rounded-2xl border ${discovery ? "border-dark/15 p-5" : "border-2 border-black p-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest">Free trial</p><h2 className="mt-2 text-xl font-bold">{trial.active ? (zh ? `試用還剩 ${trial.daysRemaining} 天` : `${trial.daysRemaining} days left in your trial`) : (zh ? "試用已結束" : "Your trial has ended")}</h2></div><button className={`${button} bg-black text-white`} onClick={show}>{status?.submitted ? (status.eligible ? (zh ? "領取 3 天原試用延長" : "Claim 3 extra trial days") : (zh ? "查看回饋" : "View feedback")) : (zh ? "給予回饋" : "Give feedback")}</button></div>
      {!status?.submitted && status?.eligible && <p className="mt-3 text-sm">{incentive}</p>}
      {discovery && status?.eligible && <p className="mt-2 text-sm">{zh ? "三家訪談上限維持不變。" : "The three-company interview limit stays the same."}</p>}
    </section>}
    {error && inNextSteps && !opened && <div role="alert" className="mb-4 whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-red-800">{error}<button className={`${button} ml-3`} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
    <dialog onToggle={e => setOpened(e.currentTarget.open)} id="trial-feedback-dialog" ref={dialog} aria-labelledby="trial-feedback-title" onCancel={e => { if (busy) e.preventDefault(); }} onClose={() => { try { sessionStorage.setItem(`${key}:dismissed`, "true"); } catch { /* In-memory guard remains active. */ } }} className="nova-theme fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-3xl border-0 bg-white p-6 text-dark shadow-xl backdrop:bg-black/40 sm:p-9">
      <header className="flex items-center justify-between gap-4"><p className="font-semibold tracking-[0.2em]">NOVA</p><button disabled={busy} className={button} aria-label={zh ? "關閉回饋" : "Close feedback"} onClick={() => dialog.current?.close()}>×</button></header>
      <h2 id="trial-feedback-title" ref={focus} tabIndex={-1} className="mt-6 text-2xl font-bold outline-none">{status?.submitted ? (zh ? "感謝你的回饋" : "Thank you for your feedback") : (zh ? "你喜歡這個產品嗎？" : "Did you like the product?")}</h2>
      {!status ? <button className={`${button} mt-5`} onClick={() => void load()}>{zh ? "載入／重試" : "Load / retry"}</button> : status.submitted ? <div className="mt-5 space-y-4">
        {status.grantedEndsAt && <p role="status">{zh ? "已領取一次 3 天延長，有效至 " : "Your one-time 3-day extension was granted, until "}{new Date(status.grantedEndsAt).toLocaleString(locale, { timeZone: "Asia/Taipei" })}{zh ? "（台北時間）" : " (Taipei time)"}</p>}
        {status.eligible && <><p>{incentive}</p><button disabled={busy} className={`${button} bg-black text-white`} onClick={() => void submit(true)}>{zh ? "領取 3 天原試用延長" : "Claim 3 extra trial days"}</button></>}
        {!status.granted && !status.eligible && <p>{zh ? "回饋已保存；目前帳號不適用原試用延長。" : "Feedback saved. This account is not eligible for a trial extension."}</p>}
        {answers.liked === "yes" && choice && <details onToggle={e => setShare(e.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-3 font-semibold">{zh ? "願意分享到 LinkedIn 嗎？（選填）" : "Share on LinkedIn? (Optional)"}</summary>{share && <div className="space-y-3"><label className="block text-sm">{zh ? "用自己的話補上心得；不會自動發布。" : "Add your experience in your own words. Nothing is posted automatically."}<textarea rows={6} maxLength={3000} className="mt-2 w-full rounded-xl border p-3" value={draft ?? defaultDraft} onChange={e => setDraft(e.target.value)} /></label><button className={button} disabled={!(draft ?? defaultDraft).trim()} onClick={async () => { try { await navigator.clipboard.writeText(draft ?? defaultDraft); setNotice(zh ? "已複製；發布前請換掉待填文字，並在 LinkedIn 選取正確的官方頁面完成標記。" : "Copied. Replace the placeholder and select the correct company page on LinkedIn to create a mention before publishing."); } catch { setError(zh ? "無法複製，請手動選取草稿。" : "Unable to copy; select the draft manually."); } }}>{zh ? "複製草稿" : "Copy draft"}</button><a href="https://www.linkedin.com/feed/" target="_blank" rel="noopener noreferrer" className={`${button} ml-2`}>LinkedIn ↗</a></div>}</details>}
      </div> : !trial?.available ? <p className="mt-5">{zh ? "目前沒有可填寫問卷的試用紀錄。" : "There is no eligible trial for this survey."}</p> : <form className="mt-6 space-y-5" onSubmit={e => { e.preventDefault(); if (!choice) { setError(zh ? "請先選擇 Yes 或 No。" : "Choose Yes or No first."); return; } if (answers.liked === "no" && step === 0) { setStep(1); return; } void submit(); }}>
        {status.eligible && <div className="space-y-2 text-sm"><p>{incentive}</p><p>{zh ? "原試用方案、AI 用量及訪談上限不變。" : "Your original plan, AI allowance and interview limit stay the same."}</p></div>}
        {step === 0 ? <div role="group" aria-label="Did you like the product?" className="flex gap-3">{(["yes", "no"] as const).map(v => <button type="button" disabled={busy} aria-pressed={choice && answers.liked === v} className={`${button} min-w-24 ${choice && answers.liked === v ? "bg-black text-white" : "bg-white"}`} key={v} onClick={() => change({ liked: v, reason: null })}>{v === "yes" ? "Yes" : "No"}</button>)}</div> : <><p className="font-semibold">{zh ? "為什麼？" : "Why?"}</p><div className="grid gap-3">{(["needs", "complexity", "price"] as const).map(v => <button type="button" disabled={busy} aria-pressed={answers.reason === v} className={`${button} justify-start ${answers.reason === v ? "bg-black text-white" : "bg-white"}`} key={v} onClick={() => change({ ...answers, reason: v })}>{(zh ? { needs: "不符合我的需求", complexity: "太複雜", price: "太貴" } : { needs: "Doesn’t fit my needs", complexity: "Too complicated", price: "Too expensive" })[v]}</button>)}</div></>}
        <div className="flex justify-between gap-3">{step > 0 ? <button type="button" disabled={busy} className={button} onClick={() => setStep(0)}>{zh ? "返回" : "Back"}</button> : <span />}<button type="submit" disabled={busy || !choice || step === 1 && !answers.reason} className={`${button} bg-black text-white`}>{busy ? (zh ? "送出中…" : "Submitting…") : answers.liked === "no" && step === 0 ? (zh ? "下一步" : "Next") : (zh ? "送出" : "Submit")}</button></div>
      </form>}
      {error && <p role="alert" className="mt-4 whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="mt-4 text-sm">{notice}</p>}
    </dialog>
  </>;
}
