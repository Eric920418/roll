"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { nextGuidedQuestion, type GuidedProgress, type GuidedQuestionValue } from "@/lib/guided-questions";

type Question = GuidedQuestionValue & { label: string; input: ReactNode };
const button = "min-h-11 rounded-lg border border-dark/20 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function GuidedQuestions({ questions, initialProgress, onProgress, onConfirm, confirmLabel, disabled = false, confirmDisabled = false, children }: {
  questions: Question[]; initialProgress?: GuidedProgress; onProgress: (progress: GuidedProgress) => void;
  onConfirm: () => void; confirmLabel: string; disabled?: boolean; confirmDisabled?: boolean; children?: ReactNode;
}) {
  const zh = useLocale() === "zh-tw", titleId = useId(), content = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState<GuidedProgress>(() => initialProgress && (initialProgress.questionId === null || questions.some(q => q.id === initialProgress.questionId))
    ? initialProgress : { questionId: nextGuidedQuestion(questions), skipped: [] });
  const question = questions.find(q => q.id === progress.questionId);
  useEffect(() => { content.current?.focus(); }, [progress.questionId]);
  function move(next: GuidedProgress) { setProgress(next); onProgress(next); }
  function advance() {
    if (!question) return;
    const skipped = [...new Set([...progress.skipped, question.id])];
    // A skipped answer stays in the draft; skipping never erases existing input.
    move({ questionId: nextGuidedQuestion(questions, skipped), skipped });
  }
  return <form onSubmit={event => { event.preventDefault(); if (!disabled) { if (question) advance(); else if (!confirmDisabled) onConfirm(); } }} className="min-w-0 space-y-4">
    <div ref={content} tabIndex={-1} className="rounded-xl border border-dark/15 bg-white p-5 focus-visible:outline-2 focus-visible:outline-offset-2" aria-labelledby={titleId}>
      {question ? <>
        <h3 id={titleId} className="text-lg font-semibold">{question.label}</h3>
        <fieldset disabled={disabled} className="mt-4 min-w-0">{question.input}</fieldset>
      </> : <>
        <h3 id={titleId} className="text-lg font-semibold">{zh ? "確認內容後再儲存" : "Review before saving"}</h3>
        <dl className="mt-4 divide-y divide-dark/10">{questions.map(q => <div key={q.id} className="flex min-w-0 items-start gap-3 py-3">
          <div className="min-w-0 flex-1"><dt className="text-sm text-dark/60">{q.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{q.value || (zh ? "尚未提供／已跳過" : "Not provided / skipped")}</dd></div>
          <button type="button" disabled={disabled} className={`${button} shrink-0`} aria-label={`${zh ? "修改" : "Edit"}: ${q.label}`} onClick={() => move({ ...progress, questionId: q.id })}>{zh ? "修改" : "Edit"}</button>
        </div>)}</dl>
        <fieldset disabled={disabled} className="mt-4 min-w-0 space-y-4">{children}</fieldset>
      </>}
    </div>
    <div className="flex flex-wrap gap-2">
      {question ? <>
        <button type="submit" className={`${button} bg-black! text-white!`} disabled={disabled || !question.value.trim()}>{zh ? "下一題" : "Continue"}</button>
        <button type="button" className={button} disabled={disabled} onClick={() => advance()}>{zh ? "不知道／跳過" : "Not sure / skip"}</button>
        <button type="button" className={button} disabled={disabled} onClick={() => move({ ...progress, questionId: null })}>{zh ? "查看摘要" : "Review answers"}</button>
      </> : <button type="submit" className={`${button} bg-black! text-white!`} disabled={disabled || confirmDisabled}>{confirmLabel}</button>}
    </div>
  </form>;
}
