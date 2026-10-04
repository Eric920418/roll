"use client";
import { useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
export default function TaskDependencyEditor({ action, revision, busy, onSave }: { action: ActionPlanActionDto; revision?: number; busy?: boolean; onSave: (thresholds: Record<string, number | null>, revision?: number) => Promise<boolean | void> }) {
  const zh = useLocale() === "zh-tw", [values, setValues] = useState<Record<string, string>>({}), captured = useRef<number | undefined>(undefined), [error, setError] = useState("");
  return <details className="mt-4"><summary className="min-h-11 cursor-pointer text-sm font-semibold">{zh ? "設定解鎖條件" : "Configure unlock conditions"}</summary><form className="space-y-3" onSubmit={async event => { event.preventDefault(); setError(""); try { const thresholds = Object.fromEntries(action.dependency.actionRefs.filter(e => e.id).map(e => { const v = values[e.id!] ?? String(e.minimumCurrent ?? ""); return [e.id!, v ? Number(v) : null]; })); const saved = await onSave(thresholds, captured.current ?? revision); if (saved !== false) { captured.current = undefined; setValues({}); } } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>
    <p className="text-xs text-dark/60">{zh ? "留白：前置任務必須勾選完成。填數字：前置任務累計達到門檻即可。請先在前置任務設定數量目標與單位。" : "Blank requires completion. A number unlocks at that cumulative amount. Set the prerequisite’s target and unit first."}</p>
    {action.dependency.actionRefs.filter(e => e.id).map(e => <label key={e.id} className="block text-sm">#{e.displayNumber} · {e.title}<input type="number" disabled={busy} min="1" max="1000000000" step="1" placeholder={zh ? "完成後解鎖" : "Unlock when completed"} value={values[e.id!] ?? String(e.minimumCurrent ?? "")} className="mt-1 min-h-11 w-full rounded-lg border border-dark/20 bg-white px-3" onChange={event => { captured.current ??= revision; setValues({ ...values, [e.id!]: event.target.value }); }} /></label>)}
    <button disabled={busy} className="min-h-11 rounded-lg border px-4 text-sm">{zh ? "儲存解鎖條件" : "Save unlock conditions"}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form></details>;
}
