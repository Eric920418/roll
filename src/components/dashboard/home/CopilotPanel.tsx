"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useTranslations, useLocale } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import ActionPlanBuilder from "@/components/dashboard/ActionPlanBuilder";

import { useRewards } from "../rewards/RewardsProvider";

type Msg = { role: "user" | "assistant"; content: string };

// 右欄「ROLL ON 助理」：真 AI 對話（串流）+ 快捷連結。取代靜態 CopilotShortcuts。
// 對話可使用獎勵額度；付費建檔與對話資格各自檢查。
export default function CopilotPanel({
  canUse: paidAccess,
  canBuildPlan = paidAccess,
}: {
  canUse: boolean;
  canBuildPlan?: boolean;
}) {
  const rewards = useRewards();
  const canUse = paidAccess || (rewards.data?.rewardRemaining ?? 0) > 0;
  const t = useTranslations("Dashboard.home.copilot");
  const rewardText = useTranslations("Rewards");
  const locale = useLocale() as Locale;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (opened && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal(); }, [opened]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canUse) return;
    const controller = new AbortController();
    fetch("/api/copilot", { signal: controller.signal })
      .then(async (response) => {
        const raw = await response.text();
        let json;
        try { json = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status}: ${raw || response.statusText}`); }
        if (!response.ok) throw new Error(json.error || `HTTP ${response.status}: ${raw}`);
        return json.data as { question: string; answer: string | null }[];
      })
      .then((turns) => setMessages(turns.flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        ...(turn.answer ? [{ role: "assistant" as const, content: turn.answer }] : []),
      ])))
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [canUse]);

  useEffect(() => {
    if (!loadingHistory) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [loadingHistory]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming || loadingHistory) return;
    setOpened(true);
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setInput("");
    setError("");
    setStreaming(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, locale }),
      });
      if (!res.ok || !res.body) {
        const raw = await res.text();
        let json;
        try { json = JSON.parse(raw); } catch { throw new Error(`HTTP ${res.status}: ${raw || res.statusText}`); }
        throw new Error(json.error || `HTTP ${res.status}: ${raw}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    } catch (err) {
      setInput(text);
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setStreaming(false);
      await rewards.refresh();
    }
  }

  const inputForm = <form onSubmit={send} className="mt-3 flex gap-2">
    <input aria-label={t("placeholder")} value={input} onChange={e => setInput(e.target.value)} placeholder={t("placeholder")} disabled={streaming || loadingHistory} className="min-h-11 min-w-0 flex-1 rounded-full border border-dark/20 bg-white px-4 py-2 text-sm text-dark outline-none focus:ring-2 focus:ring-dark/30 disabled:opacity-60" />
    <button type="submit" disabled={streaming || loadingHistory || !input.trim()} className="min-h-11 shrink-0 rounded-full bg-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{streaming ? t("thinking") : t("send")}</button>
  </form>;
  return <section className="nova-dashboard-card flex h-full min-w-0 flex-col rounded-2xl border border-dark/10 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-dark">{t("polarisTitle")}</h2>{canUse && <button className="min-h-11 text-xs text-dark/60 underline" onClick={() => setOpened(true)}>{t("viewConversation")}</button>}</div>
    {rewards.loading && !paidAccess ? <p role="status" className="text-xs text-dark/55">{rewardText("loading")}</p> : canUse ? <>
      {inputForm}
      {canBuildPlan ? <div className="mt-3 flex flex-wrap items-center gap-2"><ActionPlanBuilder messages={messages} /><Link href={pathForLocale("/dashboard/agenda#goal-roadmap", locale)} className="inline-flex min-h-11 items-center rounded-full border border-dark/10 px-4 text-xs font-semibold">{t("tools")}</Link></div> : <p className="mt-3 text-xs text-dark/55">{t("rewardAccess", { count: rewards.data?.rewardRemaining ?? 0 })}</p>}
    </> : <div className="mt-3 text-sm"><p className="font-semibold">{t("upsell.title")}</p><p className="mt-1 text-xs text-dark/60">{t("upsell.body")}</p><div className="mt-3 flex flex-wrap gap-2"><Link href={pathForLocale("/dashboard/rewards", locale)} className="inline-flex min-h-11 items-center rounded-full border border-dark/15 px-4 text-xs font-semibold">{t("rewardCta")}</Link><Link href={pathForLocale("/dashboard/account#plan", locale)} className="inline-flex min-h-11 items-center rounded-full bg-dark px-4 text-xs font-semibold text-white">{t("upsell.cta")}</Link></div></div>}
    {error && <p role="alert" className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    <dialog ref={dialogRef} onClose={() => setOpened(false)} aria-labelledby="polaris-dialog-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 text-dark shadow-xl backdrop:bg-black/60">
      <div className="flex items-center justify-between gap-3"><h3 id="polaris-dialog-title" className="text-lg font-bold">{t("polarisTitle")}</h3><button autoFocus aria-label={t("closeConversation")} className="min-h-11 min-w-11 rounded-full hover:bg-dark/5" onClick={() => dialogRef.current?.close()}>×</button></div>
      <div ref={scrollRef} className="mt-4 max-h-[55dvh] overflow-y-auto rounded-xl bg-dark/[0.025] p-3">
        {loadingHistory ? <p role="status" className="py-4 text-center text-sm text-dark/50">{t("loadingHistory")}</p> : !messages.length ? <p className="py-4 text-center text-sm text-dark/50">{t("emptyHint")}</p> : <div className="flex flex-col gap-3">{messages.map((message, i) => message.role === "user" ? <p key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl bg-dark px-3 py-2 text-sm text-white">{message.content}</p> : <div key={i} className="prose-copilot max-w-[92%] break-words [overflow-wrap:anywhere] rounded-2xl bg-dark/5 px-3 py-2 text-sm">{message.content ? <ReactMarkdown>{message.content}</ReactMarkdown> : <span className="text-dark/40">{t("thinking")}</span>}</div>)}</div>}
      </div>
      {error && <p role="alert" className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {canUse ? inputForm : <Link href={pathForLocale("/dashboard/rewards", locale)} className="inline-flex min-h-11 items-center text-sm underline">{t("rewardCta")}</Link>}
    </dialog>
  </section>;
}
