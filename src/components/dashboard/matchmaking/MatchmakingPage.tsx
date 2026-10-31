"use client";
import { useRewards } from "../rewards/RewardsProvider";
import { ViewerPrivacySettings } from "../network/ViewerOverview";
import { COMPANY_STAGES } from "@/lib/action-plan/constants";
import { useRouter } from "next/navigation";
import CountrySelect from "@/components/ui/CountrySelect";
import { industryLabel, INDUSTRY_LABELS } from "@/lib/member-options";
import { track } from "@/lib/analytics";
import { VisitorStats, useNetwork } from "../network/NetworkPanels";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CATEGORIES, ROLES, VISIBLE_FIELDS, cardDraftSchema, publicCard, type CardDraft, type PublicCard, type CardWrite } from "@/lib/matchmaking/schema";
import type { CardOwner } from "@/lib/matchmaking/service";
import { MemberFetchError, memberFetch } from "@/lib/member-fetch";
import { pathForLocale } from "@/lib/routes";
import type { Locale } from "@/i18n/routing";
import CardView, { PrivatePhoto, CardChatAction } from "./CardView";

const button = "min-h-11 rounded-lg border border-dark/20 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2";
const input = "mt-2 w-full min-w-0 rounded-lg border border-dark/20 bg-white p-3 text-sm";
type Listing = { cards: PublicCard[]; hasMore: boolean };
export default function MatchmakingPage({ active = true, editOnly = false }: { active?: boolean; editOnly?: boolean }) {
  const router = useRouter(), rewards = useRewards();
  const { value: network } = useNetwork();
  const [view, setView] = useState("recommendations");
  const [company, setCompany] = useState<{ companyName: string; country: string; industry: string; oneLinePitch: string; companyStage: string } | null>(null);
  const [role, setRole] = useState("all"), [country, setCountry] = useState(""), [industry, setIndustry] = useState(""), [query, setQuery] = useState(""), [q, setQ] = useState("");
  const t = useTranslations("Matchmaking"), locale = useLocale() as Locale;
  const [owner, setOwner] = useState<CardOwner | null>(null), [draft, setDraft] = useState<CardDraft | null>(null);
  const [listing, setListing] = useState<Listing | null>(null), [category, setCategory] = useState("all"), [page, setPage] = useState(1);
  const [error, setError] = useState(""), [listError, setListError] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(editOnly), [previewing, setPreviewing] = useState(false), [consent, setConsent] = useState(false);
  const [latest, setLatest] = useState<CardOwner | null>(null), [conflict, setConflict] = useState(false);
  const [retryPhoto, setRetryPhoto] = useState<File | null>(null), [uploadingPhoto, setUploadingPhoto] = useState(false);
  const busyRef = useRef(false), pending = useRef({ key: "", id: "" }), photoPending = useRef({ file: null as File | null, revision: -1, id: "" });
  const previewRef = useRef<HTMLDivElement>(null);
  const loadList = useCallback((signal?: AbortSignal) => memberFetch<Listing>(`/api/matchmaking?${new URLSearchParams({ view, category, page: String(page), role, country, industry, q })}`, { signal })
    .then(result => { if (!signal?.aborted) { setListing(result); setListError(""); track(result.cards.length ? "flow_success" : "search_empty", { feature: "matchmaking" }); } })
    .catch(cause => { if (!signal?.aborted) setListError(cause instanceof Error ? cause.message : String(cause)); }), [view, category, page, role, country, industry, q]);
  const loadOwner = useCallback((signal?: AbortSignal) => memberFetch<CardOwner>("/api/matchmaking/me", { signal })
    .then(result => { if (!signal?.aborted) { setOwner(result); setDraft(result.draft); setCompany({ companyName: result.source?.companyName || "", country: result.source?.country || "", industry: result.source?.industry || "", oneLinePitch: result.source?.oneLinePitch || "", companyStage: result.source?.companyStage || "" }); } })
    .catch(cause => { if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }), []);
  useEffect(() => { if (!active || owner) return; const abort = new AbortController(); void loadOwner(abort.signal); return () => abort.abort(); }, [loadOwner, active, owner]);
  useEffect(() => { if (!active || editOnly) return; const abort = new AbortController(); void loadList(abort.signal); return () => abort.abort(); }, [loadList, active, editOnly]);
  useEffect(() => { if (!active) return; const abort = new AbortController(); void memberFetch("/api/matchmaking/activity", { method: "POST", body: "{}", signal: abort.signal }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); }); return () => abort.abort(); }, [active]);
  useEffect(() => { if (previewing) previewRef.current?.focus(); }, [previewing]);
  function update<K extends keyof CardDraft>(key: K, value: CardDraft[K]) { setDraft(old => old ? { ...old, [key]: value } : old); setPreviewing(false); setConsent(false); }
  async function compareLatest() {
    try { setLatest(await memberFetch<CardOwner>("/api/matchmaking/me")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function write(action: CardWrite["action"]) {
    if (!owner || !draft || busyRef.current || conflict) return;
    busyRef.current = true; setBusy(true); setError(""); setNotice("");
    const content = { action, revision: owner.revision, ...(action === "hide" ? {} : { draft, ...(company ? { company: { ...company, sourceVersion: owner.sourceVersion } } : {}) }), ...(action === "publish" ? { confirmed: consent } : {}) };
    const key = JSON.stringify(content); if (pending.current.key !== key) pending.current = { key, id: crypto.randomUUID() };
    try {
      const fresh = await memberFetch<CardOwner>("/api/matchmaking/me", { method: "PATCH", body: JSON.stringify({ ...content, requestId: pending.current.id }) });
      setOwner(fresh); setDraft(fresh.draft); setPreviewing(false); setConsent(false); setEditing(false); pending.current = { key: "", id: "" }; setNotice(t(action === "publish" ? "published" : action === "hide" ? "hidden" : "saved"));
      if (action !== "hide") void rewards?.refresh();
      void memberFetch("/api/matchmaking/activity", { method: "POST", body: "{}" }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
      if (editOnly) { router.push(pathForLocale("/dashboard/matchmaking", locale)); router.refresh(); } else await loadList();
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
      const fresh = await memberFetch<CardOwner>("/api/matchmaking/me");
      setOwner({ ...fresh, source: owner.source, sourceVersion: owner.sourceVersion });
      if (fresh.revision !== owner.revision + 1 || fresh.sourceVersion !== owner.sourceVersion) { setConflict(true); setLatest(fresh); setError(t("conflict")); }
      setNotice(t("photoSaved")); photoPending.current.file = null; setRetryPhoto(null); await loadList();
    } catch (cause) { setRetryPhoto(file); setError(cause instanceof Error ? cause.message : String(cause)); if (cause instanceof MemberFetchError && cause.status === 409) { setConflict(true); await compareLatest(); } }
    finally { busyRef.current = false; setBusy(false); setUploadingPhoto(false); }
  }
  const previewDraft = editing ? draft : owner?.draft;
  const preview = owner && previewDraft && cardDraftSchema.safeParse(previewDraft).success ? publicCard({ ...previewDraft, id: owner.id || "preview", sourcePolicy: owner.sourcePolicy, displayName: previewDraft.displayName, blurredPhoto: owner.hasPhoto ? "present" : null, lastActiveAt: owner.lastActiveAt ? new Date(owner.lastActiveAt) : new Date(), verified: owner.verified && previewDraft.role === owner.draft.role, recommended: owner.recommended }, (editing && company ? { ...owner.source, ...company, icp: owner.source?.icp || null, targetMarkets: owner.source?.targetMarkets || [] } : owner.source), owner.stats, null, new Date(), Boolean(network?.enabled)) : null;
  if (preview?.photo) preview.photo = `/api/matchmaking/me/photo?variant=blurred&v=${owner?.revision}`;
  return <div className="min-w-0 space-y-7">
    {!editOnly && active && <VisitorStats />}{editOnly && <><Link className="inline-flex min-h-11 items-center underline" href={pathForLocale("/dashboard/matchmaking", locale)}>{t("back")}</Link><h1 className="text-3xl font-semibold">{t("editCard")}</h1></>}
    {error && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p>{!owner && <button className={`${button} mt-3`} onClick={() => void loadOwner()}>{t("retry")}</button>}{retryPhoto && <button className={`${button} mt-3`} disabled={busy || conflict} onClick={() => void uploadPhoto(retryPhoto)}>{t("retryPhoto")}</button>}</div>}
    {notice && <p role="status" className="rounded-xl border border-dark/15 bg-white p-4 text-sm">{notice}</p>}
    {editOnly ? <section className="rounded-2xl border border-dark/15 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="mt-1 text-sm text-dark/65">{owner ? t(owner.visible ? "visible" : "notVisible") : t("loading")}</p></div><div className="flex flex-wrap gap-2">{owner?.visible && <button className={button} disabled={busy || conflict} onClick={() => void write("hide")}>{t("hide")}</button>}</div></div>
      {editing && draft && owner && <form className="mt-6 space-y-5" onSubmit={e => { e.preventDefault(); const parsed = cardDraftSchema.safeParse(draft); if (!parsed.success) { setError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("\n")); return; } setPreviewing(true); setConsent(false); }}>
        {company && <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">{locale === "zh-tw" ? "公開名稱（選填）" : "Public display name (optional)"}<input maxLength={100} className={input} value={draft.displayName || ""} onChange={e => update("displayName", e.target.value)} /></label>
          <label className="text-sm font-medium">{locale === "zh-tw" ? "公司名稱" : "Company name"}<input required maxLength={300} className={input} value={company.companyName} onChange={e => { setCompany({ ...company, companyName: e.target.value }); setPreviewing(false); }} /></label>
          <CountrySelect label={t("fields.country")} value={company.country} onChange={v => { setCompany({ ...company, country: v }); update("country", v); }} locale={locale} disabled={busy} />
          <label className="text-sm font-medium">{t("fields.industry")}<select className={input} value={company.industry} onChange={e => { setCompany({ ...company, industry: e.target.value }); update("industry", e.target.value); }}><option value="">{locale === "zh-tw" ? "選擇產業" : "Select industry"}</option>{company.industry && !INDUSTRY_LABELS[company.industry] && <option value={company.industry}>{industryLabel(company.industry, locale)}</option>}{Object.keys(INDUSTRY_LABELS).map(v => <option key={v} value={v}>{industryLabel(v, locale)}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2">{locale === "zh-tw" ? "一句話介紹" : "One-line pitch"}<input maxLength={500} className={input} value={company.oneLinePitch} onChange={e => { setCompany({ ...company, oneLinePitch: e.target.value }); setPreviewing(false); }} /></label>
          <label className="text-sm font-medium">{locale === "zh-tw" ? "公司階段" : "Company stage"}<select className={input} value={company.companyStage} onChange={e => { setCompany({ ...company, companyStage: e.target.value }); setPreviewing(false); }}><option value="">{locale === "zh-tw" ? "尚未設定" : "Not set"}</option>{company.companyStage && !COMPANY_STAGES.includes(company.companyStage as typeof COMPANY_STAGES[number]) && <option>{company.companyStage}</option>}{COMPANY_STAGES.map(v => <option key={v}>{v}</option>)}</select></label>
        </fieldset>}
        {owner.visible && <p className="text-sm font-medium">{t("visibleEditWarning")}</p>}
        <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="text-sm font-medium">{t("role")}<select className={input} value={draft.role} onChange={e => update("role", e.target.value as CardDraft["role"])}>{ROLES.map(role => <option key={role} value={role}>{t(`roles.${role}`)}</option>)}</select></label>
          {(["slogan", "offers"] as const).map(field => <label key={field} className="min-w-0 text-sm font-medium sm:col-span-2">{t(`fields.${field}`)}<textarea className={input} rows={2} maxLength={field === "slogan" ? 500 : 2000} value={draft[field]} onChange={e => update(field, e.target.value)} /></label>)}
        </fieldset>
        <details className="rounded-xl border border-dark/20 p-3"><summary className="flex min-h-11 cursor-pointer items-center justify-between text-sm font-semibold">{t("fields.looksFor")} · {draft.categories.length} ▾</summary><fieldset disabled={busy} className="grid gap-1 sm:grid-cols-2"><legend className="sr-only">{t("fields.looksFor")}</legend>{CATEGORIES.map(value => <label key={value} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={draft.categories.includes(value)} onChange={e => update("categories", e.target.checked ? [...draft.categories, value] : draft.categories.filter(v => v !== value))} />{t(`categories.${value}`)}</label>)}</fieldset></details>
        <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{locale === "zh-tw" ? "補充需求（選填）" : "Additional details (optional)"}</summary><textarea aria-label={locale === "zh-tw" ? "補充需求" : "Additional needs"} className={input} rows={3} maxLength={2000} value={draft.looksFor} onChange={e => update("looksFor", e.target.value)} /></details>
        <fieldset disabled={busy}><legend className="text-sm font-semibold">{t("visibilityLabel")}</legend><p className="mt-2 text-sm leading-6 text-dark/70">{t("privacy")}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{VISIBLE_FIELDS.filter(field => field !== "photo" && (!network?.enabled || field !== "stats")).map(field => <label key={field} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.visibleFields.includes(field)} onChange={e => update("visibleFields", e.target.checked ? [...draft.visibleFields, field] : draft.visibleFields.filter(v => v !== field))} />{field === "stage" ? (locale === "zh-tw" ? "公司階段" : "Company stage") : t(`fields.${field}`)}</label>)}</div></fieldset>
        <div className="border-t border-dark/10 pt-4">
          <h3 className="text-base font-semibold">{t("photoTitle")}</h3><p className="mt-2 text-sm leading-6 text-dark/70">{t("photoNotice")}</p>
          {owner.hasPhoto && <div className="mt-3 max-w-64"><PrivatePhoto url={`/api/matchmaking/me/photo?v=${owner.revision}`} alt={t("ownPhoto")} /><p className="mt-2 text-sm text-dark/70">{t("ownPhoto")}</p></div>}
          <label className="mt-4 block text-base font-medium">{t("upload")}<input type="file" className="mt-3 block min-h-12 w-full min-w-0 max-w-full text-base file:mr-3 file:min-h-12 file:rounded-lg file:border file:border-dark/20 file:bg-white file:px-4 file:py-2 file:text-lg file:font-semibold disabled:opacity-50" accept="image/jpeg,image/png,image/webp" disabled={!owner.id || busy || conflict} onChange={e => { const file = e.target.files?.[0]; if (file) void uploadPhoto(file); }} /></label>
          {uploadingPhoto && <p role="status" className="mt-3 text-sm">{t("uploadingPhoto")}</p>}
          {!owner.id && <p className="mt-2 text-sm text-dark/65">{t("saveBeforePhoto")}</p>}
          <label className="mt-4 flex min-h-12 items-center gap-3 text-base"><input type="checkbox" className="size-5 shrink-0" checked={draft.visibleFields.includes("photo")} disabled={busy || conflict} onChange={e => update("visibleFields", e.target.checked ? [...draft.visibleFields, "photo"] : draft.visibleFields.filter(field => field !== "photo" && (!network?.enabled || field !== "stats")))} />{t("sharePhoto")}</label>
          {owner.hasPhoto && !draft.visibleFields.includes("photo") && <p className="mt-2 text-sm text-dark/70">{t("photoHidden")}</p>}
        </div>
        <div className="flex flex-wrap gap-3"><Link className={`${button} inline-flex items-center`} href={pathForLocale("/dashboard/matchmaking", locale)}>{locale === "zh-tw" ? "取消" : "Cancel"}</Link>{!previewing && <button type="submit" className={`${button} bg-black! text-white!`} disabled={busy || conflict}>{t("preview")}</button>}</div>
        {previewing && preview && <div ref={previewRef} tabIndex={-1} className="space-y-4 rounded-xl border border-dark/20 p-4 focus-visible:outline-2"><h3 className="font-semibold">{t("anonymousPreview")}</h3>{owner.hasPhoto && !draft.visibleFields.includes("photo") && <p className="text-sm text-dark/70">{t("photoHidden")}</p>}<div className="max-w-lg"><CardView card={preview} detail /></div><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy || conflict} onClick={() => void write("save")}>{t(owner.visible ? "saveVisible" : "saveDraft")}</button>{!owner.visible && <><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />{t("consent")}</label><button type="button" className={`${button} bg-black! text-white!`} disabled={!consent || busy || conflict || (!network?.enabled && draft.role === "founder" && owner.stats.interviews < 3)} onClick={() => void write("publish")}>{t("publish")}</button></>}</div></div>}
      </form>}
      {!editing && preview && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{t("preview")}</summary><div className="mt-3 max-w-lg space-y-3">{owner?.hasPhoto && !owner.draft.visibleFields.includes("photo") && <p className="text-sm text-dark/70">{t("photoHidden")}</p>}<CardView card={preview} detail /></div></details>}
      {conflict && <div className="mt-5 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm">{t("conflict")}</p><button className={button} onClick={() => void compareLatest()}>{t("loadLatest")}</button>{latest && <><dl className="space-y-2 text-sm"><div><dt>{locale === "zh-tw" ? "最新公司資料" : "Latest company details"}</dt><dd className="whitespace-pre-wrap">{[latest.source?.companyName, latest.source?.oneLinePitch, latest.source?.country, latest.source?.industry, latest.source?.companyStage].filter(Boolean).join(" · ")}</dd></div><div><dt>{t("latestVisibility")}</dt><dd>{t(latest.visible ? "visible" : "notVisible")}</dd></div>{(["role", "country", "industry", "slogan", "offers", "looksFor", "categories", "visibleFields"] as const).map(field => <div key={field}><dt className="font-semibold">{field === "role" ? t("role") : field === "categories" ? t("categoriesLabel") : field === "visibleFields" ? t("visibilityLabel") : t(`fields.${field}`)}</dt><dd className="whitespace-pre-wrap break-words">{Array.isArray(latest.draft[field]) ? latest.draft[field].join(" · ") : latest.draft[field]}</dd></div>)}</dl><button className={button} onClick={() => { setOwner(latest); setConflict(false); setLatest(null); setPreviewing(false); setConsent(false); setNotice(t("reviewAgain")); }}>{t("keepMine")}</button></>}</div>}
    </section> : <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{owner ? t(owner.visible ? "visible" : "notVisible") : t("loading")}</p><Link className="inline-flex min-h-11 items-center text-sm font-semibold underline" href={pathForLocale("/dashboard/matchmaking/me/edit", locale)}>{t("editCard")} →</Link></div>}
    {editOnly && network?.enabled && <ViewerPrivacySettings />}
    {!editOnly && <>
    <div className="flex flex-wrap gap-2" aria-label={locale === "zh-tw" ? "推薦模式" : "Member view"}>{["recommendations", "all"].map(v => <button key={v} type="button" className={`${button} ${view === v ? "bg-black! text-white!" : ""}`} aria-pressed={view === v} onClick={() => { setView(v); setPage(1); }}>{v === "recommendations" ? (locale === "zh-tw" ? "推薦給你" : "Recommendations") : (locale === "zh-tw" ? "所有會員" : "All members")}</button>)}</div>
    <nav aria-label={t("role")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{["all", ...ROLES].map(v => <button key={v} className={`min-h-20 rounded-2xl border px-4 py-5 text-sm font-semibold focus-visible:outline-2 ${role === v ? "border-black bg-black text-white" : "border-dark/15 bg-white"}`} aria-pressed={role === v} onClick={() => { setRole(v); setPage(1); }}>{v === "all" ? (locale === "zh-tw" ? "全部" : "All") : t(`roles.${v}`)}</button>)}</nav>
    <form className="space-y-4 rounded-2xl border border-dark/15 bg-white p-5" role="search" onSubmit={e => { e.preventDefault(); setPage(1); setQ(query.trim()); track("flow_start", { feature: "matchmaking" }); }}>
      <div className="flex gap-3"><label className="min-w-0 flex-1"><span className="sr-only">{locale === "zh-tw" ? "搜尋公開公司卡片" : "Search public company cards"}</span><input type="search" maxLength={100} className={`${input} mt-0! min-h-11`} value={query} onChange={e => setQuery(e.target.value)} placeholder={locale === "zh-tw" ? "搜尋公司、簡介或需求…" : "Search company, pitch or needs…"} /></label><button className={`${button} bg-black! text-white!`} type="submit">{locale === "zh-tw" ? "搜尋" : "Search"}</button></div>
      <div className="grid items-end gap-4 sm:grid-cols-3"><CountrySelect label={t("fields.country")} value={country} onChange={v => { setCountry(v); setPage(1); }} locale={locale} /><label className="text-sm font-semibold">{t("fields.industry")}<select className={`${input} min-h-11`} value={industry} onChange={e => { setIndustry(e.target.value); setPage(1); }}><option value="">{locale === "zh-tw" ? "全部產業" : "All industries"}</option>{Object.keys(INDUSTRY_LABELS).map(v => <option key={v} value={v}>{industryLabel(v, locale)}</option>)}</select></label><label className="text-sm font-semibold">{t("fields.looksFor")}<select className={`${input} min-h-11`} value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>{["all", ...CATEGORIES].map(v => <option value={v} key={v}>{v === "all" ? (locale === "zh-tw" ? "所有需求" : "All needs") : t(`categories.${v}`)}</option>)}</select></label></div>
      {(q || country || industry || category !== "all" || role !== "all") && <button type="button" className={button} onClick={() => { setQ(""); setQuery(""); setCountry(""); setIndustry(""); setRole("all"); setCategory("all"); setPage(1); }}>{locale === "zh-tw" ? "清除篩選" : "Clear filters"}</button>}
    </form>
    {listError && <div role="alert" className="whitespace-pre-wrap break-words rounded-xl bg-red-50 p-4 text-sm text-red-800"><p>{listError}</p>{network?.enabled && !network.network && <Link className={`${button} mt-3 inline-flex items-center`} href={pathForLocale("/dashboard/account#plan", locale)}>{locale === "zh-tw" ? "查看會員網絡方案" : "View network plans"}</Link>}<button className={`${button} mt-3`} onClick={() => void loadList()}>{t("retry")}</button></div>}
    {!listing ? !listError && <p role="status" className="text-sm">{t("loading")}</p> : listing.cards.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{listing.cards.map(card => <div key={card.id} className="flex min-w-0 flex-col"><CardView card={card} /><div className="mt-3"><CardChatAction key={JSON.stringify(card.chat)} card={card} network={network} /></div><Link className={`${button} mt-2 inline-flex items-center`} href={pathForLocale(`/dashboard/matchmaking/${card.id}`, locale)}>{locale === "zh-tw" ? "為何適合交流？" : "Why this match"} →</Link></div>)}</div> : <p className="rounded-2xl border border-dark/15 bg-white p-8 text-sm text-dark/70">{t("empty")}</p>}
    <div className="flex items-center gap-3"><button className={button} disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t("previous")}</button><span className="text-sm">{page}</span><button className={button} disabled={!listing?.hasMore} onClick={() => setPage(p => p + 1)}>{t("next")}</button></div>
    </>}
  </div>;
}
