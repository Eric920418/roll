"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { memberFetch } from "@/lib/member-fetch";
import type { tourState } from "@/lib/network/viewer-privacy";
import { REWARD_RULES } from "@/lib/rewards/policy";
type State = ReturnType<typeof tourState>;
const selectors = ["goal", "record", "insights", "followup"];
const button = "min-h-11 rounded-xl border border-dark/20 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
export default function NextStepsTour({ mission, target, reward = false }: { mission: string; target?: number | null; reward?: boolean }) {
  const zh = useLocale() === "zh-tw", dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), title = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<State | null>(null), [step, setStep] = useState(0), [opened, setOpened] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false), [rect, setRect] = useState<DOMRect | null>(null);
  const stateRef = useRef<State | null>(null), loaded = useRef(false), pending = useRef({ key: "", id: "" });
  const load = useCallback(async () => { try { const next = await memberFetch<State>("/api/account/next-steps-tour"); stateRef.current = next; setState(next); setError(""); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const open = useCallback((at = 0) => { if (!dialog.current?.open) { setStep(at); setOpened(true); dialog.current?.showModal(); } }, []);
  useEffect(() => {
    if (!state || state.finished || loaded.current) return;
    const check = () => { if (document.querySelector("dialog[open]") || loaded.current) return; loaded.current = true; open(state.step); };
    const timer = setTimeout(check, 500); document.addEventListener("close", check, true);
    return () => { clearTimeout(timer); document.removeEventListener("close", check, true); };
  }, [state, open]);
  useEffect(() => {
    if (!opened) return;
    const target = document.querySelector<HTMLElement>(`[data-next-step="${selectors[step]}"]`);
    target?.scrollIntoView({ block: "center", behavior: "instant" });
    const update = () => setRect(target?.getBoundingClientRect() || null);
    const timer = setTimeout(() => { update(); title.current?.focus(); }, 0);
    window.addEventListener("resize", update); window.addEventListener("scroll", update, true);
    return () => { clearTimeout(timer); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [opened, step]);
  async function persist(nextStep: number, finished: boolean) {
    const current = stateRef.current; if (!current || busy) return;
    const payload = { version: 1, step: nextStep, finished, revision: current.revision }, key = JSON.stringify(payload);
    if (pending.current.key !== key) pending.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const next = await memberFetch<State>("/api/account/next-steps-tour", { method: "PATCH", body: JSON.stringify({ ...payload, requestId: pending.current.id }) });
      stateRef.current = next; setState(next); pending.current.key = "";
      if (finished) { dialog.current?.close(); setOpened(false); } else setStep(nextStep);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const titles = zh ? ["先看目前目標", "完成一個有效行動", "查看進度與 Insights", "先跟進，再找新公司"] : ["Start with your current goal", "Record one meaningful action", "Review progress and Insights", "Follow up, then find new companies"];
  const descriptions = zh ? ["目前最優先的任務會展開。完成後，依既有規則突出下一項。", "訪談與行動證據直接記錄在任務中。同公司多次訪談只計一間。", "有效紀錄推進進度；按完成並通過驗證後，才發分及解鎖下一步。", "已訪談／已聯絡公司在前，新推薦公司在後。名單由你確認後產生，服務未啟用時不會自動搜尋。"] : ["Your current priority is expanded. The next eligible task is highlighted after completion.", "Save interview and action evidence inside the task. Repeat interviews at one company count once.", "Saved evidence moves progress. Points and unlocks require explicit completion and server verification.", "Follow up interviewed or contacted companies first. New recommendations are separate and require your confirmation. Search stays off while unavailable."];
  return <div className="my-4"><button ref={trigger} className="min-h-11 text-sm font-semibold underline" disabled={!state || busy} onClick={() => open(0)}>{zh ? "操作導覽" : "Take a tour"}</button>{error && !opened && <p role="alert" className="whitespace-pre-wrap text-sm text-red-800">{error}<button className={`${button} ml-2`} onClick={() => void load()}>{zh ? "重新載入導覽設定" : "Reload tour settings"}</button></p>}
    {/* Inherit NOVA variables: nova-theme itself adds an opaque background over the spotlight. */}
    <dialog ref={dialog} aria-labelledby="next-steps-tour-title" onCancel={e => { e.preventDefault(); void persist(step, true); }} onClose={() => { setOpened(false); requestAnimationFrame(() => trigger.current?.focus()); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-dark backdrop:bg-transparent">
      <div aria-hidden="true" className="pointer-events-none fixed rounded-2xl border-2 border-white transition-none" style={rect ? { top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10, boxShadow: "0 0 0 9999px rgb(0 0 0 / .45)" } : { inset: 0, background: "rgb(0 0 0 / .45)" }} />
      <section className="fixed inset-x-3 bottom-3 max-h-[65dvh] overflow-y-auto rounded-2xl border border-dark/20 bg-white p-5 shadow-xl sm:inset-x-auto sm:right-7 sm:w-[420px] sm:p-7"><p className="text-xs font-semibold uppercase tracking-widest">NOVA · {step + 1} / 4</p><h2 ref={title} tabIndex={-1} id="next-steps-tour-title" className="mt-3 text-2xl font-bold">{titles[step]}</h2><p className="mt-3 text-sm leading-6">{descriptions[step]}</p>{step === 0 && <div className="mt-4 rounded-xl bg-neutral-50 p-4"><p className="font-semibold">{mission}</p>{target != null && target > 0 && <p className="mt-2 text-sm">{zh ? "目前任務目標" : "Current task target"}: {target}</p>}{reward && <p className="mt-2 text-sm">{zh ? `首次完成任務可得 ${REWARD_RULES.action} 積分，每日最多 ${REWARD_RULES.dailyActions} 項。` : `First completion: ${REWARD_RULES.action} points, up to ${REWARD_RULES.dailyActions} tasks per day.`}</p>}</div>}{error && <p role="alert" className="mt-3 whitespace-pre-wrap text-sm text-red-800">{error}<button className={`${button} mt-2`} onClick={() => void load()}>{zh ? "重載設定，保留任務" : "Reload tour settings"}</button></p>}<div className="mt-5 flex flex-wrap items-center justify-between gap-3"><button className={button} disabled={busy} onClick={() => void persist(step, true)}>{zh ? "略過導覽" : "Skip tour"}</button><div className="flex gap-2">{step > 0 && <button className={button} disabled={busy} onClick={() => void persist(step - 1, false)}>{zh ? "上一步" : "Back"}</button>}<button className={`${button} bg-black! text-white!`} disabled={busy} onClick={() => void persist(Math.min(step + 1, 3), step === 3)}>{step === 3 ? (zh ? "開始行動" : "Get started") : (zh ? "下一步" : "Next")}</button></div></div></section>
    </dialog>
  </div>;
}
