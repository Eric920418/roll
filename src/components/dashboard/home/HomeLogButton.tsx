"use client";
import { useLocale } from "next-intl";
export default function HomeLogButton({ taskId }: { taskId: string }) {
  const zh = useLocale() === "zh-tw";
  return <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-dark/20 px-4 py-2 text-sm font-semibold" onClick={() => window.dispatchEvent(new CustomEvent("nova-log-task", { detail: taskId }))}>+ {zh ? "記錄進度" : "Log"}</button>;
}
