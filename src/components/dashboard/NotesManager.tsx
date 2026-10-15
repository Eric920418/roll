"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, ChevronLeftIcon, ChevronRightIcon, ExclamationCircleIcon, MagnifyingGlassIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";

export type NoteRow = {
  id: string;
  title: string;
  body: string | null;
  meetingAt: string | null;
  meetingType: string | null;
};

const empty = { title: "", body: "", meetingAt: "", meetingType: "" };
const control = "inline-flex min-h-11 items-center justify-center rounded-xl border border-dark/15 text-sm font-semibold outline-none transition hover:bg-dark/5 focus-visible:ring-2 focus-visible:ring-dark focus-visible:ring-offset-2 disabled:opacity-35";
const button = `${control} px-5 py-2.5`;
const iconButton = `${control} h-11 w-11 shrink-0 p-2.5 [&>svg]:shrink-0`;
const types = ["client", "investor", "partner", "internal", "other"] as const;

function toDateInput(iso: string | null, meetingType?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (meetingType) return d.toISOString().slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function NotesManager({ notes }: { notes: NoteRow[] }) {
  const t = useTranslations("Dashboard.notes"), tA = useTranslations("Dashboard.actions"), router = useRouter();
  const [form, setForm] = useState({ ...empty }), [original, setOriginal] = useState<NoteRow | null>(null);
  const [query, setQuery] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false), [deleting, setDeleting] = useState(false), [opened, setOpened] = useState(false), [expanded, setExpanded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), titleRef = useRef<HTMLInputElement>(null), sending = useRef(false);
  const editingId = original?.id, busy = loading || deleting;
  const dirty = form.title !== (original?.title ?? "") || form.body !== (original?.body ?? "") ||
    form.meetingAt !== toDateInput(original?.meetingAt ?? null, original?.meetingType) || form.meetingType !== (original?.meetingType ?? "");
  const normalizedQuery = query.normalize("NFKC").trim().toLocaleLowerCase();
  const typeLabel = (type: string | null) => types.includes(type as typeof types[number]) ? t(`types.${type}`) : t("unclassified");
  const visible = notes.filter(note => [note.title, note.body ?? "", typeLabel(note.meetingType)].join(" ").normalize("NFKC").toLocaleLowerCase().includes(normalizedQuery));
  const selectedIndex = visible.findIndex(note => note.id === editingId);

  useEffect(() => {
    if (!opened || !dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [opened, dirty]);

  function discardChanges() { return !dirty || window.confirm(t("discardChanges")); }
  function finishClose() { setOpened(false); setExpanded(false); setForm({ ...empty }); setOriginal(null); setError(""); }
  function closeEditor(saved = false) {
    if (busy && !saved) return;
    if (!saved && !discardChanges()) return;
    dialog.current?.close(); finishClose();
  }
  function showEditor(focusTitle = false) {
    setOpened(true);
    if (!dialog.current?.open) dialog.current?.showModal();
    if (focusTitle) titleRef.current?.focus({ preventScroll: true });
  }
  function newNote() {
    if (busy || !discardChanges()) return;
    setOriginal(null); setForm({ ...empty }); setError(""); setNotice(""); showEditor(true);
  }
  function startEdit(note: NoteRow) {
    if (busy || (opened && note.id === editingId) || !discardChanges()) return;
    setOriginal(note); setForm({ title: note.title, body: note.body ?? "", meetingAt: toDateInput(note.meetingAt, note.meetingType), meetingType: note.meetingType ?? "" });
    setError(""); setNotice(""); showEditor();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (sending.current) return;
    sending.current = true; setError(""); setLoading(true);
    try {
      const payload = { ...form, meetingType: form.meetingType || null };
      if (editingId && form.meetingAt === toDateInput(original?.meetingAt ?? null, original?.meetingType)) delete (payload as { meetingAt?: string }).meetingAt;
      const res = await fetch(editingId ? `/api/notes/${editingId}` : "/api/notes", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json(); if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      closeEditor(true); setNotice(t("saved")); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { sending.current = false; setLoading(false); }
  }
  async function remove() {
    if (!editingId || sending.current || !window.confirm(tA("deleteConfirm"))) return;
    sending.current = true; setError(""); setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${editingId}`, { method: "DELETE" }), json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      closeEditor(true); setNotice(t("deleted")); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { sending.current = false; setDeleting(false); }
  }

  return <section className="mt-5 min-w-0" aria-label={t("title")}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-dark/60">{normalizedQuery ? t("searchCount", { count: visible.length, total: notes.length }) : t("count", { count: notes.length })}</p>
      <button type="button" className={button} onClick={newNote} disabled={busy}>{t("add")}</button>
    </div>
    <label className="relative mb-5 block">
      <span className="sr-only">{t("search")}</span><MagnifyingGlassIcon aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-dark/55" />
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t("search")} className="min-h-12 w-full rounded-2xl border border-dark/20 bg-white py-3 pl-12 pr-4 text-base outline-none placeholder:text-dark/45 focus-visible:ring-2 focus-visible:ring-dark" />
    </label>
    {notice && <p role="status" className="mb-4 text-sm text-dark/65">{notice}</p>}
    <div className="overflow-hidden rounded-2xl border border-dark/15 bg-white">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="border-b border-dark/15 bg-dark/[0.02] text-dark/60"><tr><th scope="col" className="px-4 py-4 font-medium sm:px-5">{t("noteTitle")}</th><th scope="col" className="w-28 px-3 py-4 font-medium sm:w-40 sm:px-5">{t("meetingType")}</th></tr></thead>
        <tbody>{visible.map(note => <tr key={note.id} className={`border-b border-dark/10 last:border-b-0 ${editingId === note.id ? "bg-dark/5 outline-2 -outline-offset-2 outline-dark" : "hover:bg-dark/[0.03]"}`}>
          <td className="p-0"><button type="button" disabled={busy} aria-label={`${tA("edit")}: ${note.title}`} aria-haspopup="dialog" aria-controls="meeting-note-editor" aria-pressed={editingId === note.id} onClick={() => startEdit(note)} className="min-h-20 w-full px-4 py-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-dark disabled:opacity-50 sm:px-5"><span className="block truncate text-base font-semibold">{note.title}</span></button></td>
          <td className="px-3 py-5 text-dark/60 sm:px-5">{typeLabel(note.meetingType)}</td>
        </tr>)}</tbody>
      </table>
      {!visible.length && <p className="px-5 py-10 text-center text-sm text-dark/55">{notes.length ? t("noMatches") : t("empty")}</p>}
    </div>

    <dialog ref={dialog} id="meeting-note-editor" aria-labelledby="meeting-note-editor-label" onCancel={event => { event.preventDefault(); closeEditor(); }} onClose={finishClose}
      className={`nova-theme fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-white p-0 text-dark shadow-xl backdrop:bg-black/20 ${expanded ? "sm:w-full" : "sm:w-[58vw] sm:min-w-[36rem]"}`}>
      <form onSubmit={submit} aria-busy={busy} className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-dark/10 px-4 py-3 sm:px-7 sm:py-4">
          <h2 id="meeting-note-editor-label" className="sr-only">{editingId ? tA("edit") : t("add")}</h2>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button type="button" className={iconButton} aria-label={t("previous")} disabled={busy || selectedIndex <= 0} onClick={() => startEdit(visible[selectedIndex - 1])}><ChevronLeftIcon aria-hidden="true" className="h-5 w-5" /></button>
            <button type="button" className={iconButton} aria-label={t("next")} disabled={busy || selectedIndex < 0 || selectedIndex >= visible.length - 1} onClick={() => startEdit(visible[selectedIndex + 1])}><ChevronRightIcon aria-hidden="true" className="h-5 w-5" /></button>
            <p className="truncate text-sm text-dark/60" aria-live="polite">{selectedIndex >= 0 ? t("position", { index: selectedIndex + 1, total: visible.length }) : t("add")}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={`${iconButton} max-sm:hidden`} disabled={busy} aria-label={t(expanded ? "collapse" : "expand")} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ArrowsPointingInIcon aria-hidden="true" className="h-5 w-5" /> : <ArrowsPointingOutIcon aria-hidden="true" className="h-5 w-5" />}</button>
            <button type="button" className={iconButton} disabled={busy} aria-label={t("close")} onClick={() => closeEditor()}><XMarkIcon aria-hidden="true" className="h-6 w-6" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
          <fieldset disabled={busy} className="min-w-0">
            <label className="block"><span className="sr-only">{t("noteTitle")}</span><input ref={titleRef} required value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder={t("noteTitle")} className="min-h-11 w-full rounded-lg bg-transparent py-1 text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-dark sm:text-2xl" /></label>
            <div className="mt-4 flex flex-wrap gap-3 border-b border-dark/10 pb-5">
              <label><span className="sr-only">{t("meetingAt")}</span><input type="date" value={form.meetingAt} onChange={event => setForm({ ...form, meetingAt: event.target.value })} className="min-h-11 max-w-full rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-dark" /></label>
              <label><span className="sr-only">{t("meetingType")}</span><select required value={form.meetingType} onChange={event => setForm({ ...form, meetingType: event.target.value })} className="min-h-11 max-w-full rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-dark"><option value="">{t("typePlaceholder")}</option>{types.map(type => <option key={type} value={type}>{t(`types.${type}`)}</option>)}</select></label>
            </div>
            <label className="mt-4 block"><span className="sr-only">{t("body")}</span><textarea value={form.body} onChange={event => setForm({ ...form, body: event.target.value })} placeholder={t("bodyPlaceholder")} className="min-h-[55dvh] w-full resize-y rounded-lg bg-transparent py-1 text-base leading-8 outline-none placeholder:text-dark/35 focus-visible:ring-2 focus-visible:ring-dark sm:text-lg" /></label>
          </fieldset>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-dark/10 bg-white px-4 py-3 sm:px-7 sm:py-4">
          {error && <p role="alert" className="max-h-32 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p role="status" className="flex w-full items-center gap-2 text-xs text-dark/60 sm:w-auto sm:text-sm">{dirty && <ExclamationCircleIcon aria-hidden="true" className="h-4 w-4 text-dark" />}{t(dirty ? "unsavedChanges" : "noChanges")}</p>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {editingId && <button type="button" className={`${iconButton} text-red-700 hover:bg-red-50`} disabled={busy} aria-label={tA("delete")} onClick={() => void remove()}><TrashIcon aria-hidden="true" className="h-5 w-5" /></button>}
            <button type="button" className={button} disabled={busy} onClick={() => closeEditor()}>{tA("cancel")}</button>
            <button type="submit" className={`${button} border-black bg-black text-white hover:bg-black/85`} disabled={busy}>{loading ? tA("saving") : deleting ? tA("deleting") : tA("save")}</button>
          </div>
        </footer>
      </form>
    </dialog>
  </section>;
}
