"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BOTTLENECKS, COMPANY_STAGES, type BottleneckGroup } from "@/lib/action-plan/constants";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import { formatActionTime } from "@/lib/action-plan/time";
import ActionPlanBuilder from "./ActionPlanBuilder";

type Filter = "ready" | "blocked" | "done" | "all";

export default function ActionPlanManager({ initialPlan }: { initialPlan: ActionPlanDto | null }) {
  const t = useTranslations("Dashboard.actionPlan");
  const [plan, setPlan] = useState(initialPlan);
  const [filter, setFilter] = useState<Filter>("ready");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ActionPlanActionDto | "new" | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setPlan(initialPlan), [initialPlan]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (plan?.actions ?? []).filter((action) => {
      const matchesSearch = !query || `${action.title} ${action.expectedOutcome.text}`.toLocaleLowerCase().includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "done" && action.done) ||
        (filter === "blocked" && !action.done && action.dependency.blocked) ||
        (filter === "ready" && !action.done && !action.dependency.blocked);
      return matchesSearch && matchesFilter;
    });
  }, [filter, plan?.actions, search]);

  async function mutate(id: string, body: object) {
    setPending(id);
    setError("");
    try {
      const response = await fetch(`/api/action-plans/actions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || t("errors.save"));
      setPlan(json.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.save"));
    } finally {
      setPending("");
    }
  }

  async function remove(action: ActionPlanActionDto) {
    if (!window.confirm(t("deleteConfirm", { title: action.title }))) return;
    setPending(action.id);
    setError("");
    try {
      const response = await fetch(`/api/action-plans/actions/${action.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || t("errors.delete"));
      setPlan(json.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.delete"));
    } finally {
      setPending("");
    }
  }

  if (!plan) {
    return (
      <section className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-[#fffdf8]">
        <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">NOVA action plan</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("empty.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-dark/60">{t("empty.body")}</p>
          </div>
          <ActionPlanBuilder />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-dark text-white">
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{t("diagnosis.eyebrow")}</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.03em] font-[family-name:var(--font-heading)]">
              {plan.diagnosis.companyStage} · {plan.diagnosis.bottleneckGroup}
            </h2>
            <div className="mt-4 grid gap-3 text-sm text-white/70 sm:grid-cols-2">
              <p className="rounded-xl bg-white/[0.06] p-4">
                <strong className="block text-xs uppercase tracking-[0.12em] text-white/45">{t("diagnosis.stage")}</strong>
                <span className="mt-2 block leading-6">{plan.diagnosis.stageReason}</span>
                <span className="mt-2 block text-xs text-accent">{t("confidence", { value: plan.diagnosis.stageConfidence })}</span>
              </p>
              <p className="rounded-xl bg-white/[0.06] p-4">
                <strong className="block text-xs uppercase tracking-[0.12em] text-white/45">{t("diagnosis.bottleneck")}</strong>
                <span className="mt-2 block leading-6">{plan.diagnosis.bottleneckReason}</span>
                <span className="mt-2 block text-xs text-accent">{t("confidence", { value: plan.diagnosis.bottleneckConfidence })}</span>
              </p>
            </div>
          </div>
          <ActionPlanBuilder variant="regenerate" onGenerated={() => setEditing(null)} />
        </div>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("next.eyebrow")}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("next.title")}</h2>
          </div>
          <p className="text-xs text-dark/50">{t("next.rule")}</p>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {plan.nextMoves.map((action) => <TopMove key={action.id} action={action} t={t} onEdit={() => setEditing(action)} />)}
          {Array.from({ length: Math.max(0, 3 - plan.nextMoves.length) }, (_, index) => (
            <div key={index} className="rounded-2xl border border-dashed border-dark/15 bg-white/40 p-5 text-sm text-dark/45">
              {t("next.unavailable")}
            </div>
          ))}
        </div>
        {plan.nextMoves.length < 3 && plan.blockers.length > 0 && (
          <div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-bold">{t("next.blockedNote")}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {plan.blockers.map((blocker) => <li key={blocker.id}>{blocker.title}: {blocker.dependencies.join(", ")}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-[1.75rem] border border-dark/10 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("complete.eyebrow")}</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.03em] text-dark font-[family-name:var(--font-heading)]">{t("complete.title", { count: plan.actions.length })}</h2>
          </div>
          <button type="button" onClick={() => setEditing("new")} className="min-h-11 rounded-xl bg-dark px-5 py-2.5 text-sm font-bold text-white hover:bg-dark/90">
            {t("add")}
          </button>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="min-w-0 flex-1 text-sm font-bold text-dark">
            <span className="sr-only">{t("search")}</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search")} className="min-h-11 w-full rounded-xl border border-dark/15 px-4 text-sm font-normal outline-none focus:border-primary" />
          </label>
          <div className="flex flex-wrap gap-2" aria-label={t("filter.label")}>
            {(["ready", "blocked", "done", "all"] as const).map((value) => (
              <button key={value} type="button" onClick={() => setFilter(value)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${filter === value ? "border-primary bg-primary text-white" : "border-dark/10 bg-white text-dark/60"}`}>
                {t(`filter.${value}`)}
              </button>
            ))}
          </div>
        </div>

        {error && <div role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="mt-5 flex flex-col gap-3">
          {filtered.map((action) => (
            <details id={`action-${action.id}`} key={action.id} style={{ contentVisibility: "auto" }} className="group scroll-mt-24 rounded-2xl border border-dark/10 bg-[#fffdf8] open:border-primary/25">
              <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 p-4 sm:items-center">
                <button
                  type="button"
                  onClick={(event) => { event.preventDefault(); void mutate(action.id, { done: !action.done }); }}
                  disabled={pending === action.id}
                  aria-label={action.done ? t("undo") : t("completeAction")}
                  className={`flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border text-base font-bold ${action.done ? "border-green-500 bg-green-500 text-white" : "border-dark/15 bg-white text-dark/35 hover:border-primary hover:text-primary"}`}
                >
                  {action.done ? "✓" : action.rank ?? "·"}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`font-bold text-dark font-[family-name:var(--font-heading)] ${action.done ? "line-through opacity-50" : ""}`}>{action.title}</h3>
                    <StatusBadge action={action} t={t} />
                  </div>
                  <p className="mt-1 text-sm text-dark/55">{action.expectedOutcome.text}</p>
                </div>
                <div className="text-right">
                  <strong className="block text-lg text-primary">{action.priorityScore.toFixed(2)}</strong>
                  <span className="text-[10px] uppercase tracking-[0.1em] text-dark/35">{t("score")}</span>
                </div>
              </summary>
              <div className="border-t border-dark/10 px-4 pb-5 pt-4">
                <DimensionGrid action={action} t={t} />
                {action.dependency.blocked && (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {t("blockedBy")}: {action.dependency.actionTitles.join(", ")}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditing(action)} className="min-h-11 rounded-xl border border-dark/15 bg-white px-4 text-sm font-bold text-dark hover:border-primary">{t("edit")}</button>
                  <button type="button" onClick={() => void remove(action)} disabled={pending === action.id} className="min-h-11 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">{t("delete")}</button>
                </div>
              </div>
            </details>
          ))}
          {filtered.length === 0 && <p className="rounded-2xl border border-dashed border-dark/15 px-5 py-8 text-center text-sm text-dark/45">{t("noResults")}</p>}
        </div>
      </section>

      {editing && (
        <ActionEditor
          action={editing === "new" ? null : editing}
          plan={plan}
          onClose={() => setEditing(null)}
          onSaved={(nextPlan) => { setPlan(nextPlan); setEditing(null); setError(""); }}
        />
      )}
    </section>
  );
}

function TopMove({ action, t, onEdit }: { action: ActionPlanActionDto; t: ReturnType<typeof useTranslations>; onEdit: () => void }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-primary/20 bg-[#fffdf8] p-5 shadow-[0_12px_35px_rgba(32,37,50,0.06)]">
      <div className="absolute right-0 top-0 rounded-bl-2xl bg-accent px-4 py-2 text-sm font-black text-dark">#{action.rank}</div>
      <p className="pr-12 text-xs font-bold uppercase tracking-[0.12em] text-primary">{t("score")} {action.priorityScore.toFixed(2)}</p>
      <h3 className="mt-2 pr-10 text-lg font-extrabold leading-6 text-dark font-[family-name:var(--font-heading)]">{action.title}</h3>
      <p className="mt-2 text-sm leading-6 text-dark/60">{action.expectedOutcome.text}</p>
      <DimensionGrid action={action} t={t} compact />
      <button type="button" onClick={onEdit} className="mt-4 min-h-11 w-full rounded-xl border border-primary/20 bg-white text-sm font-bold text-primary hover:bg-primary/[0.04]">{t("edit")}</button>
    </article>
  );
}

function StatusBadge({ action, t }: { action: ActionPlanActionDto; t: ReturnType<typeof useTranslations> }) {
  const status = action.done ? "done" : action.dependency.blocked ? "blocked" : "ready";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${status === "ready" ? "bg-green-100 text-green-700" : status === "blocked" ? "bg-amber-100 text-amber-800" : "bg-dark/10 text-dark/50"}`}>{t(`filter.${status}`)}</span>;
}

function DimensionGrid({ action, t, compact = false }: { action: ActionPlanActionDto; t: ReturnType<typeof useTranslations>; compact?: boolean }) {
  const locale = useLocale() === "zh-tw" ? "zh-tw" : "en";
  const cells = [
    [t("fields.impact"), `${action.impact.label} · ${action.impact.weight}`],
    [t("fields.urgency"), `${action.urgency.type}${action.urgency.days ? ` · ${action.urgency.days}d` : ""}`],
    [t("fields.dependency"), `${action.dependency.level} · ${action.dependency.resolved ? t("resolved") : t("unresolved")}`],
    [t("fields.difficulty"), `${action.difficulty.level} · ${formatActionTime(action.difficulty.actionTime, locale)}`],
    [t("fields.companyStage"), `${action.companyStage} · ${action.stageFit.score}/5`],
    [t("fields.bottleneck"), `${action.bottleneck.group} · ${action.bottleneck.label} · ${action.bottleneckFit.score}/5`],
    [t("fields.expectedOutcome"), action.expectedOutcome.category],
    [t("fields.estimatedTime"), `${action.expectedOutcome.estimatedTime.minDays}–${action.expectedOutcome.estimatedTime.maxDays}d`],
  ];
  return (
    <dl className={`grid gap-2 ${compact ? "mt-4 grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-xl bg-dark/[0.035] px-3 py-2.5">
          <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-dark/40">{label}</dt>
          <dd className="mt-1 text-xs font-semibold leading-5 text-dark/75">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

type Draft = {
  title: string; impact: "Critical" | "High" | "Medium" | "Low"; urgencyType: "immediate" | "urgent" | "scheduled"; urgencyDays: string;
  dependencyLevel: string; dependencyNotes: string; dependencyActionIds: string[]; difficulty: string; actionMin: string; actionMax: string;
  companyStage: string; stageFit: string; stageFitReason: string; bottleneckGroup: BottleneckGroup; bottleneckCode: string;
  bottleneckFit: string; bottleneckFitReason: string; outcomeCategory: string; expectedOutcome: string; outcomeMin: string; outcomeMax: string;
};

function ActionEditor({ action, plan, onClose, onSaved }: { action: ActionPlanActionDto | null; plan: ActionPlanDto; onClose: () => void; onSaved: (plan: ActionPlanDto) => void }) {
  const t = useTranslations("Dashboard.actionPlan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft>(() => action ? {
    title: action.title, impact: action.impact.label as Draft["impact"], urgencyType: action.urgency.type, urgencyDays: String(action.urgency.days ?? 3),
    dependencyLevel: String(action.dependency.level), dependencyNotes: action.dependency.notes ?? "", dependencyActionIds: action.dependency.actionIds,
    difficulty: String(action.difficulty.level), actionMin: String(action.difficulty.actionTime.minMinutes), actionMax: String(action.difficulty.actionTime.maxMinutes),
    companyStage: action.companyStage, stageFit: String(action.stageFit.score), stageFitReason: action.stageFit.reason,
    bottleneckGroup: action.bottleneck.group as BottleneckGroup, bottleneckCode: action.bottleneck.code,
    bottleneckFit: String(action.bottleneckFit.score), bottleneckFitReason: action.bottleneckFit.reason,
    outcomeCategory: action.expectedOutcome.category, expectedOutcome: action.expectedOutcome.text,
    outcomeMin: String(action.expectedOutcome.estimatedTime.minDays), outcomeMax: String(action.expectedOutcome.estimatedTime.maxDays),
  } : {
    title: "", impact: "High", urgencyType: "urgent", urgencyDays: "3", dependencyLevel: "0", dependencyNotes: "", dependencyActionIds: [],
    difficulty: "2", actionMin: "30", actionMax: "60", companyStage: plan.diagnosis.companyStage, stageFit: "4", stageFitReason: "",
    bottleneckGroup: plan.diagnosis.bottleneckGroup as BottleneckGroup, bottleneckCode: plan.diagnosis.bottleneckCode,
    bottleneckFit: "4", bottleneckFitReason: "", outcomeCategory: "custom", expectedOutcome: "", outcomeMin: "1", outcomeMax: "7",
  });
  const choices = BOTTLENECKS[draft.bottleneckGroup];

  function set<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((current) => ({ ...current, [key]: value })); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      title: draft.title,
      impact: draft.impact,
      urgencyType: draft.urgencyType,
      urgencyDays: draft.urgencyType === "scheduled" ? Number(draft.urgencyDays) : null,
      dependencyLevel: Number(draft.dependencyLevel),
      dependencyNotes: draft.dependencyNotes.trim() || null,
      dependencyActionIds: Number(draft.dependencyLevel) === 0 ? [] : draft.dependencyActionIds,
      difficulty: Number(draft.difficulty),
      actionTime: { minMinutes: Number(draft.actionMin), maxMinutes: Number(draft.actionMax) },
      companyStage: draft.companyStage,
      stageFit: { score: Number(draft.stageFit), reason: draft.stageFitReason, confidence: null },
      bottleneckGroup: draft.bottleneckGroup,
      bottleneckCode: draft.bottleneckCode,
      bottleneckFit: { score: Number(draft.bottleneckFit), reason: draft.bottleneckFitReason, confidence: null },
      outcomeCategory: draft.outcomeCategory,
      expectedOutcome: draft.expectedOutcome,
      outcomeTime: { min: Number(draft.outcomeMin), max: Number(draft.outcomeMax) },
    };
    try {
      const response = await fetch(action ? `/api/action-plans/actions/${action.id}` : "/api/action-plans/actions", {
        method: action ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || t("errors.save"));
      onSaved(json.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("errors.save"));
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-2 min-h-11 w-full rounded-xl border border-dark/15 bg-white px-3 text-sm font-normal outline-none focus:border-primary";
  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-dark/45 p-3 backdrop-blur-sm lg:items-center lg:p-6">
      <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="action-editor-title" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[1.75rem] bg-[#fffdf8] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">8 core dimensions</p><h2 id="action-editor-title" className="mt-1 text-2xl font-extrabold text-dark">{action ? t("editor.editTitle") : t("editor.addTitle")}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("builder.close")} className="min-h-11 min-w-11 rounded-full border border-dark/10 text-xl text-dark/50">×</button>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Field label={t("fields.actionName")}><input required maxLength={200} value={draft.title} onChange={(e) => set("title", e.target.value)} className={input} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.impact")}><select value={draft.impact} onChange={(e) => set("impact", e.target.value as Draft["impact"])} className={input}>{["Critical", "High", "Medium", "Low"].map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label={t("fields.urgency")}><select value={draft.urgencyType} onChange={(e) => set("urgencyType", e.target.value as Draft["urgencyType"])} className={input}>{["immediate", "urgent", "scheduled"].map(v => <option key={v} value={v}>{t(`urgency.${v}`)}</option>)}</select></Field>
              {draft.urgencyType === "scheduled" && <Field label={t("fields.urgencyDays")}><input type="number" min="1" max="365" required value={draft.urgencyDays} onChange={(e) => set("urgencyDays", e.target.value)} className={input} /></Field>}
              <Field label={t("fields.dependency")}><select value={draft.dependencyLevel} onChange={(e) => set("dependencyLevel", e.target.value)} className={input}>{[0,1,2,3].map(v => <option key={v} value={v}>{v} · {t(`dependency.${v}`)}</option>)}</select></Field>
              <Field label={t("fields.difficulty")}><select value={draft.difficulty} onChange={(e) => set("difficulty", e.target.value)} className={input}>{[1,2,3,4,5].map(v => <option key={v} value={v}>{v} · {t(`difficulty.${v}`)}</option>)}</select></Field>
              <Field label={t("fields.actionTimeMin")}><input type="number" min="15" step="15" required value={draft.actionMin} onChange={(e) => set("actionMin", e.target.value)} className={input} /></Field>
              <Field label={t("fields.actionTimeMax")}><input type="number" min="15" step="15" required value={draft.actionMax} onChange={(e) => set("actionMax", e.target.value)} className={input} /></Field>
            </div>
            <Field label={t("fields.dependencyNotes")}><textarea rows={3} maxLength={1000} value={draft.dependencyNotes} onChange={(e) => set("dependencyNotes", e.target.value)} className={`${input} py-3`} /></Field>
            {Number(draft.dependencyLevel) > 0 && <fieldset><legend className="text-sm font-bold text-dark">{t("fields.dependsOn")}</legend><div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-dark/10 bg-white p-2">{plan.actions.filter(item => item.id !== action?.id).map(item => <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-dark/[0.03]"><input type="checkbox" checked={draft.dependencyActionIds.includes(item.id)} onChange={(e) => set("dependencyActionIds", e.target.checked ? [...draft.dependencyActionIds, item.id] : draft.dependencyActionIds.filter(id => id !== item.id))} />{item.title}</label>)}</div></fieldset>}
          </div>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.companyStage")}><select value={draft.companyStage} onChange={(e) => set("companyStage", e.target.value)} className={input}>{COMPANY_STAGES.map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label={t("fields.stageFit")}><select value={draft.stageFit} onChange={(e) => set("stageFit", e.target.value)} className={input}>{[1,2,3,4,5].map(v => <option key={v}>{v}</option>)}</select></Field>
            </div>
            <Field label={t("fields.stageFitReason")}><textarea required minLength={3} maxLength={600} rows={3} value={draft.stageFitReason} onChange={(e) => set("stageFitReason", e.target.value)} className={`${input} py-3`} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fields.bottleneckGroup")}><select value={draft.bottleneckGroup} onChange={(e) => { const group = e.target.value as BottleneckGroup; setDraft(current => ({...current, bottleneckGroup: group, bottleneckCode: BOTTLENECKS[group][0][0]})); }} className={input}>{Object.keys(BOTTLENECKS).map(v => <option key={v}>{v}</option>)}</select></Field>
              <Field label={t("fields.bottleneckFit")}><select value={draft.bottleneckFit} onChange={(e) => set("bottleneckFit", e.target.value)} className={input}>{[1,2,3,4,5].map(v => <option key={v}>{v}</option>)}</select></Field>
            </div>
            <Field label={t("fields.bottleneck")}><select value={draft.bottleneckCode} onChange={(e) => set("bottleneckCode", e.target.value)} className={input}>{choices.map(([code,label]) => <option key={code} value={code}>{draft.bottleneckGroup} · {label}</option>)}</select></Field>
            <Field label={t("fields.bottleneckFitReason")}><textarea required minLength={3} maxLength={600} rows={3} value={draft.bottleneckFitReason} onChange={(e) => set("bottleneckFitReason", e.target.value)} className={`${input} py-3`} /></Field>
            <Field label={t("fields.expectedOutcome")}><textarea required minLength={3} maxLength={1000} rows={3} value={draft.expectedOutcome} onChange={(e) => set("expectedOutcome", e.target.value)} className={`${input} py-3`} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("fields.outcomeCategory")}><select value={draft.outcomeCategory} onChange={(e) => set("outcomeCategory", e.target.value)} className={input}>{["revenue","customers","product","fundraising","expansion","custom"].map(v => <option key={v} value={v}>{t(`outcome.${v}`)}</option>)}</select></Field>
              <Field label={t("fields.outcomeTimeMin")}><input type="number" min="0" required value={draft.outcomeMin} onChange={(e) => set("outcomeMin", e.target.value)} className={input} /></Field>
              <Field label={t("fields.outcomeTimeMax")}><input type="number" min="1" required value={draft.outcomeMax} onChange={(e) => set("outcomeMax", e.target.value)} className={input} /></Field>
            </div>
          </div>
        </div>
        <p className="mt-5 rounded-xl bg-primary/[0.05] px-4 py-3 text-xs leading-5 text-dark/60">{t("editor.fitHint")}</p>
        {error && <div role="alert" className="mt-4 whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-dark/15 px-5 text-sm font-bold text-dark">{t("cancel")}</button><button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-primary px-6 text-sm font-bold text-white disabled:opacity-50">{busy ? t("saving") : t("save")}</button></div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold text-dark">{label}{children}</label>; }
