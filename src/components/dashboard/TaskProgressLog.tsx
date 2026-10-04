"use client";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";

type Metric = { metricTarget: number | null; metricUnit: string | null; metricCurrent: number | null; revision?: number };
export default function TaskProgressLog({ action, revision, busy, onSave }: { action: ActionPlanActionDto; revision?: number; busy?: boolean; onSave: (metric: Metric) => Promise<boolean | void> }) {
  const zh = useLocale() === "zh-tw", dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), sending = useRef(false);
  const [form, setForm] = useState({ target: "", unit: "", current: "", revision }), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const field = "mt-1 min-h-11 w-full rounded-lg border border-dark/20 bg-white p-3 text-dark";
  const button = "min-h-11 rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold disabled:opacity-50";
  function open() { setForm({ target: String(action.metric?.target ?? ""), unit: action.metric?.unit || "", current: String(action.metric?.current ?? ""), revision }); setError(""); dialog.current?.showModal(); }
  useEffect(() => {
    const show = (event: Event) => { if ((event as CustomEvent<string>).detail === action.id) trigger.current?.click(); };
    window.addEventListener("nova-log-task", show); return () => window.removeEventListener("nova-log-task", show);
  }, [action.id]);
  return <><button ref={trigger} type="button" onClick={open} disabled={busy} className={`${button} mt-3`}>+ {zh ? "記錄進度" : "Log progress"}</button>
    <dialog ref={dialog} aria-labelledby={`log-title-${action.id}`} onClose={() => trigger.current?.focus()} onCancel={event => { if (saving) event.preventDefault(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-dark/15 bg-white p-6 text-dark shadow-xl backdrop:bg-black/30">
      <h3 id={`log-title-${action.id}`} className="text-xl font-bold">{zh ? "記錄累計進度" : "Log cumulative progress"}</h3><p className="mt-2 text-sm">#{action.displayNumber} · {action.title}</p>
      <form className="mt-4 space-y-4" onSubmit={async event => { event.preventDefault(); if (sending.current) return; sending.current = true; setSaving(true); setError(""); try { const result = await onSave({ metricTarget: form.target ? Number(form.target) : null, metricUnit: form.unit.trim() || null, metricCurrent: form.current ? Number(form.current) : null, revision: form.revision }); if (result === false) setError(zh ? "未儲存成功，請查看錯誤訊息。輸入已保留；版本衝突時請先重新載入。" : "Not saved. Your input is retained. Check the error below; reload after a version conflict."); else dialog.current?.close(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { sending.current = false; setSaving(false); } }}>
        <label className="block text-sm">{zh ? "數量目標（選填）" : "Target (optional)"}<input autoFocus type="number" min="1" max="1000000000" step="1" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} className={field} /></label>
        <label className="block text-sm">{zh ? "單位" : "Unit"}<input maxLength={80} value={form.unit} placeholder={zh ? "例如：次訪談" : "e.g. interviews"} onChange={e => setForm({ ...form, unit: e.target.value })} className={field} /></label>
        <label className="block text-sm">{zh ? "截至目前的累計值（未知請留白）" : "Total so far (leave blank if unknown)"}<input type="number" min="0" max="1000000000" step="1" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} className={field} /></label>
        <p className="text-sm text-dark/60">{zh ? "填累計總數，不是本次新增數量。數量門檻達標可解鎖相應任務，但不會自動勾選完成。" : "Enter the cumulative total, not an increment. Configured quantity thresholds can unlock dependent tasks, but never mark this task done."}</p>
        {error && <p role="alert" className="whitespace-pre-wrap text-sm text-red-700">{error}</p>}
        <div className="flex gap-3"><button disabled={saving || busy} className={`${button} bg-black text-white`}>{saving ? (zh ? "儲存中…" : "Saving…") : (zh ? "儲存進度" : "Save progress")}</button><button type="button" disabled={saving} className={button} onClick={() => dialog.current?.close()}>{zh ? "取消" : "Cancel"}</button></div>
      </form>
    </dialog></>;
}
