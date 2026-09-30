"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export type NoteRow = {
  id: string;
  title: string;
  body: string | null;
  meetingAt: string | null; // ISO 字串或 null
  meetingType: string | null;
};

const fieldClass =
  "w-full rounded-xl border border-dark/10 bg-dark/[0.03] px-4 py-2.5 text-sm text-dark outline-none transition placeholder:text-dark/35 focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/40 font-[family-name:var(--font-body)]";
const labelClass =
  "text-xs font-semibold text-dark/70 font-[family-name:var(--font-heading)]";

const empty = { title: "", body: "", meetingAt: "", meetingType: "" };

function toDateInput(iso: string | null, meetingType?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (meetingType) return d.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const busy = loading || deletingId !== null;
  const original = notes.find((note) => note.id === editingId);
  const dirty = form.title !== (original?.title ?? "") ||
    form.body !== (original?.body ?? "") ||
    form.meetingAt !== toDateInput(original?.meetingAt ?? null, original?.meetingType) ||
    form.meetingType !== (original?.meetingType ?? "");

  function discardChanges() {
    return !dirty || window.confirm(t("discardChanges"));
  }

  function newNote() {
    if (!discardChanges()) return;
    reset();
    editorRef.current?.focus();
  }

  const fmt = new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", {
    dateStyle: "medium",
  });
  const dateOnlyFmt = new Intl.DateTimeFormat(locale === "zh-tw" ? "zh-TW" : "en-US", {
    dateStyle: "medium", timeZone: "UTC",
  });

  function reset() {
    setForm({ ...empty });
    setEditingId(null);
    setError("");
  }

  function startEdit(n: NoteRow) {
    if (n.id === editingId || !discardChanges()) return;
    setEditingId(n.id);
    setForm({
      title: n.title,
      body: n.body ?? "",
      meetingAt: toDateInput(n.meetingAt, n.meetingType),
      meetingType: n.meetingType ?? "",
    });
    setError("");
    editorRef.current?.focus();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const url = editingId ? `/api/notes/${editingId}` : "/api/notes";
      const payload = { ...form, meetingType: form.meetingType || null };
      if (editingId && form.meetingAt === toDateInput(original?.meetingAt ?? null, original?.meetingType)) {
        delete (payload as { meetingAt?: string }).meetingAt;
      }
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(12rem,1fr)_minmax(0,2fr)]">
      <section aria-label={t("title")} className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-dark/55">
            {t("count", { count: notes.length })}
          </p>
          <button
            type="button"
            onClick={newNote}
            disabled={busy}
            className="min-h-11 rounded-xl border border-primary/20 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
          >
            + {t("add")}
          </button>
        </div>
        {notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-dark/15 p-6 text-center text-sm text-dark/55">
            {t("empty")}
          </div>
        ) : (
          <ul className="flex max-h-64 flex-col gap-3 overflow-y-auto lg:max-h-[75vh]">
            {notes.map((n) => (
              <li
                key={n.id}
                className={`rounded-2xl border p-4 ${editingId === n.id ? "border-primary bg-primary/[0.04]" : "border-dark/10 bg-white"}`}
              >
                <button
                  type="button"
                  onClick={() => startEdit(n)}
                  disabled={busy}
                  aria-pressed={editingId === n.id}
                  aria-controls="meeting-note-editor"
                  className="block w-full rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60"
                >
                  <span className="block break-words font-semibold text-dark font-[family-name:var(--font-heading)]">
                    {n.title}
                  </span>
                  {n.meetingAt && (
                    <span className="mt-1 block text-xs text-primary">
                      {(n.meetingType ? dateOnlyFmt : fmt).format(new Date(n.meetingAt))}
                    </span>
                  )}
                  {n.meetingType && (
                    <span className="mt-1 block text-xs text-dark/50">{t(`types.${n.meetingType}`)}</span>
                  )}
                  {n.body && (
                    <span className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-dark/65">
                      {n.body}
                    </span>
                  )}
                </button>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(n)}
                    disabled={busy}
                    aria-label={`${tA("edit")}: ${n.title}`}
                    aria-controls="meeting-note-editor"
                    className="min-h-11 rounded-lg border border-dark/15 px-3 py-2 text-xs font-semibold text-dark/70 hover:bg-dark/[0.03] disabled:opacity-60"
                  >
                    {tA("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    disabled={busy}
                    aria-label={`${tA("delete")}: ${n.title}`}
                    className="min-h-11 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deletingId === n.id ? tA("deleting") : tA("delete")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        id="meeting-note-editor"
        onSubmit={submit}
        aria-label={editingId ? tA("edit") : t("add")}
        aria-busy={busy}
        className="min-w-0 rounded-2xl border border-dark/10 bg-white p-5 sm:p-6 lg:sticky lg:top-6"
      >
        <h2 className="text-lg font-bold text-dark font-[family-name:var(--font-heading)]">
          {editingId ? tA("edit") : t("add")}
        </h2>
        <fieldset disabled={busy} className="mt-5 flex min-w-0 flex-col gap-4">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={labelClass}>{t("noteTitle")}</span>
            <input
              className={fieldClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={labelClass}>{t("meetingAt")}</span>
            <input
              type="date"
              className={`${fieldClass} min-w-0`}
              value={form.meetingAt}
              onChange={(e) => setForm({ ...form, meetingAt: e.target.value })}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={labelClass}>{t("meetingType")}</span>
            <select required className={fieldClass} value={form.meetingType} onChange={(e) => setForm({ ...form, meetingType: e.target.value })}>
              <option value="">{t("typePlaceholder")}</option>
              {(["client", "investor", "partner", "internal", "other"] as const).map((type) => (
                <option key={type} value={type}>{t(`types.${type}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={labelClass}>{t("body")}</span>
            <textarea
              ref={editorRef}
              className={`${fieldClass} min-h-96 resize-y leading-7 lg:min-h-[32rem]`}
              rows={18}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>

          {error && (
            <p role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-60 font-[family-name:var(--font-heading)]"
            >
              {loading ? tA("saving") : tA("save")}
            </button>
            {(editingId || dirty) && (
              <button
                type="button"
                onClick={newNote}
                className="min-h-11 rounded-xl border border-dark/15 px-4 py-2.5 text-sm font-semibold text-dark/70 transition-colors hover:bg-dark/[0.03] font-[family-name:var(--font-heading)]"
              >
                {tA("cancel")}
              </button>
            )}
          </div>
        </fieldset>
      </form>
    </div>
  );
}
