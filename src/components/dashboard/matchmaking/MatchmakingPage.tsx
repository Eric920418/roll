"use client";
import { VisitorStats, useNetwork } from "../network/NetworkPanels";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CATEGORIES, ROLES, VISIBLE_FIELDS, cardDraftSchema, publicCard, type CardDraft, type PublicCard, type CardWrite } from "@/lib/matchmaking/schema";
import type { CardOwner } from "@/lib/matchmaking/service";
import { MemberFetchError, memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import CardView, { PrivatePhoto } from "./CardView";

const button = "min-h-11 rounded-lg border border-dark/20 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
const input = "mt-2 w-full min-w-0 rounded-lg border border-dark/20 bg-white p-3 text-sm";
type Listing = { cards: PublicCard[]; hasMore: boolean };
export default function MatchmakingPage() {
  const { value: network } = useNetwork();
  const t = useTranslations("Matchmaking"), locale = useLocale() as Locale;
  const [owner, setOwner] = useState<CardOwner | null>(null), [draft, setDraft] = useState<CardDraft | null>(null);
  const [listing, setListing] = useState<Listing | null>(null), [category, setCategory] = useState("all"), [page, setPage] = useState(1);
  const [error, setError] = useState(""), [listError, setListError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false), [previewing, setPreviewing] = useState(false), [consent, setConsent] = useState(false);
  const [latest, setLatest] = useState<CardOwner | null>(null), [conflict, setConflict] = useState(false);
  const [retryPhoto, setRetryPhoto] = useState<File | null>(null), [uploadingPhoto, setUploadingPhoto] = useState(false);
  const busyRef = useRef(false), pending = useRef({ key: "", id: "" }), photoPending = useRef({ file: null as File | null, revision: -1, id: "" });
  const previewRef = useRef<HTMLDivElement>(null);
  const loadList = useCallback((signal?: AbortSignal) => memberFetch<Listing>(`/api/matchmaking?category=${category}&page=${page}`, { signal })
    .then(result => { if (!signal?.aborted) { setListing(result); setListError(""); } })
    .catch(cause => { if (!signal?.aborted) setListError(cause instanceof Error ? cause.message : String(cause)); }), [category, page]);
  const loadOwner = useCallback((signal?: AbortSignal) => memberFetch<CardOwner>("/api/matchmaking/me", { signal })
    .then(result => { if (!signal?.aborted) { setOwner(result); setDraft(result.draft); } })
    .catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }), []);
  useEffect(() => { const abort = new AbortController(); void loadOwner(abort.signal); return () => abort.abort(); }, [loadOwner]);
  useEffect(() => { const abort = new AbortController(); void loadList(abort.signal); return () => abort.abort(); }, [loadList]);
  useEffect(() => { const abort = new AbortController(); void memberFetch("/api/matchmaking/activity", { method: "POST", body: "{}", signal: abort.signal }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }); return () => abort.abort(); }, []);
  useEffect(() => { if (previewing) previewRef.current?.focus(); }, [previewing]);
  function update<K extends keyof CardDraft>(key: K, value: CardDraft[K]) { setDraft(old => old ? { ...old, [key]: value } : old); setPreviewing(false); setConsent(false); }
  async function compareLatest() {
    try { setLatest(await memberFetch<CardOwner>("/api/matchmaking/me")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function write(action: CardWrite["action"]) {
    if (!owner || !draft || busyRef.current || conflict) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const content = { action, revision: owner.revision, ...(action === "hide" ? {} : { draft }), ...(action === "publish" ? { confirmed: consent } : {}) };
    const key = JSON.stringify(content); if (pending.current.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try {
      const fresh = await memberFetch<CardOwner>("/api/matchmaking/me", { method: "PATCH", body: JSON.stringify({ ...content, requestId: pending.current.id }) });
      setOwner(fresh); setDraft(fresh.draft); setPreviewing(false); setConsent(false); setEditing(false); pending.current = { key: "", id: "" }; setNotice(t(action === "publish" ? "published" : action === "hide" ? "hidden" : "saved"));
      void memberFetch("/api/matchmaking/activity", { method: "POST", body: "{}" }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
      await loadList();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      if (cause instanceof MemberFetchError && cause.status === 409) { setConflict(true); await compareLatest(); }
    } finally { busyRef.current = false; setBusy(false); }
  }
  async function uploadPhoto(file: File) {
    if (!owner?.id || busyRef.current || conflict) return;
    busyRef.current = true; setBusy(true); setUploadingPhoto(true); setError(""); setNotice("");
    if (photoPending.current.file !== file || photoPending.current.revision !== owner.revision) photoPending.current = { file, revision: owner.revision, id: crypto.randomUUID() };
    const form = new FormData(); form.set("photo", file); form.set("revision", String(owner.revision)); form.set("requestId", photoPending.current.id);
    try {
      await memberFetch("/api/matchmaking/me/photo", { method: "POST", body: form });
      const fresh = await memberFetch<CardOwner>("/api/matchmaking/me"); setOwner(fresh); setNotice(t("photoSaved")); photoPending.current.file = null; setRetryPhoto(null); await loadList();
    } catch (cause) { setRetryPhoto(file); setError(cause instanceof Error ? cause.message : String(cause)); if (cause instanceof MemberFetchError && cause.status === 409) { setConflict(true); await compareLatest(); } }
    finally { busyRef.current = false; setBusy(false); setUploadingPhoto(false); }
  }
  const previewDraft = editing ? draft : owner?.draft;
  const preview = owner && previewDraft && cardDraftSchema.safeParse(previewDraft).success ? publicCard({ ...previewDraft, id: owner.id || "preview", sourcePolicy: owner.sourcePolicy, blurredPhoto: owner.hasPhoto ? "present" : null, lastActiveAt: owner.lastActiveAt ? new Date(owner.lastActiveAt) : new Date(), verified: owner.verified && previewDraft.role === owner.draft.role, recommended: owner.recommended }, owner.source, owner.stats, null, new Date(), Boolean(network?.enabled)) : null;
  if (preview?.photo) preview.photo = `/api/matchmaking/me/photo?variant=blurred&v=${owner?.revision}`;
  return <div className="min-w-0 space-y-7">
    <VisitorStats /><header><h1 className="text-3xl font-semibold sm:text-4xl">Matchmaking</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-dark/70">{t("intro")}</p></header>
    {error && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p>{!owner && <button className={`${button} mt-3`} onClick={() => void loadOwner()}>{t("retry")}</button>}{retryPhoto && <button className={`${button} mt-3`} disabled={busy || conflict} onClick={() => void uploadPhoto(retryPhoto)}>{t("retryPhoto")}</button>}</div>}
    {notice && <p role="status" className="rounded-xl border border-dark/15 bg-white p-4 text-sm">{notice}</p>}
    <section className="rounded-2xl border border-dark/15 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{t("yourCard")}</h2><p className="mt-1 text-sm text-dark/65">{owner ? t(owner.visible ? "visible" : "notVisible") : t("loading")}</p></div><div className="flex flex-wrap gap-2"><button className={button} disabled={!owner || busy} onClick={() => setEditing(v => !v)} aria-expanded={editing}>{t("editCard")}</button>{owner?.visible && <button className={button} disabled={busy || conflict} onClick={() => void write("hide")}>{t("hide")}</button>}</div></div>
      {editing && draft && owner && <form className="mt-6 space-y-5" onSubmit={e => { e.preventDefault(); const parsed = cardDraftSchema.safeParse(draft); if (!parsed.success) { setError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")); return; } setPreviewing(true); setConsent(false); }}>
        <p className="text-sm leading-6 text-dark/70">{t("publishRules")}</p>
        {owner.visible && <p className="text-sm font-medium">{t("visibleEditWarning")}</p>}
        <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">{t("role")}<select className={input} value={draft.role} onChange={e => update("role", e.target.value as CardDraft["role"])}>{ROLES.map(role => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}</select></label>
          {(["country", "industry", "slogan", "offers", "looksFor"] as const).map(field => <label key={field} className={`min-w-0 text-sm font-medium ${["slogan", "offers", "looksFor"].includes(field) ? "sm:col-span-2" : ""}`}>{t(`fields.${field}`)}<textarea className={input} rows={field === "offers" || field === "looksFor" ? 3 : 2} maxLength={field === "slogan" ? 500 : field === "country" || field === "industry" ? 200 : 2000} value={draft[field]} onChange={e => update(field, e.target.value)} /></label>)}
        </fieldset>
        <fieldset disabled={busy}><legend className="text-sm font-semibold">{t("categoriesLabel")}</legend><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{CATEGORIES.map(value => <label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.categories.includes(value)} onChange={e => update("categories", e.target.checked ? [...draft.categories, value] : draft.categories.filter(v => v !== value))} />{t(`categories.${value}`)}</label>)}</div></fieldset>
        <fieldset disabled={busy}><legend className="text-sm font-semibold">{t("visibilityLabel")}</legend><p className="mt-2 text-sm leading-6 text-dark/70">{t("privacy")}</p><p className="mt-2 text-sm leading-6 text-dark/70">{t("syncNotice")}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{VISIBLE_FIELDS.filter(field => field !== "photo" && (!network?.enabled || field !== "stats")).map(field => <label key={field} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.visibleFields.includes(field)} onChange={e => update("visibleFields", e.target.checked ? [...draft.visibleFields, field] : draft.visibleFields.filter(v => v !== field))} />{t(`fields.${field}`)}</label>)}</div></fieldset>
        <div className="border-t border-dark/10 pt-4">
          <h3 className="text-base font-semibold">{t("photoTitle")}</h3><p className="mt-2 text-sm leading-6 text-dark/70">{t("photoNotice")}</p>
          {owner.hasPhoto && <div className="mt-3 max-w-64"><PrivatePhoto url={`/api/matchmaking/me/photo?v=${owner.revision}`} alt={t("ownPhoto")} /><p className="mt-2 text-sm text-dark/70">{t("ownPhoto")}</p></div>}
          <label className="mt-4 block text-base font-medium">{t("upload")}<input type="file" className="mt-3 block min-h-12 w-full min-w-0 max-w-full text-base file:mr-3 file:min-h-12 file:rounded-lg file:border file:border-dark/20 file:bg-white file:px-4 file:py-2 file:text-lg file:font-semibold disabled:opacity-50" accept="image/jpeg,image/png,image/webp" disabled={!owner.id || busy || conflict} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadPhoto(file); }} /></label>
          {uploadingPhoto && <p role="status" className="mt-3 text-sm">{t("uploadingPhoto")}</p>}
          {!owner.id && <p className="mt-2 text-sm text-dark/65">{t("saveBeforePhoto")}</p>}
          <label className="mt-4 flex min-h-12 items-center gap-3 text-base"><input type="checkbox" className="size-5 shrink-0" checked={draft.visibleFields.includes("photo")} disabled={busy || conflict} onChange={e => update("visibleFields", e.target.checked ? [...draft.visibleFields, "photo"] : draft.visibleFields.filter(field => field !== "photo" && (!network?.enabled || field !== "stats")))} />{t("sharePhoto")}</label>
          {owner.hasPhoto && !draft.visibleFields.includes("photo") && <p className="mt-2 text-sm text-dark/70">{t("photoHidden")}</p>}
        </div>
        <button type="submit" className={`${button} bg-black! text-white!`} disabled={busy || conflict}>{t("preview")}</button>
        {previewing && preview && <div ref={previewRef} tabIndex={-1} className="space-y-4 rounded-xl border border-dark/20 p-4 focus-visible:outline-2"><h3 className="font-semibold">{t("anonymousPreview")}</h3>{owner.hasPhoto && !draft.visibleFields.includes("photo") && <p className="text-sm text-dark/70">{t("photoHidden")}</p>}<div className="max-w-lg"><CardView card={preview} detail /></div><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy || conflict} onClick={() => void write("save")}>{t(owner.visible ? "saveVisible" : "saveDraft")}</button>{!owner.visible && <><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />{t("consent")}</label><button type="button" className={`${button} bg-black! text-white!`} disabled={!consent || busy || conflict || (!network?.enabled && draft.role === "founder" && owner.stats.interviews < 3)} onClick={() => void write("publish")}>{t("publish")}</button></>}</div></div>}
      </form>}
      {!editing && preview && <div className="mt-5 max-w-lg space-y-3"><p className="text-sm text-dark/70">{t(owner?.visible ? "ownVisiblePreview" : "ownHiddenPreview")}</p>{owner?.hasPhoto && !owner.draft.visibleFields.includes("photo") && <p className="text-sm text-dark/70">{t("photoHidden")}</p>}<CardView card={preview} detail /></div>}
      {conflict && <div className="mt-5 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm">{t("conflict")}</p><button className={button} onClick={() => void compareLatest()}>{t("loadLatest")}</button>{latest && <><dl className="space-y-2 text-sm"><div><dt>{t("latestVisibility")}</dt><dd>{t(latest.visible ? "visible" : "notVisible")}</dd></div>{(["role", "country", "industry", "slogan", "offers", "looksFor", "categories", "visibleFields"] as const).map(field => <div key={field}><dt className="font-semibold">{field === "role" ? t("role") : field === "categories" ? t("categoriesLabel") : field === "visibleFields" ? t("visibilityLabel") : t(`fields.${field}`)}</dt><dd className="whitespace-pre-wrap break-words">{Array.isArray(latest.draft[field]) ? latest.draft[field].join(" · ") : latest.draft[field]}</dd></div>)}</dl><button className={button} onClick={() => { setOwner(latest); setConflict(false); setLatest(null); setPreviewing(false); setConsent(false); setNotice(t("reviewAgain")); }}>{t("keepMine")}</button></>}</div>}
    </section>
    <nav aria-label={t("categoriesLabel")} className="flex flex-wrap gap-2">{["all", ...CATEGORIES].map(value => <button key={value} className={`${button} ${category === value ? "bg-black! text-white!" : ""}`} aria-pressed={category === value} onClick={() => { setCategory(value); setPage(1); }}>{t(`categories.${value}`)}</button>)}</nav>
    {listError && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{listError}</p><button className={`${button} mt-3`} onClick={() => void loadList()}>{t("retry")}</button></div>}
    {!listing ? <p role="status" className="text-sm">{t("loading")}</p> : listing.cards.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{listing.cards.map(card => <div key={card.id} className="flex min-w-0 flex-col">{card.id === owner?.id && <p className="mb-2 text-sm font-semibold">{t("yourCard")}</p>}<CardView card={card} /><Link className={`${button} mt-2 inline-flex items-center`} href={pathForLocale(`/dashboard/matchmaking/${card.id}`, locale)}>{t("viewCard")}</Link></div>)}</div> : <p className="rounded-2xl border border-dark/15 bg-white p-8 text-sm text-dark/70">{t("empty")}</p>}
    <div className="flex items-center gap-3"><button className={button} disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t("previous")}</button><span className="text-sm">{page}</span><button className={button} disabled={!listing?.hasMore} onClick={() => setPage(p => p + 1)}>{t("next")}</button></div>
  </div>;
}
