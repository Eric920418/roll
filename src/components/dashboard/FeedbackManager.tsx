"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  FEEDBACK_TYPES,
  FEEDBACK_LIMIT_PER_DAY,
  toFeedbackType,
  toFeedbackStatus,
  type FeedbackType,
} from "@/lib/dashboard/feedback";

export type FeedbackRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  pageUrl: string | null;
  status: string;
  adminReply: string | null;
  createdAt: string; // ISO
};

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-2.5 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";
const labelClass =
  "text-xs font-semibold text-dark/70 font-[family-name:var(--font-heading)]";

// 狀態徽章配色。resolved 綠、wontfix 灰（中性收尾，不用紅色 —— 對回報者而言
// 「不處理」不是錯誤，用紅色會讓願意回報的人感覺被責備）。
const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-emerald-100 text-emerald-800",
  wontfix: "bg-dark/10 text-dark/55",
};

const empty = {
  type: "bug" as FeedbackType,
  title: "",
  body: "",
  pageUrl: "",
};

export default function FeedbackManager({ reports }: { reports: FeedbackRow[] }) {
  const t = useTranslations("Dashboard.feedback");
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({ ...empty });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const fmt = new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSent(false);
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, locale }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "送出失敗");
      setForm({ ...empty });
      setSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送出失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form
        onSubmit={submit}
        className="h-fit rounded-2xl border border-dark/10 bg-white p-5"
      >
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {t("formTitle")}
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("type")}</span>
            <select
              className={fieldClass}
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: toFeedbackType(e.target.value) })
              }
            >
              {FEEDBACK_TYPES.map((key) => (
                <option key={key} value={key}>
                  {t(`types.${key}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("reportTitle")}</span>
            <input
              className={fieldClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={t("reportTitlePlaceholder")}
              maxLength={120}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("body")}</span>
            <textarea
              className={`${fieldClass} resize-none`}
              rows={6}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder={t("bodyPlaceholder")}
              maxLength={4000}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("pageUrl")}</span>
            <input
              className={fieldClass}
              value={form.pageUrl}
              onChange={(e) => setForm({ ...form, pageUrl: e.target.value })}
              placeholder={t("pageUrlPlaceholder")}
              maxLength={500}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}
        {sent && !error && (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {t("sent")}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
        >
          {loading ? t("submitting") : t("submit")}
        </button>
        <p className="mt-2 text-center text-[11px] text-dark/40">
          {t("limitHint", { count: FEEDBACK_LIMIT_PER_DAY })}
        </p>
      </form>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
            {t("historyTitle")}
          </p>
          <p className="text-sm text-dark/55">
            {t("count", { count: reports.length })}
          </p>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-dark/15 p-8 text-center text-sm text-dark/55">
            {t("empty")}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {reports.map((r) => {
              const status = toFeedbackStatus(r.status);
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-dark/10 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide font-[family-name:var(--font-heading)] ${STATUS_BADGE[status]}`}
                    >
                      {t(`statuses.${status}`)}
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-dark/40">
                      {t(`types.${toFeedbackType(r.type)}`)}
                    </span>
                    <span className="ml-auto text-xs text-dark/40">
                      {fmt.format(new Date(r.createdAt))}
                    </span>
                  </div>

                  <p className="mt-2 font-semibold text-dark font-[family-name:var(--font-heading)]">
                    {r.title}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-dark/65">
                    {r.body}
                  </p>
                  {r.pageUrl && (
                    <p className="mt-1 text-xs text-dark/40">{r.pageUrl}</p>
                  )}

                  {r.adminReply && (
                    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-primary font-[family-name:var(--font-heading)]">
                        {t("adminReply")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-dark/75">
                        {r.adminReply}
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
