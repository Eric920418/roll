"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import { EMPTY_ICP, ICP_FIELDS, nextIcpQuestion, readIcp, persistedIcpAnswer, type IcpDraft, type IcpWorkspaceView } from "@/lib/icp/schema";

const button = "rounded-xl border border-dark/15 bg-white px-4 py-3 text-sm font-semibold text-dark transition hover:bg-dark/[0.04] disabled:opacity-50";
const inputClass = "w-full rounded-xl border border-dark/15 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function IcpPanel({ userId, saved, legacy, version, canUseAi, children }: {
  userId: string; saved: IcpDraft | null; legacy: string | null; version: number; canUseAi: boolean; children: ReactNode;
}) {
  const t = useTranslations("Dashboard.icp");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<IcpWorkspaceView>({ revision: 0, profileVersion: version, currentProfileVersion: version, messages: [nextIcpQuestion(null, [], locale)!], draft: null, saved, legacy, pending: false, error: null });
  const [text, setText] = useState("");
  const [form, setForm] = useState<IcpDraft>({ ...EMPTY_ICP });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const storageKey = `nova:icp:${userId}`;

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open || !workspace.pending) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const fresh = await request();
        if (!cancelled) { setWorkspace(fresh); reconcileInput(fresh); setLoaded(true); }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); }
    }, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
    // polling only restores server state while an analysis owns the workspace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace.pending]);

  async function request(method = "GET", data?: object): Promise<IcpWorkspaceView> {
    const response = await fetch(`/api/account/icp?locale=${locale}`, {
      method, cache: "no-store", ...(data ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) } : {}),
    });
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status}: ${response.statusText || t("connectionError")}`); }
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body.data;
  }
  function store(nextText: string, nextForm: IcpDraft, isEditing: boolean) {
    try {
      if (nextText || isEditing) localStorage.setItem(storageKey, JSON.stringify({ text: nextText, form: nextForm, editing: isEditing, revision: workspace.revision, answerIndex: workspace.messages.length }));
      else localStorage.removeItem(storageKey);
    } catch { setNotice(t("storageWarning")); }
  }
  function reconcileInput(fresh: IcpWorkspaceView) {
    try {
      const cached = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (persistedIcpAnswer(fresh, cached)) {
        setText(current => current === cached.text ? "" : current);
        if (cached.editing) localStorage.setItem(storageKey, JSON.stringify({ ...cached, text: "" }));
        else localStorage.removeItem(storageKey);
      }
    } catch { setNotice(t("storageWarning")); }
  }
  async function load(preserveEdit = false) {
    setBusy(true); setError("");
    try {
      const fresh = await request(); setWorkspace(fresh); reconcileInput(fresh); setLoaded(true);
      if (!preserveEdit) setForm(fresh.draft || fresh.saved || { ...EMPTY_ICP, summary: fresh.legacy || "" });
      return fresh;
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  async function show(manual = false) {
    if (busyRef.current) return;
    if (document.activeElement instanceof HTMLButtonElement) trigger.current = document.activeElement;
    setOpen(true); setNotice(""); setLoaded(false);
    dialog.current?.showModal();
    let local: { text?: string; form?: IcpDraft; editing?: boolean; revision?: number; answerIndex?: number } | null = null;
    try { local = JSON.parse(localStorage.getItem(storageKey) || "null"); } catch { setNotice(t("storageWarning")); }
    setText(typeof local?.text === "string" ? local.text : "");
    const fresh = await load();
    if (fresh && persistedIcpAnswer(fresh, local)) local = { ...local, text: "" };
    const restored = readIcp(local?.form);
    if (local?.editing && restored) { setForm(restored); setEditing(true); setNotice(t("localRestored")); }
    else {
      setEditing(manual);
      if (manual && fresh) store(local?.text || "", fresh.draft || fresh.saved || { ...EMPTY_ICP, summary: fresh.legacy || "" }, true);
    }
  }
  function beginEdit() {
    const draft = workspace.draft || workspace.saved || { ...EMPTY_ICP, summary: workspace.legacy || "" };
    setForm(draft); setEditing(true); store(text, draft, true);
  }
  async function mutate(action: "answer" | "retry" | "edit" | "save") {
    if (busyRef.current || !loaded || workspace.pending) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const draft = editing ? form : workspace.draft;
      if ((action === "edit" || action === "save") && !draft) throw new Error(t("noDraft"));
      const fresh = await request(action === "answer" || action === "retry" ? "POST" : "PATCH", {
        action, revision: workspace.revision, requestId: crypto.randomUUID(), locale,
        ...(action === "answer" ? { text } : {}),
        ...(action === "edit" || action === "save" ? { draft, profileVersion: workspace.profileVersion } : {}),
      });
      setWorkspace(fresh);
      if (action === "answer" || action === "retry") { setText(""); store("", form, editing); }
      if (action === "edit" || action === "save") {
        setEditing(false); store(text, form, false); setNotice(t(action === "save" ? "saved" : "draftSaved"));
      }
      if (action === "save") router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      // Reconcile persisted answers after network/provider failure without discarding local edits.
      try { const fresh = await request(); setWorkspace(fresh); reconcileInput(fresh); } catch { /* original error remains visible */ }
    } finally { busyRef.current = false; setBusy(false); }
  }
  const current = workspace.saved || saved;
  const awaitingAnswer = workspace.messages.at(-1)?.role === "assistant";
  const blocked = busy || workspace.pending || !loaded;

  function rows(draft: IcpDraft, emptyLabel = t("unknown")) {
    return <dl className="mt-4 divide-y divide-dark/10">{ICP_FIELDS.map(key => <div key={key} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
      <dt className="text-sm text-dark/60">{t(`fields.${key}`)}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-semibold text-dark sm:text-right">{draft[key] || emptyLabel}</dd>
    </div>)}</dl>;
  }

  return <>
    <section className="min-w-0 rounded-2xl border border-sky-300 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-bold uppercase tracking-wider text-dark">{t("title")}</h2></div>
      <p className="mt-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-lg font-bold text-dark">{current?.summary || workspace.legacy || legacy || t("notProvided")}</p>
      {rows(current || EMPTY_ICP, t("notProvided"))}
      <div className="mt-4 flex flex-wrap gap-2">
        {canUseAi ? <button ref={trigger} type="button" className={`${button} flex-1`} onClick={() => void show()}>✧ {t("ask")}</button> : <Link className={`${button} flex-1 text-center`} href={pathForLocale("/dashboard/account#plan", locale)}>{t("upgrade")}</Link>}
        <button type="button" className={button} onClick={() => void show(true)}>{t("edit")}</button>
      </div>
    </section>
    <section className="min-w-0 rounded-2xl border border-dark/10 bg-white p-6 lg:col-span-2">
      {children}
      <div className="mt-5">{canUseAi ? <button type="button" className={button} onClick={() => void show()}>✧ {t("sharpen")}</button> : <Link className={button} href={pathForLocale("/dashboard/account#plan", locale)}>{t("sharpen")}</Link>}</div>
    </section>
    {mounted && createPortal(<dialog ref={dialog} aria-labelledby="icp-panel-title" onClose={() => { setOpen(false); trigger.current?.focus(); }} className="nova-theme fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-[900px] overflow-y-auto rounded-l-2xl border-0 bg-white p-0 text-dark shadow-2xl backdrop:bg-black/35">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-dark/10 bg-white px-5 py-4 sm:px-8">
        <h2 id="icp-panel-title" className="text-xl font-bold">✧ POLARIS · {t("title")}</h2>
        <button type="button" aria-label={t("close")} className={button} onClick={() => dialog.current?.close()}>{t("close")}</button>
      </div>
      <div className="space-y-5 p-5 sm:p-8">
        <p className="text-sm text-dark/60">{t("panelHint")}</p>
        {workspace.messages.map((message, index) => <p key={index} className={`max-w-[95%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-sky-100 text-sky-950" : "border border-dark/10 bg-white text-dark"}`}>{index === 0 && message.role === "assistant" ? `${t("opening")} ${message.content}` : message.content}</p>)}
        {workspace.pending && <p role="status" className="text-sm text-dark/60">{t("analysing")}</p>}
        {canUseAi && awaitingAnswer && !editing && <form onSubmit={event => { event.preventDefault(); void mutate("answer"); }} className="space-y-3">
          <label className="block text-sm font-semibold" htmlFor="icp-answer">{t("answer")}</label>
          <textarea id="icp-answer" autoFocus rows={3} maxLength={4000} value={text} disabled={blocked} className={inputClass} onChange={event => { setText(event.target.value); store(event.target.value, form, editing); }} />
          <button type="submit" disabled={blocked || !text.trim()} className={`${button} bg-black! text-white!`}>{busy ? t("analysing") : t("send")}</button>
        </form>}
        {(workspace.draft || editing) && <section className="rounded-2xl border border-sky-300 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{t("draftTitle")}</h3></div>
          {editing ? <div className="mt-4 space-y-4">{(["summary", ...ICP_FIELDS] as const).map(key => <label key={key} className="block text-sm font-semibold">
            {t(`fields.${key}`)}<textarea aria-label={t(`fields.${key}`)} autoFocus={key === "summary"} rows={2} maxLength={key === "summary" ? 2000 : 500} value={form[key]} disabled={blocked} className={`${inputClass} mt-1`} onChange={event => { const draft = { ...form, [key]: event.target.value }; setForm(draft); store(text, draft, true); }} />
          </label>)}</div> : <>{workspace.draft?.summary && <p className="mt-4 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-semibold">{workspace.draft.summary}</p>}{rows(workspace.draft!)}</>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={blocked} onClick={() => void mutate("save")} className={`${button} bg-black! text-white!`}>{t("save")}</button>
            {editing ? <button type="button" disabled={blocked} onClick={() => void mutate("edit")} className={button}>{t("saveDraft")}</button> : <button type="button" disabled={blocked} onClick={beginEdit} className={button}>{t("edit")}</button>}
            {canUseAi && !editing && <button type="button" disabled={blocked} onClick={() => void mutate("retry")} className={button}>{t("retry")}</button>}
          </div>
        </section>}
        {(!workspace.draft && !editing && loaded) && <button type="button" disabled={blocked} onClick={beginEdit} className={button}>{t("manual")}</button>}
        {(error || workspace.error) && <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{error || workspace.error}</p>
          <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={button} onClick={() => void load(editing)}>{t("reload")}</button>
            {canUseAi && !awaitingAnswer && <button type="button" disabled={blocked} className={button} onClick={() => void mutate("retry")}>{t("retry")}</button>}</div>
        </div>}
        {notice && <p role="status" className="whitespace-pre-wrap rounded-xl bg-dark/[0.04] p-3 text-sm">{notice}</p>}
      </div>
    </dialog>, document.body)}
  </>;
}
