"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MemberFetchError, memberFetch } from "@/lib/member-fetch";
import { reflectionSchema, type Reflection, type ReflectionEntry } from "@/lib/mindset/schema";

const empty: Reflection = { blocker: "", controllable: "", nextAction: "" };
const fields = ["blocker", "controllable", "nextAction"] as const;
const button = "min-h-11 rounded-lg border border-dark/20 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
type History = { entries: ReflectionEntry[]; hasMore: boolean };
export default function MindsetPage() {
  const t = useTranslations("Mindset"), locale = useLocale();
  const [values, setValues] = useState<Reflection>(empty), [editing, setEditing] = useState<ReflectionEntry | null>(null);
  const [history, setHistory] = useState<History | null>(null), [page, setPage] = useState(1), [error, setError] = useState(""), [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false), [reviewing, setReviewing] = useState(false), [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<ReflectionEntry | null>(null), [latest, setLatest] = useState<ReflectionEntry | null>(null), [conflict, setConflict] = useState(false);
  const pending = useRef({ key: "", id: "" }), busyRef = useRef(false), formRef = useRef<HTMLFormElement>(null), reviewRef = useRef<HTMLDivElement>(null);
  const load = useCallback((signal?: AbortSignal) => memberFetch<History>(`/api/mindset?page=${page}`, { signal })
    .then(data => { if (!signal?.aborted) { setHistory(data); setHistoryError(""); } })
    .catch(cause => { if (!signal?.aborted) setHistoryError(cause instanceof Error ? cause.message : String(cause)); }), [page]);
  useEffect(() => { const abort = new AbortController(); void load(abort.signal); return () => abort.abort(); }, [load]);
  useEffect(() => { if (reviewing) reviewRef.current?.focus(); }, [reviewing]);
  async function compareLatest(id: string) {
    try { setLatest(await memberFetch<ReflectionEntry>(`/api/mindset/${encodeURIComponent(id)}`)); }
    catch (cause) { setError(old => `${old}\n${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  async function save(remove = false) {
    if (busyRef.current || conflict) return;
    const row = remove ? deleting : editing;
    if (remove && !row) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const payload = { ...(remove ? {} : { reflection: values }), ...(row ? { revision: row.revision } : {}) };
    const method = remove ? "DELETE" : row ? "PATCH" : "POST", url = row ? `/api/mindset/${row.id}` : "/api/mindset";
    const key = JSON.stringify({ method, url, payload }); if (pending.current.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try {
      await memberFetch(url, { method, body: JSON.stringify({ ...payload, requestId: pending.current.id }) });
      if (!remove) { setValues(empty); setEditing(null); setReviewing(false); }
      setDeleting(null); setNotice(t(remove ? "deleted" : "saved")); pending.current = { key: "", id: "" };
      if (page !== 1) setPage(1); else await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (cause instanceof MemberFetchError && cause.status === 409 && row) { setConflict(true); await compareLatest(row.id); }
    } finally { busyRef.current = false; setBusy(false); }
  }
  function reset() { setValues(empty); setEditing(null); setReviewing(false); setConflict(false); setLatest(null); setDeleting(null); pending.current = { key: "", id: "" }; }
  return <div className="mx-auto max-w-3xl space-y-7">
    <header><h1 className="text-3xl font-semibold sm:text-4xl">Mindset</h1></header>
    {error && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {notice && <p role="status" className="rounded-xl border border-dark/15 bg-white p-4 text-sm">{notice}</p>}
    <form ref={formRef} tabIndex={-1} className="space-y-5 rounded-2xl border border-dark/15 bg-white p-5 sm:p-7" onSubmit={e => { e.preventDefault(); const result = reflectionSchema.safeParse(values); if (!result.success) { setError(result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")); return; } setReviewing(true); }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{t(editing ? "edit" : "new")}</h2>{editing && <button className={button} type="button" disabled={busy} onClick={reset}>{t("cancel")}</button>}</div>
      <p className="text-sm text-dark/65">{t("private")}</p>
      <fieldset disabled={busy || reviewing} className="space-y-5">{fields.map(field => <label key={field} className="block text-sm font-medium">{t(`questions.${field}`)}<textarea className="mt-2 block w-full rounded-lg border border-dark/20 p-3 text-sm" rows={3} maxLength={2000} value={values[field]} onChange={e => setValues(old => ({ ...old, [field]: e.target.value }))} /><span className="mt-1 block text-right text-xs font-normal text-dark/65">{values[field].length} / 2000</span></label>)}</fieldset>
      {!reviewing && <button className={`${button} bg-black! text-white!`} type="submit" disabled={busy || conflict}>{t("review")}</button>}
      {reviewing && <div ref={reviewRef} tabIndex={-1} className="space-y-4 rounded-xl border border-dark/15 p-4 focus-visible:outline-2"><h3 className="font-semibold">{t("review")}</h3><dl className="space-y-4 text-sm">{fields.map(field => <div key={field}><dt className="font-medium">{t(`questions.${field}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{values[field] || "—"}</dd></div>)}</dl><div className="flex flex-wrap gap-3"><button className={button} type="button" disabled={busy} onClick={() => setReviewing(false)}>{t("backToEdit")}</button><button className={`${button} bg-black! text-white!`} type="button" disabled={busy || conflict} onClick={() => void save()}>{t("confirmSave")}</button></div></div>}
    </form>
    {conflict && <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold">{t("conflict")}</h2><button className={button} onClick={() => { const id = deleting?.id || editing?.id; if (id) void compareLatest(id); }}>{t("loadLatest")}</button>{latest && <><h3 className="text-sm font-semibold">{t("latest")}</h3><dl className="space-y-3 text-sm">{fields.map(field => <div key={field}><dt>{t(`questions.${field}`)}</dt><dd className="whitespace-pre-wrap break-words">{latest[field] || "—"}</dd></div>)}</dl><button className={button} onClick={() => { if (deleting) setDeleting(latest); else setEditing(latest); setLatest(null); setConflict(false); setReviewing(false); setNotice(t("reviewAgain")); }}>{t("keepMine")}</button></>}<button className={button} onClick={reset}>{t("cancel")}</button></section>}
    <section className="space-y-4"><h2 className="text-xl font-semibold">{t("history")}</h2>{historyError && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{historyError}</p><button className={`${button} mt-3`} onClick={() => void load()}>{t("retry")}</button></div>}{!history ? <p role="status" className="text-sm">{t("loading")}</p> : !history.entries.length ? <p className="rounded-xl border border-dark/15 bg-white p-6 text-sm text-dark/65">{t("empty")}</p> : history.entries.map(entry => <article key={entry.id} className="space-y-4 rounded-2xl border border-dark/15 bg-white p-5"><time className="text-xs text-dark/65" dateTime={entry.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(entry.createdAt))} · Asia/Taipei</time><dl className="space-y-3 text-sm">{fields.map(field => entry[field] && <div key={field}><dt className="font-semibold">{t(`questions.${field}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{entry[field]}</dd></div>)}</dl><div className="flex flex-wrap gap-3"><button className={button} disabled={busy || conflict} onClick={() => { setEditing(entry); setValues({ blocker: entry.blocker, controllable: entry.controllable, nextAction: entry.nextAction }); setReviewing(false); setDeleting(null); setNotice(""); pending.current = { key: "", id: "" }; formRef.current?.focus(); formRef.current?.scrollIntoView({ behavior: "auto", block: "start" }); }}>{t("edit")}</button><button className={button} disabled={busy || conflict} onClick={() => setDeleting(entry)}>{t("delete")}</button></div>{deleting?.id === entry.id && <div className="space-y-3 rounded-lg border border-dark/20 p-4"><p className="text-sm">{t("deleteConfirm")}</p><button className={button} disabled={busy || conflict} onClick={() => void save(true)}>{t("confirmDelete")}</button><button className={`${button} ml-2`} disabled={busy} onClick={() => setDeleting(null)}>{t("cancel")}</button></div>}</article>)}</section>
    <div className="flex items-center gap-3"><button className={button} disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>{t("previous")}</button><span className="text-sm">{page}</span><button className={button} disabled={busy || !history?.hasMore} onClick={() => setPage(p => p + 1)}>{t("next")}</button></div>
  </div>;
}
