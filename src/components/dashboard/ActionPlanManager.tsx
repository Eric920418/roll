"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BOTTLENECKS, COMPANY_STAGES, type BottleneckGroup } from "@/lib/action-plan/constants";
import type { ActionPlanActionDto } from "@/lib/action-plan/ranking";
import type { ActionPlanDto } from "@/lib/action-plan/service";
import ActionPlanBuilder from "./ActionPlanBuilder";

export function ActionDiagnosis({ plan }: { plan: ActionPlanDto }) {
  const t = useTranslations("Dashboard.actionPlan");
  return <details className="rounded-2xl border border-dark/10 bg-white p-5">
    <summary className="min-h-11 cursor-pointer text-lg font-bold">{t("diagnosis.eyebrow")}</summary>
    <div className="mt-3 space-y-4">
      <p className="font-bold">{plan.diagnosis.companyStage} · {plan.diagnosis.bottleneckGroup}</p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold">{t("diagnosis.stage")}</dt><dd className="mt-2 whitespace-pre-wrap text-dark/65">{plan.diagnosis.stageReason}</dd></div>
        <div><dt className="font-semibold">{t("diagnosis.bottleneck")}</dt><dd className="mt-2 whitespace-pre-wrap text-dark/65">{plan.diagnosis.bottleneckReason}</dd></div>
      </dl>
      <ActionPlanBuilder variant="regenerate" />
    </div>
  </details>;
}

export default function ActionPlanManager({ initialPlan, guided = false }: { guided?: boolean; initialPlan: ActionPlanDto | null; onChanged?: (plan: ActionPlanDto | null) => void }) {
  const t = useTranslations("Dashboard.actionPlan");
  if (initialPlan) return <ActionDiagnosis plan={initialPlan} />;
  return <section className="rounded-2xl border border-dark/15 bg-white p-5 sm:p-7">
    <h2 className="text-xl font-bold">{t("empty.title")}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-dark/60">{t("empty.body")}</p>
    <div className="mt-4"><ActionPlanBuilder autoOpen={guided} /></div>
  </section>;
}

type Draft = {
  title: string; impact: "Critical" | "High" | "Medium" | "Low"; urgencyType: "immediate" | "urgent" | "scheduled"; urgencyDays: string;
  dependencyLevel: string; dependencyNotes: string; dependencyActionIds: string[]; difficulty: string; actionMin: string; actionMax: string;
  companyStage: string; stageFit: string; stageFitReason: string; bottleneckGroup: BottleneckGroup; bottleneckCode: string;
  bottleneckFit: string; bottleneckFitReason: string; outcomeCategory: string; expectedOutcome: string; outcomeMin: string; outcomeMax: string;
};

export function ActionEditor({ action, plan, onClose, onSaved }: { action: ActionPlanActionDto | null; plan: ActionPlanDto; onClose: () => void; onSaved: (plan: ActionPlanDto) => void }) {
  const t = useTranslations("Dashboard.actionPlan");
  const [baseRevision] = useState(plan.revision);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>("input")?.focus();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
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
        body: JSON.stringify({ ...payload, revision: baseRevision }),
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
    <dialog ref={dialogRef} aria-labelledby="action-editor-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose} className="nova-theme fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-5xl overflow-y-auto rounded-[1.75rem] border-0 bg-white p-0 shadow-2xl backdrop:bg-black/45">
      <form onSubmit={save} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[1.75rem] bg-[#fffdf8] p-5 shadow-2xl sm:p-7">
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
    </dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-bold text-dark">{label}{children}</label>; }
