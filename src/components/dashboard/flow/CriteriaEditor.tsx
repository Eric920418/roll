"use client";
import { completedText } from "@/lib/action-plan/flow/evaluate";
import { useState } from "react";
import type { FlowData } from "@/lib/action-plan/flow/catalog";
import type { FlowView } from "@/lib/action-plan/flow/service";
import { TextField, button } from "./Templates";

type Data = Extract<FlowData, { kind: "organize" }>;
type Props = { data: Data; view: Pick<FlowView, "leads">; locale: string; readOnly?: boolean; disabled?: boolean; onChange(data: Data): void };

export function CriteriaTable({ data, view, locale, selected, onSelect }: Omit<Props, "onChange"> & { selected?: string; onSelect?(id: string): void }) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const willing = view.leads.filter(l => l.wtp === "willing");
  return <div className="overflow-x-auto rounded-2xl border border-dark/10 bg-white px-5">
    <table className="w-full min-w-125 text-left text-sm">
      <thead className="text-xs text-dark/50"><tr>{[w("條件", "Criterion"), w("權重", "Weight"), w("佐證", "Evidence"), w("狀態", "Status")].map(label => <th scope="col" key={label} className="border-b border-dark/10 py-4 pr-4 font-medium">{label}</th>)}</tr></thead>
      <tbody>{data.criteria.map(c => {
        const sources = new Set(c.sources.filter(id => view.leads.some(l => l.id === id))), count = willing.filter(l => sources.has(l.id)).length;
        return <tr key={c.id} aria-selected={selected === c.id} className="border-b border-dark/5 last:border-0">
          <th scope="row" className="w-[42%] py-1 pr-4 font-semibold"><button type="button" className="min-h-11 w-full py-3 text-left focus-visible:outline-2" onClick={() => onSelect?.(c.id)}>{c.label || w("未命名條件", "Untitled criterion")}</button></th>
          <td className="pr-4">{c.weight}%</td>
          <td className="pr-4"><div className="flex items-center gap-2"><progress aria-label={c.label + " · " + w("有付費意願的佐證", "Supporting willing participants")} className="h-1 w-20 shrink-0 appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-dark/10 [&::-webkit-progress-value]:bg-black [&::-moz-progress-bar]:bg-black" value={count} max={Math.max(1, willing.length)} /><span className="whitespace-nowrap text-xs">{count} / {willing.length}</span></div></td>
          <td><span className={"inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs " + (sources.size < 3 ? "bg-amber-50 text-amber-800" : c.confirmed && completedText(c.label) ? "bg-black text-white" : "bg-dark/5 text-dark/60")}>{sources.size < 3 ? w("觀察條件", "Observation") : c.confirmed && completedText(c.label) ? w("已確認", "Confirmed") : w("待確認", "To confirm")}</span></td>
        </tr>;
      })}</tbody>
    </table>
    {!data.criteria.length && <p className="py-5 text-sm text-dark/60">{w("尚未新增評分條件", "No qualification criteria yet")}</p>}
  </div>;
}

export default function CriteriaEditor({ data, view, locale, readOnly, disabled, onChange, selected, onSelect }: Props & { selected?: string; onSelect?(id: string): void }) {
  const [localSelection, setLocalSelection] = useState("");
  const active = data.criteria.find(c => c.id === (selected ?? localSelection)) || data.criteria[0];
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b;
  const select = onSelect || setLocalSelection;
  function update(patch: Partial<Data["criteria"][number]>) { if (active) onChange({ ...data, criteria: data.criteria.map(c => c.id === active.id ? { ...c, ...patch } : c) }); }
  const choice = "min-h-11 border border-dark/15 px-4 py-2 text-xs font-semibold first:rounded-l-lg last:rounded-r-lg focus-visible:outline-2";
  return <div className="space-y-4" data-criteria-editor>
    {active ? <fieldset disabled={disabled || readOnly} className="min-w-0 space-y-4">
      <TextField label={w("條件名稱", "Criterion name")} value={active.label} onChange={label => update({ label, confirmed: false })} />
      <div><p className="mb-1 text-sm">{w("判斷方式", "Assessment method")}</p><div className="flex flex-wrap" role="group" aria-label={w("判斷方式", "Assessment method")}>{([["boolean", w("是／否", "Yes / No")], ["range", w("數字範圍", "Number range")], ["level", w("高／中／低", "High / Medium / Low")]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={active.assessment === value} className={choice + (active.assessment === value ? " bg-black text-white" : " bg-white")} onClick={() => update({ assessment: value, confirmed: false })}>{label}</button>)}</div></div>
      <TextField label={w("在聯絡前如何查到", "How to check before contacting")} value={active.research || ""} onChange={research => update({ research, confirmed: false })} />
      <div><p className="mb-1 text-sm">{w("權重", "Weight")}</p><div className="flex flex-wrap" role="group" aria-label={w("權重", "Weight")}>{[...new Set([10, 20, 30, 40, active.weight])].sort((a, b) => a - b).map(weight => <button type="button" key={weight} aria-pressed={active.weight === weight} className={choice + (active.weight === weight ? " bg-black text-white" : " bg-white")} onClick={() => update({ weight, confirmed: false })}>{weight}%</button>)}</div></div>
      <TextField multiline label={w("依據", "Rationale")} value={active.rationale || ""} onChange={rationale => update({ rationale, confirmed: false })} />
      <details><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">{w("佐證與確認", "Evidence and confirmation")} · {new Set(active.sources).size}</summary>{view.leads.map(l => <label key={l.id} className="flex min-h-11 items-start gap-3 py-2 text-xs"><input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-black" checked={active.sources.includes(l.id)} onChange={e => update({ sources: e.target.checked ? [...new Set([...active.sources, l.id])] : active.sources.filter(id => id !== l.id), confirmed: false })} /><span>{l.company} · {l.name}<span className="mt-1 block text-dark/60">{l.pain}</span></span></label>)}
      <label className="flex min-h-11 items-center gap-3 text-xs"><input type="checkbox" className="h-5 w-5 shrink-0 accent-black" checked={active.confirmed} onChange={e => update({ confirmed: e.target.checked })} />{w("確認條件與權重", "Confirm criterion and weight")}</label>
      <button type="button" className="min-h-11 text-xs text-dark/60 underline" onClick={() => { onChange({ ...data, criteria: data.criteria.filter(c => c.id !== active.id) }); select(""); }}>{w("移除此條件", "Remove criterion")}</button><details><summary className="min-h-11 cursor-pointer py-3 text-xs text-dark/60">{w("其他權重", "Custom weight")}</summary><TextField type="number" label={w("自訂權重 %", "Custom weight %")} value={String(active.weight)} onChange={value => update({ weight: Math.max(1, Math.min(100, Math.round(Number(value) || 1))), confirmed: false })} /></details></details>
    </fieldset> : <p className="text-sm text-dark/60">{w("按「新增條件」開始建立評分標準。", "Choose Add criterion to build your qualification standard.")}</p>}
    {!onSelect && <><button type="button" className={button} disabled={disabled || readOnly || data.criteria.length >= 6} onClick={() => { const id = crypto.randomUUID(); onChange({ ...data, criteria: [...data.criteria, { id, label: "", weight: 10, sources: [], confirmed: false }] }); select(id); }}>{w("新增條件", "Add criterion")}</button><CriteriaTable data={data} view={view} locale={locale} selected={active?.id} onSelect={select} /></>}
  </div>;
}
