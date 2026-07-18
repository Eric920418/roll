"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useTranslations, useLocale } from "next-intl";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";

type Msg = { role: "user" | "assistant"; content: string };

// 右欄「ROLL ON 助理」：真 AI 對話（串流）+ 快捷連結。取代靜態 CopilotShortcuts。
// canUse=false（未達 Pro）→ 顯示 upsell 卡，不渲染輸入框（避免送出後才吃 403）。
export default function CopilotPanel({
  quizDone,
  canUse,
}: {
  quizDone: boolean;
  canUse: boolean;
}) {
  const t = useTranslations("Dashboard.home.copilot");
  const locale = useLocale() as Locale;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const shortcuts = [
    { label: t("quiz"), href: pathForLocale(quizDone ? "/quiz/result" : "/quiz", locale) },
    { label: t("companies"), href: pathForLocale("/dashboard/companies", locale) },
    { label: t("tools"), href: pathForLocale("/dashboard/tools", locale) },
    { label: t("profile"), href: pathForLocale("/dashboard/profile", locale) },
  ];

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setInput("");
    setError("");
    setStreaming(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, locale }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || t("error"));
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
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/15 bg-primary/[0.03] p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-white">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" fill="currentColor" />
          </svg>
        </span>
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {t("title")}
        </p>
      </div>

      {/* 快捷連結 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {shortcuts.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-full border border-primary/15 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 font-[family-name:var(--font-heading)]"
          >
            {s.label}
          </Link>
        ))}
      </div>

      {canUse ? (
        <>
          {/* 對話 */}
          <div
            ref={scrollRef}
            className="mt-3 max-h-64 overflow-y-auto rounded-xl bg-white/70 p-3"
          >
            {messages.length === 0 ? (
              <p className="py-4 text-center text-xs text-dark/50">{t("emptyHint")}</p>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <p
                      key={i}
                      className="ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-white"
                    >
                      {m.content}
                    </p>
                  ) : (
                    <div
                      key={i}
                      className="prose-copilot max-w-[92%] rounded-xl rounded-bl-sm bg-dark/[0.04] px-3 py-2 text-sm text-dark/85"
                    >
                      {m.content ? (
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      ) : (
                        <span className="text-dark/40">{t("thinking")}</span>
                      )}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="mt-2 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}

          {/* 輸入 */}
          <form onSubmit={send} className="mt-2 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("placeholder")}
              disabled={streaming}
              className="min-w-0 flex-1 rounded-xl border border-dark/10 bg-white px-3 py-2 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:opacity-60 font-[family-name:var(--font-body)]"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50 font-[family-name:var(--font-heading)]"
            >
              {streaming ? t("thinking") : t("send")}
            </button>
          </form>
        </>
      ) : (
        /* 未達 Pro：upsell 卡（不渲染輸入框，避免送出後才吃 403） */
        <div className="mt-3 rounded-xl bg-white/70 p-4 text-center">
          <p className="text-sm font-semibold text-dark font-[family-name:var(--font-heading)]">
            {t("upsell.title")}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-dark/60">
            {t("upsell.body")}
          </p>
          <Link
            href={pathForLocale("/dashboard/billing", locale)}
            className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 font-[family-name:var(--font-heading)]"
          >
            {t("upsell.cta")}
          </Link>
        </div>
      )}
    </div>
  );
}
