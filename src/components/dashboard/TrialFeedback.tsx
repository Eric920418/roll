"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import type { Locale } from "@/i18n/routing";
import { pathForLocale } from "@/lib/routes";
import { trialDraftSchema, trialAnswersSchema, trialWindow } from "@/lib/dashboard/next-steps";

type Status = { trial: ReturnType<typeof trialWindow>; submitted: boolean };
const empty = { goal: "", motivation: "", firstStep: "", continueUsing: "" as "" | "yes" | "no", reason: "", usage: "", painPoint: "", indispensable: "" };
const button = "min-h-11 rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";

export default function TrialFeedback({ userId }: { userId: string }) {
  const locale = useLocale() as Locale, zh = locale === "zh-tw";
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState(""), [sent, setSent] = useState(false);
  const [answers, setAnswers] = useState({ ...empty }), [step, setStep] = useState(0), [busy, setBusy] = useState(false), [opened, setOpened] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null), loadedKey = useRef(""), autoOpened = useRef("");
  const key = status?.trial ? `nova:trial-feedback:${userId}:${status.trial.startsAt}` : "";
  async function load() {
    try {
      const res = await fetch("/api/feedback", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setStatus(json.data); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  useEffect(() => { const initial = setTimeout(() => void load(), 0), timer = setInterval(() => void load(), 60_000); return () => { clearTimeout(initial); clearInterval(timer); }; }, []);
  function show() { trigger.current = document.activeElement as HTMLElement; setOpened(true); dialog.current?.showModal(); }
  useEffect(() => {
    if (!key || loadedKey.current === key) return;
    const timer = setTimeout(() => {
    loadedKey.current = key; setAnswers({ ...empty }); setStep(0);
    try { const cached = localStorage.getItem(key); if (cached) { const parsed = trialDraftSchema.safeParse(JSON.parse(cached)); if (!parsed.success) throw new Error(zh ? "無法恢復問卷草稿，請重新填寫。" : "Could not restore the survey draft; please enter your answers again."); setAnswers(parsed.data); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    }, 0); return () => clearTimeout(timer);
  }, [key, zh]);
  useEffect(() => {
    if (!key || !status?.trial?.due || status.submitted || autoOpened.current === key) return;
    try { if (sessionStorage.getItem(`${key}:dismissed`)) return; } catch { /* The in-memory guard still prevents repeated popups. */ }
    const timer = setTimeout(() => { autoOpened.current = key; show(); }, 0); return () => clearTimeout(timer);
  }, [key, status]);
  function change(name: keyof typeof empty, value: string) {
    const next = { ...answers, [name]: value }; setAnswers(next);
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
      setStatus(previous => previous && ({ ...previous, submitted: true })); setSent(true); dialog.current?.close();
      try { localStorage.removeItem(key); } catch { /* The server submission is authoritative. */ }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  const questions = zh ? ["你的目標是什麼？為什麼要做？", "你會怎麼開始？", "你想繼續用 NOVA AI 嗎？", "你現在最大的痛點是什麼？", "什麼會讓 NOVA AI 變成你非用不可的東西？"] : ["What is your goal, and why pursue it?", "How will you start?", "Would you like to keep using NOVA AI?", "What is your biggest pain point right now?", "What would make NOVA AI indispensable to you?"];
  function field(name: keyof typeof empty, label: string) { return <label key={name} className="block text-sm font-medium" htmlFor={`trial-${name}`}>{label}<textarea id={`trial-${name}`} value={answers[name]} onChange={e => change(name, e.target.value)} disabled={busy} maxLength={2000} rows={4} className="mt-2 min-h-11 w-full rounded-xl border border-dark/20 p-3 font-normal focus-visible:outline-2" /></label>; }
  return <>
    {status?.trial?.active && <section role="status" className="mb-5 rounded-2xl bg-black p-5 text-white"><p className="text-xs uppercase tracking-widest">Free trial</p><p className="mt-2 text-2xl font-bold">{zh ? `試用還剩 ${status.trial.daysRemaining} 天` : `${status.trial.daysRemaining} days left in your trial`}</p><p className="mt-2 text-sm text-white/75">{zh ? "截止時間" : "Ends"}: {new Intl.DateTimeFormat(zh ? "zh-TW" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(status.trial.endsAt))} (Asia/Taipei)</p></section>}
    <div className="mb-5 flex flex-wrap items-center gap-3 text-sm"><Link href={pathForLocale("/dashboard/feedback", locale)} className={`${button} inline-flex items-center`}>{zh ? "回報問題或建議" : "Feedback"}</Link>{status?.trial?.due && !status.submitted && <button type="button" className={button} onClick={show}>{zh ? "填寫試用 Feedback（5 題）" : "Trial feedback (5 questions)"}</button>}{(sent || status?.submitted) && <p role="status">{zh ? "感謝！試用 Feedback 已儲存。" : "Thank you! Your trial feedback is saved."}</p>}</div>
    {error && !opened && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap">{error}</p><button type="button" className={`${button} mt-2`} onClick={() => void load()}>{zh ? "重試" : "Retry"}</button></div>}
    <dialog ref={dialog} aria-labelledby="trial-feedback-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => { setOpened(false); try { sessionStorage.setItem(`${key}:dismissed`, "true"); } catch { /* In-memory guard remains active. */ } trigger.current?.focus(); }} className="nova-theme fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border-0 bg-white p-5 text-dark shadow-xl backdrop:bg-black/40 sm:p-7">
      <div className="flex items-center justify-between gap-3"><h2 id="trial-feedback-title" className="text-xl font-bold">{zh ? "試用 Feedback" : "Trial feedback"}</h2><button type="button" disabled={busy} className={button} onClick={() => dialog.current?.close()}>{zh ? "稍後填寫" : "Later"}</button></div>
      <p className="mt-3 text-sm" aria-live="polite">{zh ? `第 ${step + 1} 題，共 5 題` : `Question ${step + 1} of 5`}</p><progress aria-label={zh ? "問卷進度" : "Survey progress"} max={5} value={step + 1} className="mt-2 h-2 w-full accent-black" />
      <form onSubmit={submit} className="mt-5 space-y-5"><h3 className="text-lg font-semibold">{questions[step]}</h3>
        {step === 0 && <>{field("goal", zh ? "你的目標" : "Your goal")}{field("motivation", zh ? "為什麼要做" : "Why it matters")}</>}
        {step === 1 && field("firstStep", zh ? "第一步會怎麼做" : "Your first step")}
        {step === 2 && <><fieldset disabled={busy}><legend className="text-sm">{zh ? "是否繼續使用" : "Keep using NOVA"}</legend><div className="mt-2 flex gap-5">{(["yes", "no"] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-2"><input type="radio" name="continueUsing" value={value} checked={answers.continueUsing === value} onChange={() => change("continueUsing", value)} />{value === "yes" ? "Yes" : "No"}</label>)}</div></fieldset>{answers.continueUsing && field("reason", answers.continueUsing === "yes" ? (zh ? "為什麼需要 NOVA AI" : "Why you need NOVA AI") : (zh ? "為什麼不需要 NOVA AI" : "Why you do not need NOVA AI"))}{answers.continueUsing === "yes" && field("usage", zh ? "你會怎麼使用" : "How you will use it")}</>}
        {step === 3 && field("painPoint", zh ? "最大的痛點" : "Biggest pain point")}
        {step === 4 && field("indispensable", zh ? "讓 NOVA AI 非用不可的條件" : "What would make it indispensable")}
        {error && <p role="alert" className="whitespace-pre-wrap rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-between gap-3"><button type="button" disabled={busy || step === 0} className={button} onClick={() => { setStep(step - 1); setError(""); }}>{zh ? "上一頁" : "Previous"}</button><button type="submit" disabled={busy} className={`${button} bg-black text-white`}>{busy ? (zh ? "送出中…" : "Submitting…") : step === 4 ? "Submit" : (zh ? "下一頁" : "Next")}</button></div>
      </form>
    </dialog>
  </>;
}
