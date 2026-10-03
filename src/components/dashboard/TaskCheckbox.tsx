"use client";
import { useId } from "react";

/** Native checkbox semantics with a visible dependency lock. */
export default function TaskCheckbox({ checked, locked = false, disabled = false, label, reason, onChange }: { checked: boolean; locked?: boolean; disabled?: boolean; label: string; reason?: string; onChange: () => void }) {
  const descriptionId = useId();
  return <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
    <input type="checkbox" checked={checked} disabled={disabled || locked} onChange={onChange} aria-label={label} aria-describedby={locked && reason ? descriptionId : undefined} title={locked ? reason : undefined}
      className={`h-11 w-11 appearance-none rounded-xl border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${locked ? "border-slate-300 bg-slate-200" : "cursor-pointer border-slate-400 bg-white checked:border-black checked:bg-black disabled:opacity-50 hover:enabled:border-black"}`} />
    {locked ? <svg data-task-lock="true" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute h-5 w-5 text-slate-600"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></svg>
      : checked ? <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute h-5 w-5 text-white"><path d="m5 12 4 4L19 6" /></svg> : null}
    {locked && reason && <span id={descriptionId} className="sr-only">{reason}</span>}
  </span>;
}
