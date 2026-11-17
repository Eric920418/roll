"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import type { LegacyOrganizeView, OrganizeData } from "@/lib/action-plan/legacy-organize";
import { flowDataSchema } from "@/lib/action-plan/flow/catalog";
import { memberFetch, MemberFetchError } from "@/lib/member-fetch";
import OrganizeWork, { type ParticipantLink } from "./flow/OrganizeWork";

const button = "min-h-11 rounded-full border border-dark/15 px-5 py-2 text-sm font-semibold disabled:opacity-50";
export default function LegacyOrganizeWork({ userId, action, plan, busy, onChanged }: { userId: string; action: ActionPlanActionDto; plan: ActionPlanDto; busy: boolean; onChanged(plan: ActionPlanDto | null): void }) {
  const locale = useLocale(), zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const [view, setView] = useState<LegacyOrganizeView | null>(null), [draft, setDraft] = useState<OrganizeData | null>(null), [revision, setRevision] = useState(plan.revision || 0);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [saving, setSaving] = useState(false), [conflict, setConflict] = useState(false), [links, setLinks] = useState<ParticipantLink[]>([]);
  const dirty = useRef(false), sending = useRef(false), request = useRef(0), key = `nova:legacy-organize:${userId}:${action.id}`;
  const load = useCallback(async (compare = false) => {
    const version = ++request.current;
    try {
      const next = await memberFetch<{ organize: LegacyOrganizeView }>(`/api/customer-insights?actionId=${encodeURIComponent(action.id)}&scope=plan&locale=${zh ? "zh-tw" : "en"}`);
      if (version !== request.current) return;
      if (!next.organize) throw new Error(w("無法載入本任務，請重試。", "This task could not be loaded. Retry."));
      const value = next.organize; setView(value);
      if (!dirty.current) {
        let data = value.data, version = value.revision;
        if (!action.done) try { const cache = JSON.parse(localStorage.getItem(key) || "null"), parsed = flowDataSchema.safeParse(cache?.data); if (parsed.success && parsed.data.kind === "organize" && Number.isInteger(cache.revision)) { data = parsed.data; version = cache.revision; dirty.current = true; setNotice(w("已恢復未儲存草稿。", "Unsaved draft restored.")); } } catch { setNotice(w("草稿無法恢復；伺服器紀錄保留。", "Draft unavailable; server records retained.")); }
        setDraft(data); setRevision(version);
      } else if (compare) { setRevision(value.revision); setConflict(false); setNotice(w("已更新版本並保留草稿。請比對下方已儲存內容後再儲存。", "Version updated; draft retained. Compare the saved version below before saving.")); }
      setError("");
    } catch (cause) { if (version === request.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    // The local wording helper has no independent state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id, action.done, key, zh]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, plan.revision]);
  function change(data: OrganizeData) {
    dirty.current = true; setDraft(data); setNotice(""); setLinks([]);
    try { localStorage.setItem(key, JSON.stringify({ data, revision })); } catch { setNotice(w("草稿無法暫存，離開前請儲存。", "Draft storage unavailable; save before leaving.")); }
  }
  async function mutate(body: object) {
    if (sending.current) return; sending.current = true; setSaving(true); setError("");
    try {
      const next = await memberFetch<ActionPlanDto & { confirmationLinks?: ParticipantLink[] }>(`/api/action-plans/actions/${action.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, ...body }) });
      dirty.current = false; setConflict(false); setRevision(next.revision || 0); onChanged(next);
      if (next.confirmationLinks) setLinks(next.confirmationLinks.map(l => ({ ...l, href: new URL(l.href, window.location.origin).href })));
      try { localStorage.removeItem(key); } catch { setNotice(w("已儲存，但本機草稿未清除。", "Saved, but local draft cleanup failed.")); }
      await load(); setNotice(w("已儲存。完成仍需確認，不會因儲存自動入帳。", "Saved. Completion still requires confirmation."));
    } catch (cause) { if (cause instanceof MemberFetchError && cause.status === 409) setConflict(true); setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { sending.current = false; setSaving(false); }
  }
  const disabled = busy || saving || action.dependency.blocked, readOnly = action.done;
  const unsaved = Boolean(draft && view && JSON.stringify(draft) !== JSON.stringify(view.data));
  return <div className="space-y-5" data-legacy-organize>
    {error && <div role="alert" className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p className="whitespace-pre-wrap break-words">{error}</p><button type="button" disabled={saving} className={button} onClick={() => void load(conflict)}>{conflict ? w("更新版本（保留草稿）", "Update version; keep draft") : w("重新載入", "Retry")}</button></div>}
    {!view || !draft ? !error && <p role="status">{w("載入任務紀錄中…", "Loading saved work…")}</p> : <>
      <OrganizeWork step={view.step} data={draft} view={{ ...view, steps: [{ id: view.step, data: view.data }] }} locale={locale} disabled={disabled} readOnly={readOnly} onChange={change} onSave={data => void mutate({ organizeData: data || draft })} onLinks={(ids, save) => void mutate({ ...(save ? { organizeData: draft } : {}), confirmationRecipients: ids })} links={links} onRefresh={() => void load()} notice={notice} />
      {!readOnly && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark/10 p-4"><p className="text-sm">{view.result.current} / {view.result.target} {w("已確認", "confirmed")}</p><button type="button" disabled={disabled || unsaved || !view.result.ready} className={button + " bg-black text-white"} onClick={() => void mutate({ done: true })}>{w("確認並完成", "Confirm and complete")}</button>{!view.result.ready && <p className="w-full whitespace-pre-wrap text-xs text-dark/60">{view.result.reasons.join("；")}</p>}</div>}
      {readOnly && <button type="button" disabled={busy || saving} className={button} onClick={() => void mutate({ done: false })}>{w("撤銷完成（保留紀錄與積分）", "Undo completion; retain records and points")}</button>}
      {notice && unsaved && <details className="rounded-xl border p-4 text-sm"><summary className="min-h-11 cursor-pointer">{w("比對伺服器已儲存內容", "Compare the saved version")}</summary><p className="whitespace-pre-wrap">{Object.values(view.data.values).join("\n")}</p>{view.data.criteria.map(c => <p key={c.id}>{c.label} · {c.weight}%</p>)}</details>}
    </>}
    {action.taskWorkspace && <details className="rounded-xl border border-dark/10 p-4 text-sm"><summary className="min-h-11 cursor-pointer py-2">{w("原有工作紀錄（保留）", "Original saved work (retained)")}</summary>{action.taskWorkspace.kind === "positioning" ? <div className="whitespace-pre-wrap">{[action.taskWorkspace.who, action.taskWorkspace.pain, action.taskWorkspace.outcome, action.taskWorkspace.how, action.taskWorkspace.reaction].map((v, i) => <p key={i}>{v}</p>)}</div> : action.taskWorkspace.kind === "scorecard" && action.taskWorkspace.criteria.map(c => <p key={c.id}>{c.criterion} · {c.weight}/5 · {c.fit}</p>)}</details>}
  </div>;
}
