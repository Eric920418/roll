"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import NovaLogo from "@/components/brand/NovaLogo";
import { memberFetch } from "@/lib/member-fetch";
import { INDUSTRY_LABELS, industryLabel } from "@/lib/member-options";
import { pathForLocale } from "@/lib/routes";
import {
  buildWorksheetCard, copy, worksheetAnswersSchema, worksheetAnswerValid, worksheetCardDraftSchema, worksheetCardSchema,
  worksheetKeys, worksheetNextAction, worksheetOptions, worksheetQuestions,
  type SavedWorksheet, type WorksheetAnswers, type WorksheetCard, type WorksheetEntry,
} from "@/lib/icp/worksheet";

const field = "w-full rounded-xl border border-dark/20 bg-white px-4 py-3 text-base leading-6";
const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-dark/20 px-5 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-45";
const primary = button + " border-black bg-black text-white";
const reviewIndex = worksheetKeys.length;

export default function CustomerWorksheet({ userId, locale, completed, initial }: {
  userId: string; locale: "en" | "zh-tw"; completed: boolean; initial: SavedWorksheet | null;
}) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const [saved, setSaved] = useState(initial);
  const [answers, setAnswers] = useState<WorksheetAnswers>(initial?.answers ?? {});
  const [card, setCard] = useState<WorksheetCard | null>(initial?.card ?? null);
  const [step, setStep] = useState(initial ? reviewIndex : 0);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const headline = useRef<HTMLHeadingElement>(null);
  const savingRef = useRef(false);
  const storageKey = "nova:customer-worksheet:" + userId;
  const key = worksheetKeys[step];
  const entry = key ? answers[key] ?? { choices: [], detail: "" } : null;
  const question = key ? worksheetQuestions[key] : null;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = JSON.parse(sessionStorage.getItem(storageKey) || "null");
        const parsed = worksheetAnswersSchema.safeParse(raw?.answers);
        if (parsed.success && raw.revision === (initial?.revision ?? 0)) {
          const firstInvalid = worksheetKeys.findIndex(k => !worksheetAnswerValid(k, parsed.data));
          const restoreStep = Number.isInteger(raw.step) && raw.step >= 0 ? Math.min(raw.step, firstInvalid < 0 ? reviewIndex : firstInvalid) : 0;
          setAnswers(parsed.data);
          setCard(worksheetCardDraftSchema.safeParse(raw.card).data ?? (restoreStep === reviewIndex ? buildWorksheetCard(parsed.data, locale) : null));
          setStep(restoreStep);
          setDirty(true);
        }
      } catch { setStorageError(true); }
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [initial?.revision, locale, storageKey]);

  function cache(nextAnswers: WorksheetAnswers, nextCard: WorksheetCard | null, nextStep: number) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ answers: nextAnswers, card: nextCard, step: nextStep, revision: saved?.revision ?? 0 }));
    } catch { setStorageError(true); }
  }

  function go(next: number, nextCard = card) {
    setStep(next);
    setCard(nextCard);
    setError("");
    if (dirty || !saved) cache(answers, nextCard, next);
    requestAnimationFrame(() => headline.current?.focus());
  }

  function changeAnswer(next: WorksheetEntry) {
    const updated = { ...answers, [key]: next };
    if (key === "type" && next.choices[0] !== answers.type?.choices[0]) delete updated.customer;
    setAnswers(updated);
    setCard(null);
    setDirty(true);
    cache(updated, null, step);
  }

  async function save() {
    if (savingRef.current || !card || !worksheetKeys.every(k => worksheetAnswerValid(k, answers))) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const fresh = await memberFetch<SavedWorksheet>("/api/auth/onboarding", {
        method: "PATCH",
        body: JSON.stringify({ step: "worksheet", data: { answers, card, locale, revision: saved?.revision ?? 0 } }),
      });
      setSaved(fresh);
      setAnswers(fresh.answers);
      setCard(fresh.card);
      setDirty(false);
      requestAnimationFrame(() => headline.current?.focus());
      try { sessionStorage.removeItem(storageKey); } catch { setStorageError(true); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { savingRef.current = false; setSaving(false); }
  }

  return <main className="nova-theme min-h-screen bg-[#f7f7f7] px-4 py-8 text-dark sm:px-8 sm:py-14" data-brand="nova">
    <div className="mx-auto max-w-2xl space-y-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <NovaLogo variant="black" className="h-auto w-28" sizes="112px" />
        {completed && <Link href={pathForLocale("/dashboard", locale)} className={button}>{w("返回後台", "Back to dashboard")}</Link>}
      </header>

      {question && entry ? <section className="space-y-5" aria-label={w("客戶假設 worksheet", "Customer hypothesis worksheet")}>
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{w("建立你的客戶假設", "Build your customer hypothesis")}</h1>
          <div className="flex items-center gap-4 text-sm font-semibold">
            <span>{w(`第 ${step + 1}／7 題`, `Question ${step + 1} of 7`)}</span>
            <progress aria-label={w("表單進度", "Worksheet progress")} value={step + 1} max={reviewIndex} className="h-1.5 min-w-0 flex-1 accent-black" />
          </div>
        </div>
        <form className="space-y-6 rounded-2xl border border-dark/10 bg-white p-5 sm:p-8" onSubmit={event => {
          event.preventDefault();
          if (!worksheetAnswerValid(key, answers)) return;
          go(step + 1, step + 1 === reviewIndex ? card ?? buildWorksheetCard(answers, locale) : card);
        }}>
          <div>
            <p className="text-sm font-semibold text-dark/55">{copy(question.label, locale)}</p>
            <h2 ref={headline} tabIndex={-1} id="worksheet-question" className="mt-2 text-2xl font-bold leading-tight focus:outline-none sm:text-3xl">{copy(question.title, locale)}</h2>
            {question.hint && <p className="mt-3 text-sm text-dark/70">{copy(question.hint, locale)}</p>}
          </div>
          <div role="group" aria-labelledby="worksheet-question" className="flex flex-wrap gap-2">
            {worksheetOptions(key, answers).map(([id, label]) => {
              const selected = entry.choices.includes(id);
              const current = entry.choices.filter(choice => choice !== "unknown");
              const limited = key === "customer" && current.length === 2 && !selected && id !== "unknown";
              return <button key={id} type="button" aria-pressed={selected} className={selected ? primary : button} disabled={!loaded || limited}
                onClick={() => {
                  const choices = key !== "customer" || id === "unknown" ? [id] : selected ? current.filter(choice => choice !== id) : [...current, id];
                  const detail = choices.includes("other") || key === "customer" || key === "problem" || key === "cost" ? entry.detail : "";
                  changeAnswer({ ...entry, choices, detail });
                }}>{copy(label, locale)}</button>;
            })}
          </div>
          {key === "customer" && answers.type?.choices[0] === "b2b" && <label className="block space-y-2 text-sm font-semibold">
            <span>{w("客戶的產業（選填）", "Customer industry (optional)")}</span>
            <select className={field} value={entry.industry || ""} disabled={!loaded} onChange={event => changeAnswer({ ...entry, industry: event.target.value })}>
              <option value="">{w("選擇產業", "Select an industry")}</option>
              {Object.keys(INDUSTRY_LABELS).map(industry => <option value={industry} key={industry}>{industryLabel(industry, locale)}</option>)}
            </select>
          </label>}
          {(entry.choices.includes("other") || ["customer", "problem", "cost"].includes(key)) && <label className="block space-y-2 text-sm font-semibold">
            <span>{entry.choices.includes("other") ? w("你的答案（必填）", "Your answer (required)") : w("補充一個具體例子（選填）", "Add a specific example (optional)")}</span>
            <textarea className={field} rows={2} maxLength={350} value={entry.detail} disabled={!loaded} onChange={event => changeAnswer({ ...entry, detail: event.target.value })} />
          </label>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {step > 0 ? <button type="button" className={button} onClick={() => go(step - 1)}>{w("上一題", "Back")}</button> : <span />}
            <button type="submit" className={primary} disabled={!loaded || !worksheetAnswerValid(key, answers)}>{step + 1 === reviewIndex ? w("查看我的 ICP 假設", "Review my ICP hypothesis") : w("下一題", "Next")}</button>
          </div>
        </form>
      </section> : card && <section className="space-y-5" aria-label={w("ICP 假設卡", "ICP hypothesis card")}>
        <div>
          <h1 ref={headline} tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none sm:text-3xl">{w("你的 ICP 假設卡", "Your ICP hypothesis card")}</h1>
          <p className="mt-2 text-sm text-dark/65">{w("這是訪談前的起點。你可以用自己的話改寫。", "Use this as a starting point for customer conversations. Edit it in your own words.")}</p>
        </div>
        <form className="space-y-5 rounded-2xl border border-dark/10 bg-white p-5 sm:p-8" onSubmit={event => { event.preventDefault(); void save(); }}>
          {([["who", "我先找誰聊", "Who I’ll speak to first"], ["hypothesis", "我想驗證的客戶假設", "The customer hypothesis I’ll test"], ["question", "第一場最想確認什麼", "What I’ll ask first"]] as const).map(([id, a, b]) => <label key={id} className="block space-y-2 text-sm font-semibold">
            <span>{w(a, b)}</span>
            <textarea className={field} rows={id === "hypothesis" ? 3 : 2} maxLength={id === "hypothesis" ? 1600 : 800} disabled={!loaded || saving} value={card[id]} onChange={event => {
              const next = { ...card, [id]: event.target.value };
              setCard(next); setDirty(true); cache(answers, next, step);
            }} />
          </label>)}
          <div className="rounded-xl bg-dark/[0.04] p-4"><h2 className="text-sm font-semibold">{w("建議的下一步", "Suggested next step")}</h2><p className="mt-1 text-sm">{worksheetNextAction(answers, locale)}</p></div>
          {error && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-red-800">{error}</p>}
          {saved && !dirty && <p role="status" className="text-sm font-semibold">{w("已儲存假設卡", "Hypothesis card saved")}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={button} disabled={!loaded || saving} onClick={() => go(0)}>{w("返回修改答案", "Edit my answers")}</button>
            {(!saved || dirty) ? <button type="submit" className={primary} disabled={!loaded || saving || !worksheetCardSchema.safeParse(card).success}>{saving ? w("儲存中…", "Saving…") : w("儲存 ICP 假設", "Save ICP hypothesis")}</button>
              : <Link href={pathForLocale("/dashboard/agenda", locale)} className={primary}>{w("開始你的創業旅程", "Start your founder journey")}</Link>}
          </div>
        </form>
      </section>}
      {storageError && <p role="status" className="text-sm text-dark/70">{w("瀏覽器無法暫存表單。離開前請先儲存。", "This browser could not cache the form. Save before leaving.")}</p>}
    </div>
  </main>;
}
