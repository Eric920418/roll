"use client";
import type { FlowData } from "@/lib/action-plan/flow/catalog";
import { OptionButtons, TextField } from "./Templates";

type Row = Extract<FlowData, { kind: "conversation" }>["records"][number];

export default function ConversationEditor({ row, locale, onChange }: { row: Row; locale: string; onChange(value: Row): void }) {
  const w = (zh: string, en: string) => locale === "zh-tw" ? zh : en;
  const update = (key: keyof Row, value: string) => onChange({ ...row, [key]: value });
  const severity = row.severityRating ?? ({low: 1, medium: 3, high: 5} as const)[row.severity as "low" | "medium" | "high"];
  return <div className="space-y-3" data-conversation-form>
    <div className="grid gap-3 sm:grid-cols-2">
      <fieldset className="min-w-0"><legend className="text-sm">{w("對象（公司／姓名）", "Participant (company / name)")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <TextField hideLabel label={w("公司", "Company")} placeholder={w("公司", "Company")} value={row.company} onChange={value => update("company", value)} />
          <TextField hideLabel label={w("對象姓名", "Person")} placeholder={w("姓名", "Name")} value={row.name} onChange={value => update("name", value)} />
        </div>
      </fieldset>
      <TextField label={w("日期", "Date")} type="date" value={row.date} onChange={value => update("date", value)} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <OptionButtons label={w("與你的關係", "Your relationship")} value={row.relationship} options={[["friend", w("親友", "Friends or family")], ["colleague", w("同事", "Colleague")], ["stranger", w("陌生人", "Stranger")], ["prospect", w("潛在客戶", "Prospect")]]} onChange={value => update("relationship", value)} />
      <OptionButtons label={w("是否符合目標客群", "Target customer fit")} value={row.fit || ""} options={[["yes", w("符合", "Fits")], ["possible", w("可能符合", "Possible fit")], ["uncertain", w("不確定", "Uncertain")], ...(row.fit === "no" ? [["no", w("不符合", "Not a fit")] as [string, string]] : [])]} onChange={value => update("fit", value)} />
    </div>
    <TextField label={w("目前的解決方式", "Current solution")} value={row.solution} onChange={value => update("solution", value)} />
    <TextField multiline label={w("主要痛點", "Main pain point")} value={row.pain} onChange={value => update("pain", value)} />
    <div className="grid gap-3 sm:grid-cols-2">
      <OptionButtons label={w("痛點嚴重度", "Pain severity")} value={severity ? String(severity) : ""} options={["1", "2", "3", "4", "5"].map(value => [value, value])} onChange={value => onChange({ ...row, severityRating: Number(value), severity: Number(value) < 3 ? "low" : Number(value) === 3 ? "medium" : "high" })} />
      <OptionButtons label={w("付費意願", "Willingness to pay")} value={row.wtp} options={[["willing", w("有意願", "Willing")], ["considering", w("評估中", "Considering")], ["declined", w("無意願", "Not willing")]]} onChange={value => update("wtp", value)} />
    </div>
  </div>;
}
