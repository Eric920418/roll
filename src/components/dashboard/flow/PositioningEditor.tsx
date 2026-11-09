"use client";
import { useState } from "react";
import type { FlowData } from "@/lib/action-plan/flow/catalog";
import { TextField, button } from "./Templates";
type Data = Extract<FlowData, { kind: "organize" }>;
export function positioningPreview(values: Record<string, string>, zh: boolean) {
  if (values.positioningMode === "direct") return "";
  const parts = ["positioningWho", "positioningWhen", "positioningPain", "positioningMethod"].map(key => values[key]?.trim());
  return parts.every(Boolean) ? zh ? `為${parts[0]}，在${parts[1]}時，解決${parts[2]}，透過${parts[3]}。` : `For ${parts[0]}, when ${parts[1]}, solve ${parts[2]} through ${parts[3]}.` : "";
}
export default function PositioningEditor({ data, locale, readOnly, onChange }: { data: Data; locale: string; readOnly?: boolean; onChange(data: Data): void }) {
  const zh = locale === "zh-tw", w = (a: string, b: string) => zh ? a : b, [editing, setEditing] = useState(false);
  const preview = positioningPreview(data.values, zh), statement = data.values.positioning || "";
  return <div className="space-y-4" data-positioning-editor>
    {[["positioningWho", w("目標客戶（誰）", "Target customer (who)")], ["positioningWhen", w("情境（什麼時候最痛）", "Situation (when it hurts)")], ["positioningPain", w("要解決的痛點", "Problem to solve")], ["positioningMethod", w("與現有做法的差別", "Difference from current solutions")]].map(([key, label]) => <TextField key={key} label={label} value={data.values[key] || ""} onChange={value => onChange({ ...data, values: { ...data.values, [key]: value, positioningMode: "structured" } })} />)}
    <div className="space-y-2"><p className="text-sm font-semibold">{w("預覽", "Preview")}</p><blockquote className="whitespace-pre-wrap break-words rounded-xl bg-black p-4 text-sm leading-7 text-white">{preview || statement || w("補上四個欄位，預覽你的定位。", "Complete the four fields to preview your statement.")}</blockquote></div>
    {preview && preview !== statement && <button type="button" className={button} onClick={() => onChange({ ...data, values: { ...data.values, positioning: preview, positioningMode: "direct" }, confirmed: data.confirmed.filter(key => key !== "positioning") })}>{w("套用預覽到定位草稿", "Apply preview to the positioning draft")}</button>}
    <details open={editing} onToggle={event => setEditing(event.currentTarget.open)}><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">{w("直接編輯一句話定位", "Edit the full positioning statement")}</summary><TextField multiline label={w("一句話定位", "Positioning statement")} value={statement} onChange={value => onChange({ ...data, values: { ...data.values, positioning: value, positioningMode: "direct" }, confirmed: data.confirmed.filter(key => key !== "positioning") })} /></details>
    {(!preview || preview === statement) && <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-black" disabled={readOnly} checked={data.confirmed.includes("positioning")} onChange={event => onChange({ ...data, confirmed: event.target.checked ? [...new Set([...data.confirmed, "positioning"])] : data.confirmed.filter(key => key !== "positioning") })} />{w("我已核對並確認這一項", "I reviewed and confirm this item")}</label>}
    {preview && preview !== statement && <p role="status" className="text-xs text-dark/60">{w("預覽尚未套用；已存定位與確認回覆不會改動。", "Preview not applied. Your saved statement and responses are retained.")}</p>}
  </div>;
}
