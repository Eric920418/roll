"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export type NoteRow = {
  id: string;
  title: string;
  body: string | null;
  meetingAt: string | null; // ISO 字串或 null
};

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-2.5 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";
const labelClass =
  "text-xs font-semibold text-dark/70 font-[family-name:var(--font-heading)]";

const empty = { title: "", body: "", meetingAt: "" };

// datetime-local 需 "YYYY-MM-DDTHH:mm"；把 ISO 轉為本地無時區字串
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NotesManager({ notes }: { notes: NoteRow[] }) {
  const t = useTranslations("Dashboard.notes");
  const tA = useTranslations("Dashboard.actions");
  const locale = useLocale();
  const router = useRouter();

  const [form, setForm] = useState({ ...empty });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fmt = new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function reset() {
    setForm({ ...empty });
    setEditingId(null);
    setError("");
  }

  function startEdit(n: NoteRow) {
    setEditingId(n.id);
    setForm({
      title: n.title,
      body: n.body ?? "",
      meetingAt: toLocalInput(n.meetingAt),
    });
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = editingId ? `/api/notes/${editingId}` : "/api/notes";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(tA("deleteConfirm"))) return;
    setError("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "delete failed");
      if (editingId === id) reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-7 grid gap-6 lg:grid-cols-[20rem_1fr]">
      <form
        onSubmit={submit}
        className="h-fit rounded-2xl border border-dark/10 bg-white p-5"
      >
        <p className="text-sm font-bold text-dark font-[family-name:var(--font-heading)]">
          {editingId ? tA("edit") : t("add")}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("noteTitle")}</span>
            <input
              className={fieldClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("meetingAt")}</span>
            <input
              type="datetime-local"
              className={fieldClass}
              value={form.meetingAt}
              onChange={(e) => setForm({ ...form, meetingAt: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>{t("body")}</span>
            <textarea
              className={`${fieldClass} resize-none`}
              rows={4}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
          >
            {loading ? tA("saving") : tA("save")}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-dark/15 px-4 py-2.5 text-sm font-semibold text-dark/70 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
            >
              {tA("cancel")}
            </button>
          )}
        </div>
      </form>

      <div>
        <p className="mb-3 text-sm text-dark/55">
          {t("count", { count: notes.length })}
        </p>
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-dark/15 p-8 text-center text-sm text-dark/55">
            {t("empty")}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-2xl border border-dark/10 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-dark font-[family-name:var(--font-heading)]">
                      {n.title}
                    </p>
                    {n.meetingAt && (
                      <p className="text-xs text-primary">
                        {fmt.format(new Date(n.meetingAt))}
                      </p>
                    )}
                    {n.body && (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-dark/65">
                        {n.body}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(n)}
                      className="rounded-lg border border-dark/15 px-3 py-1.5 text-xs font-semibold text-dark/70 hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
                    >
                      {tA("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      disabled={deletingId === n.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 font-[family-name:var(--font-heading)]"
                    >
                      {deletingId === n.id ? tA("deleting") : tA("delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
