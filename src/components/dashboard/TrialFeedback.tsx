"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import { trialDraftSchema, trialAnswersSchema, trialWindow } from "@/lib/dashboard/next-steps";

type Status = { trial: ReturnType<typeof trialWindow>; submitted: boolean };
const empty = { goal: "", motivation: "", firstStep: "", continueUsing: "" as "" | "yes" | "no", reason: "", usage: "", painPoint: "", indispensable: "", yesReason: "", noReason: "" };
const button = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/30 px-5 py-2.5 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2";
const bar = "h-3 w-full overflow-hidden rounded-full bg-dark/10 [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black";

export default function TrialFeedback({ userId }: { userId: string }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw", pathname = usePathname();
  const inNextSteps = pathname === pathForLocale("/dashboard/agenda", locale);
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState("");
  const [answers, setAnswers] = useState({ ...empty }), [step, setStep] = useState(0), [busy, setBusy] = useState(false), [opened, setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), loadedKey = useRef(""), autoOpened = useRef("");
  const key = status?.trial ? `nova:trial-feedback:${userId}:${status.trial.startsAt}` : "";
  async function load() {
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" }), json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setStatus(json.data); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  function show() { setOpened(true); if (!dialog.current?.open) dialog.current?.showModal(); }
  useEffect(() => {
    const initial = setTimeout(() => { if (dialog.current?.open) setOpened(true); void load(); }, 0), timer = setInterval(() => void load(), 60_000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!key || loadedKey.current === key) return;
    const timer = setTimeout(() => {
      loadedKey.current = key; setAnswers({ ...empty }); setStep(0);
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const parsed = trialDraftSchema.safeParse(JSON.parse(cached));
          if (!parsed.success) throw new Error(zh ? "無法恢復問卷草稿，請重新填寫。" : "Could not restore the survey draft; please enter your answers again.");
          setAnswers({ ...empty, ...parsed.data, yesReason: parsed.data.yesReason ?? (parsed.data.continueUsing === "yes" ? parsed.data.reason : ""), noReason: parsed.data.noReason ?? (parsed.data.continueUsing === "no" ? parsed.data.reason : "") });
        }
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }, 0); return () => clearTimeout(timer);
  }, [key, zh]);
  useEffect(() => {
    if (!key || !status?.trial?.due || status.submitted || autoOpened.current === key) return;
    try { if (sessionStorage.getItem(`${key}:dismissed`)) return; } catch { /* In-memory guard prevents repeated popups. */ }
    const timer = setTimeout(() => { autoOpened.current = key; show(); }, 0); return () => clearTimeout(timer);
  }, [key, status]);
  function change(name: keyof typeof empty, value: string) {
    const next = { ...answers, [name]: value };
    if (name === "continueUsing") next.reason = value === "yes" ? next.yesReason : next.noReason;
    if ((name === "yesReason" && next.continueUsing === "yes") || (name === "noReason" && next.continueUsing === "no")) next.reason = value;
    setAnswers(next); setError("");
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { setError(zh ? "無法暫存回答，請在離開前送出。" : "Unable to keep a local draft; submit before leaving."); }
  }
  function validStep() {
    const fields = [["goal", "motivation"], ["firstStep"], ["continueUsing", "reason", ...(answers.continueUsing === "yes" ? ["usage"] : [])], ["painPoint"], ["indispensable"]] as Array<Array<keyof typeof empty>>;
    if (fields[step].every(field => answers[field].trim())) { setError(""); return true; }
    setError(zh ? "請完整回答本題後繼續；已輸入內容會保留。" : "Complete this question to continue. Your answers are kept."); return false;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !validStep()) return;
    if (step < 4) { setStep(step + 1); return; }
    const parsed = trialAnswersSchema.safeParse(answers);
    if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join("\n")); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "trialSurvey", startsAt: status?.trial?.startsAt, locale, answers: parsed.data }) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setStatus(previous => previous && ({ ...previous, submitted: true }));
      try { localStorage.removeItem(key); } catch { /* Server submission is authoritative. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const questions = zh ? ["你的目標是什麼？為什麼要做？", "你會怎麼開始？", "你想繼續用 NOVA AI 嗎？", "你現在最大的痛點是什麼？", "什麼會讓 NOVA AI 變成你非用不可的東西？"] : ["What is your goal, and why do you want to do it?", "How will you start?", "Do you want to keep going with Nova AI?", "What is your biggest pain point right now?", "What would make Nova AI indispensable to you?"];
  function field(name: keyof typeof empty, label: string) { return <label key={name} className="block text-sm font-medium text-dark/70" htmlFor={`trial-${name}`}>{label}<textarea id={`trial-${name}`} value={answers[name]} onChange={e => change(name, e.target.value)} disabled={busy} maxLength={2000} rows={3} className="mt-2 min-h-11 w-full rounded-xl border border-dark/20 bg-white p-3 font-normal text-dark focus-visible:outline-2 disabled:opacity-50" /></label>; }
  const trial = status?.trial;
  return <>
    {inNextSteps && trial?.available && <section aria-label={zh ? "免費試用" : "Free trial"} className="mb-6 rounded-2xl border-2 border-black bg-white p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-dark/65">Free trial</p>
      <h2 className="mt-3 text-2xl font-bold sm:text-3xl">{trial.active ? (zh ? `免費試用還剩 ${trial.daysRemaining} 天` : `${trial.daysRemaining} days left in your free trial`) : (zh ? "你的免費試用已結束" : "Your free trial is over")}</h2>
      <progress aria-label={zh ? "試用時間進度" : "Trial time elapsed"} max={100} value={trial.elapsedPercent} className={`${bar} mt-5`} />
      <p className="mt-2 text-sm text-dark/65">{zh ? `第 ${trial.day} 天，共 ${trial.totalDays} 天` : `Day ${trial.day} of ${trial.totalDays}`}</p>
      <p className="mt-4 text-base text-dark/75">{status?.submitted ? (zh ? "感謝！回饋已保存，你可以查看下一步的方案選擇。" : "Thank you! Your feedback is saved. Explore your plan options for the next step.") : (zh ? "花約 2 分鐘告訴我們 NOVA 對你的幫助，完成回饋後選擇接下來的方案。" : "Tell us how Nova is working for you (about 2 minutes). Finish the feedback, then choose your next plan.")}</p>
      {status?.submitted ? <Link href={pathForLocale("/dashboard/account#plan", locale)} className={`${button} mt-5 bg-black text-white`}>{zh ? "查看方案" : "View plans"}</Link> : <button type="button" className={`${button} mt-5 bg-black text-white`} onClick={show}>{zh ? "填寫回饋" : "Give feedback"}</button>}
    </section>}
    {error && !opened && inNextSteps && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={`${button} mt-2`} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
    <dialog id="trial-feedback-dialog" ref={dialog} onToggle={() => setOpened(Boolean(dialog.current?.open))} aria-labelledby="trial-feedback-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setOpened(false); try { if (key) sessionStorage.setItem(`${key}:dismissed`, "true"); } catch { /* In-memory guard remains active. */ } }} className="nova-theme fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto rounded-2xl border-0 bg-white p-5 text-dark shadow-xl backdrop:bg-black/45 sm:rounded-3xl sm:p-10">
      <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold tracking-[0.2em]">NOVA</p><button type="button" disabled={busy} aria-label={zh ? "關閉回饋問卷" : "Close feedback survey"} className={button} onClick={() => dialog.current?.close()}>×</button></div>
      <h2 id="trial-feedback-title" className="mt-4 text-2xl font-bold sm:text-3xl">{zh ? "快速回饋（約 2 分鐘）" : "Quick feedback (2 minutes)"}</h2>
      {!status ? <p role="status" className="mt-5">{zh ? "載入問卷…" : "Loading survey…"}</p> : status.submitted ? <div className="mt-6 space-y-5"><p role="status">{zh ? "感謝！你的五題回饋已儲存。" : "Thank you! Your five answers are saved."}</p><Link href={pathForLocale("/dashboard/account#plan", locale)} className={`${button} bg-black text-white`} onClick={() => dialog.current?.close()}>{zh ? "選擇下一步方案" : "Choose my next plan"}</Link></div> : !trial?.available ? <div className="mt-5 space-y-4"><p>{trial ? (zh ? "試用尚未開始，開始後即可填寫回饋。" : "Your trial has not started. Feedback will be available when it begins.") : (zh ? "這是試用會員的五題回饋問卷，目前帳號沒有試用紀錄。" : "This is a five-question trial survey. There is no trial on this account.")}</p><Link className={button} href={pathForLocale("/dashboard/feedback", locale)} onClick={() => dialog.current?.close()}>{zh ? "回報問題或建議" : "Report an issue or suggestion"}</Link></div> : <>
        <p className="mt-3 text-base text-dark/65">{trial.active ? (zh ? "告訴我們試用的感受，讓我們了解你的下一步。" : "Tell us how your trial is going and what you need next.") : (zh ? "免費試用已結束。回答幾個問題，再選擇接下來的方案。" : "Your free trial is over. Answer a few questions, then choose your next plan.")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-4"><p className="text-sm font-semibold" aria-live="polite">{zh ? `第 ${step + 1} 題，共 5 題` : `Question ${step + 1} of 5`}</p><progress aria-label={zh ? "問卷進度" : "Survey progress"} max={5} value={step + 1} className={`${bar} min-w-24 flex-1`} /></div>
        <form onSubmit={submit} className="mt-6 space-y-5"><h3 className="text-xl font-semibold">{questions[step]}</h3>
          {step === 0 && <div className="grid gap-5 sm:grid-cols-2">{field("goal", zh ? "你的目標" : "Your goal")}{field("motivation", zh ? "為什麼要做" : "Why do you want to do it?")}</div>}
          {step === 1 && field("firstStep", zh ? "第一步會怎麼做" : "How will you start?")}
          {step === 2 && <><div role="group" aria-label={zh ? "是否繼續使用 NOVA" : "Keep going with Nova AI"} className="flex gap-3">{(["yes", "no"] as const).map(value => <button key={value} type="button" aria-pressed={answers.continueUsing === value} disabled={busy} onClick={() => change("continueUsing", value)} className={`${button} min-w-20 ${answers.continueUsing === value ? "border-black bg-black text-white" : "bg-white"}`}>{value === "yes" ? "Yes" : "No"}</button>)}</div><div className="grid gap-5 sm:grid-cols-2"><fieldset disabled={busy || answers.continueUsing !== "yes"} className={`min-w-0 space-y-4 rounded-2xl border border-dark/20 p-4 sm:p-5 ${answers.continueUsing !== "yes" ? "opacity-45" : ""}`}><p className="text-sm font-semibold uppercase text-dark/65">{zh ? "選擇 Yes" : "If yes"}</p>{field("yesReason", zh ? "為什麼需要？" : "Why do you need it?")}{field("usage", zh ? "你會怎麼使用？" : "How will you use it?")}</fieldset><fieldset disabled={busy || answers.continueUsing !== "no"} className={`min-w-0 space-y-4 rounded-2xl border border-dark/20 p-4 sm:p-5 ${answers.continueUsing !== "no" ? "opacity-45" : ""}`}><p className="text-sm font-semibold uppercase text-dark/65">{zh ? "選擇 No" : "If no"}</p>{field("noReason", zh ? "為什麼不需要？" : "Why don't you need it?")}</fieldset></div></>}
          {step === 3 && field("painPoint", zh ? "最大的痛點" : "Biggest pain point")}
          {step === 4 && field("indispensable", zh ? "讓 NOVA AI 非用不可的條件" : "What would make it indispensable?")}
          {error && <p role="alert" className="whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <div className="sticky bottom-0 z-10 flex flex-wrap justify-between gap-3 border-t border-dark/10 bg-white py-3"><button type="button" disabled={busy || step === 0} className={button} onClick={() => { setStep(step - 1); setError(""); }}>{zh ? "上一頁" : "Back"}</button><button type="submit" disabled={busy} className={`${button} bg-black text-white`}>{busy ? (zh ? "送出中…" : "Submitting…") : step === 4 ? "Submit" : (zh ? "下一頁" : "Next")}</button></div>
        </form>
      </>}
      {error && (!status || !trial?.available || status.submitted) && <div role="alert" className="mt-5 space-y-3 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={button} onClick={() => void load()}>{zh ? "重試載入" : "Retry loading"}</button></div>}
    </dialog>
  </>;
}
