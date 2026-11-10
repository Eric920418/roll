"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { nextGuidedQuestion, type GuidedProgress, type GuidedQuestionValue } from "@/lib/guided-questions";

type Question = GuidedQuestionValue & { label: string; input: ReactNode; optional?: boolean };
const button = "min-h-11 rounded-lg border border-dark/20 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function GuidedQuestions({ questions, initialProgress, onProgress, onConfirm, confirmLabel, reviewTitle, disabled = false, confirmDisabled = false, children, flat = false }: {
  flat?: boolean; questions: Question[]; initialProgress?: GuidedProgress; onProgress: (progress: GuidedProgress) => void;
  onConfirm: () => void; confirmLabel: string; reviewTitle?: string; disabled?: boolean; confirmDisabled?: boolean; children?: ReactNode;
}) {
  const zh = useLocale() === "zh-tw", titleId = useId(), content = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<GuidedProgress>(() => initialProgress && (initialProgress.questionId === null || questions.some(q => q.id === initialProgress.questionId))
    ? initialProgress : { questionId: nextGuidedQuestion(questions), skipped: [] });
  const [guided, setGuided] = useState(!flat);
  const question = questions.find(q => q.id === progress.questionId);
  useEffect(() => { content.current?.focus(); }, [progress.questionId]);
  function move(next: GuidedProgress) { setProgress(next); onProgress(next); }
  function advance() {
    if (!question) return;
    const skipped = [...new Set([...progress.skipped, question.id])];
    // A skipped answer stays in the draft; skipping never erases existing input.
    move({ questionId: nextGuidedQuestion(questions, skipped), skipped });
  }
  if (!guided) return <form data-conversation-form onSubmit={event=>{event.preventDefault();if(!disabled && !confirmDisabled) onConfirm();}} className="min-w-0 space-y-3"><fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2">{questions.filter(q=>!q.optional).map(q=><div key={q.id} className={['notes','answer-0','answer-1','answer-2','answer-3','price'].includes(q.id)?'min-w-0 sm:col-span-2':'min-w-0'}><label className="mb-1 block text-sm">{q.label}</label>{q.input}</div>)}</fieldset>{questions.some(q=>q.optional) && <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">{zh?'補充對話資訊（選填）':'Additional conversation details (optional)'}</summary><fieldset disabled={disabled} className="space-y-4">{questions.filter(q=>q.optional).map(q=><div key={q.id}><p className="mb-1 text-sm">{q.label}</p>{q.input}</div>)}</fieldset></details>}<fieldset disabled={disabled}>{children}</fieldset><div className="flex flex-wrap gap-3"><button type="submit" className={button+' bg-black! text-white!'} disabled={disabled||confirmDisabled}>{confirmLabel}</button><details><summary className="min-h-11 cursor-pointer py-3 text-xs">{zh?'逐題輔助':'Guided help'}</summary><button type="button" className={button} onClick={()=>setGuided(true)}>{zh?'使用逐題引導':'Use guided questions'}</button></details></div></form>;
  return <form onSubmit={event => { event.preventDefault(); if (!disabled) { if (question) advance(); else if (!confirmDisabled) onConfirm(); } }} className="min-w-0 space-y-4">
    <div ref={content} tabIndex={-1} className="rounded-xl border border-dark/15 bg-white p-5 focus-visible:outline-2 focus-visible:outline-offset-2" aria-labelledby={titleId}>
      {question ? <>
        <h3 id={titleId} className="text-lg font-semibold">{question.label}</h3>
        <fieldset disabled={disabled} className="mt-4 min-w-0">{question.input}</fieldset>
      </> : <>
        <h3 id={titleId} className="text-lg font-semibold">{reviewTitle ?? (zh ? "確認內容後再儲存" : "Review before saving")}</h3>
        <dl className="mt-4 divide-y divide-dark/10">{questions.map(q => <div key={q.id} className="flex min-w-0 items-start gap-3 py-3">
          <div className="min-w-0 flex-1"><dt className="text-sm text-dark/60">{q.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{q.value || (zh ? "尚未提供／已跳過" : "Not provided / skipped")}</dd></div>
          <button type="button" disabled={disabled} className={`${button} shrink-0`} aria-label={`${zh ? "修改" : "Edit"}: ${q.label}`} onClick={() => move({ ...progress, questionId: q.id })}>{zh ? "修改" : "Edit"}</button>
        </div>)}</dl>
        <fieldset disabled={disabled} className="mt-4 min-w-0 space-y-4">{children}</fieldset>
      </>}
    </div>
    <div className="flex flex-wrap gap-2">{flat && <button type="button" className={button} onClick={()=>setGuided(false)}>{zh ? "顯示完整表單" : "Show complete form"}</button>}
      {question ? <>
        <button type="submit" className={`${button} bg-black! text-white!`} disabled={disabled || !question.value.trim()}>{zh ? "下一題" : "Continue"}</button>
        <button type="button" className={button} disabled={disabled} onClick={() => advance()}>{zh ? "不知道／跳過" : "Not sure / skip"}</button>
        <button type="button" className={button} disabled={disabled} onClick={() => move({ ...progress, questionId: null })}>{zh ? "查看摘要" : "Review answers"}</button>
      </> : <button type="submit" className={`${button} bg-black! text-white!`} disabled={disabled || confirmDisabled}>{confirmLabel}</button>}
    </div>
  </form>;
}
